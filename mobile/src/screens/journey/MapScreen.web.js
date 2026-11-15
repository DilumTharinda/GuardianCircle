import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useUnsafeZones } from '../../hooks/useUnsafeZones';
import { subscribeToActiveEmergencyAlerts } from '../../services/alertService';
import ThemeToggle from '../../components/ThemeToggle';
import NotificationBell from '../../components/common/NotificationBell';
import { subscribeCircleMembersLocations } from '../../services/circleTrackingService';
import CircleMapTrackerBar from '../../components/journey/CircleMapTrackerBar';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const DEFAULT_CENTER = { lat: 6.9271, lng: 79.8612 }; // Colombo default

let mapsScriptLoadingPromise = null;
function loadGoogleMapsScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);

  if (!mapsScriptLoadingPromise) {
    mapsScriptLoadingPromise = new Promise((resolve, reject) => {
      // Dynamic Google Maps JS loader using loading=async best practice
      ((g) => {
        var h,
          a,
          k,
          p = 'The Google Maps JavaScript API',
          c = 'google',
          l = 'importLibrary',
          q = '__ib__',
          m = document,
          b = window;
        b = b[c] || (b[c] = {});
        var d = b.maps || (b.maps = {}),
          r = new Set(),
          e = new URLSearchParams(),
          u = () =>
            h ||
            (h = new Promise(async (f, n) => {
              await (a = m.createElement('script'));
              e.set('libraries', [...r] + '');
              for (k in g)
                e.set(
                  k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()),
                  g[k]
                );
              e.set('callback', c + '.maps.' + q);
              a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
              d[q] = f;
              a.onerror = () => (h = n(Error(p + ' could not load.')));
              a.nonce = m.querySelector('script[nonce]')?.nonce || '';
              m.head.append(a);
            }));
        d[l]
          ? console.warn(p + ' only loads once. Ignoring:', g)
          : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)));
      })({
        key: GOOGLE_MAPS_API_KEY,
        v: 'weekly',
      });

      window.google.maps
        .importLibrary('maps')
        .then(() => Promise.all([window.google.maps.importLibrary('marker'), window.google.maps.importLibrary('places')]))
        .then(() => resolve(window.google.maps))
        .catch((err) => reject(err));
    });
  }
  return mapsScriptLoadingPromise;
}

export default function MapScreenWeb({ navigation, route }) {
  const { user } = useAuth();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [userLocation, setUserLocation] = useState(DEFAULT_CENTER);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeEmergencyAlerts, setActiveEmergencyAlerts] = useState([]);

  // Circle tracking state
  const [activeCircleTracker, setActiveCircleTracker] = useState(
    route?.params?.selectedCircleId
      ? {
          circleId: route.params.selectedCircleId,
          circleName: route.params.selectedCircleName,
          memberUids: route.params.memberUids || [],
        }
      : null
  );
  const [circleMembersLocations, setCircleMembersLocations] = useState([]);

  useEffect(() => {
    if (route?.params?.selectedCircleId) {
      setActiveCircleTracker({
        circleId: route.params.selectedCircleId,
        circleName: route.params.selectedCircleName,
        memberUids: route.params.memberUids || [],
      });
    }
  }, [route?.params?.selectedCircleId, route?.params?.selectedCircleName]);

  useEffect(() => {
    if (!activeCircleTracker?.memberUids || activeCircleTracker.memberUids.length === 0) {
      setCircleMembersLocations([]);
      return;
    }
    const otherMemberUids = activeCircleTracker.memberUids.filter((uid) => uid !== user?.uid);
    const unsub = subscribeCircleMembersLocations(otherMemberUids, (locations) => {
      setCircleMembersLocations(locations);
    });
    return () => unsub?.();
  }, [activeCircleTracker, user?.uid]);

  const unsafeZones = useUnsafeZones(user?.uid, true);

  // 1. Get browser geolocation
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter(loc);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // 2. Load Google Maps Web SDK
  useEffect(() => {
    loadGoogleMapsScript()
      .then(() => {
        setMapLoaded(true);
      })
      .catch((err) => {
        console.warn('[MapScreenWeb] Google Maps SDK load error:', err);
        setLoadError(err?.message || 'Failed to load Google Maps SDK');
      });
  }, []);

  // 3. Initialize Google Map
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || mapInstanceRef.current) return;
    if (!window.google?.maps) return;

    let isCancelled = false;

    async function initMap() {
      try {
        let MapClass = window.google.maps.Map;
        if (!MapClass && window.google.maps.importLibrary) {
          const { Map } = await window.google.maps.importLibrary('maps');
          MapClass = Map;
        }

        if (isCancelled || !mapContainerRef.current || mapInstanceRef.current) return;

        if (typeof MapClass === 'function') {
          const map = new MapClass(mapContainerRef.current, {
            center: userLocation,
            zoom: 15,
            mapId: 'DEMO_MAP_ID',
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            zoomControl: true,
          });
          mapInstanceRef.current = map;
        }
      } catch (e) {
        console.warn('[MapScreenWeb] Map init error:', e);
      }
    }

    initMap();

    return () => {
      isCancelled = true;
    };
  }, [mapLoaded, userLocation]);

  // 4. Subscribe to active emergency SOS alerts
  useEffect(() => {
    const unsub = subscribeToActiveEmergencyAlerts((alerts) => {
      setActiveEmergencyAlerts(alerts);
    });
    return () => unsub?.();
  }, []);

  // 5. Update Markers (User location, unsafe zones, emergency SOS) using AdvancedMarkerElement when available
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !window.google.maps) return;

    // Clear previous markers
    markersRef.current.forEach((m) => {
      if (m.setMap) m.setMap(null);
      else if (m.map) m.map = null;
    });
    markersRef.current = [];

    const map = mapInstanceRef.current;
    const AdvancedMarker = window.google.maps.marker?.AdvancedMarkerElement;

    // Helper to create marker (prefers AdvancedMarkerElement to suppress deprecation warning)
    const createMarker = ({ position, title, contentHtml, pinBgColor, glyphText }) => {
      if (AdvancedMarker) {
        let markerContent;
        if (contentHtml) {
          const div = document.createElement('div');
          div.innerHTML = contentHtml;
          markerContent = div;
        } else if (window.google.maps.marker?.PinElement) {
          const pin = new window.google.maps.marker.PinElement({
            background: pinBgColor || '#00897B',
            borderColor: '#FFFFFF',
            glyphColor: '#FFFFFF',
            glyphText: glyphText || '',
          });
          markerContent = pin;
        }

        const advMarker = new AdvancedMarker({
          map,
          position,
          title,
          content: markerContent,
          gmpClickable: true,
        });
        return advMarker;
      }

      // Legacy fallback
      return new window.google.maps.Marker({
        position,
        map,
        title,
      });
    };

    // A. User marker
    if (userLocation) {
      let userMarker;
      if (activeCircleTracker) {
        // When active circle tracker is on, show "You" label on top of icon
        const youHtml = `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(-8px);">
            <div style="background:rgba(0,0,0,0.8);color:#FFF;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;border:1px solid rgba(255,255,255,0.4);box-shadow:0 1px 4px rgba(0,0,0,0.4);margin-bottom:3px;white-space:nowrap;">
              You
            </div>
            <div style="width:36px;height:36px;border-radius:18px;background:rgba(255,255,255,0.95);box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;border:2px solid #FFF;">
              <span style="font-size:18px;">🚶</span>
            </div>
          </div>
        `;
        userMarker = createMarker({
          position: userLocation,
          title: 'You (My Location)',
          contentHtml: youHtml,
        });
      } else {
        userMarker = createMarker({
          position: userLocation,
          title: 'You are here',
          pinBgColor: '#00897B',
          glyphText: '•',
        });
      }
      markersRef.current.push(userMarker);
    }

    // B. Unsafe Location Markers
    if (unsafeZones?.points && Array.isArray(unsafeZones.points)) {
      unsafeZones.points.forEach((pt) => {
        const marker = createMarker({
          position: { lat: pt.latitude, lng: pt.longitude },
          title: `⚠️ Reported Unsafe (${pt.weight || 1} report${(pt.weight || 1) > 1 ? 's' : ''})`,
          pinBgColor: '#F44336',
          glyphText: '!',
        });
        const info = new window.google.maps.InfoWindow({
          content: `<div style="padding:6px;font-family:sans-serif;"><b>⚠️ Unsafe Location</b><p style="margin:4px 0 0;font-size:12px;color:#555;">Reported ${pt.weight || 1} time(s) as unsafe. Stay alert.</p></div>`,
        });
        if (marker.addEventListener) {
          marker.addEventListener('gmp-click', () => info.open(map, marker));
        } else if (marker.addListener) {
          marker.addListener('click', () => info.open(map, marker));
        }
        markersRef.current.push(marker);
      });
    }

    // C. Active Emergency SOS Markers
    if (activeEmergencyAlerts && Array.isArray(activeEmergencyAlerts)) {
      activeEmergencyAlerts.forEach((alert) => {
        if (!alert || (alert.status && alert.status !== 'active')) return;
        const loc = alert.location || {};
        const lat = typeof loc.latitude === 'number' ? loc.latitude : loc.lat;
        const lng = typeof loc.longitude === 'number' ? loc.longitude : loc.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;

        const emergencyMarker = createMarker({
          position: { lat, lng },
          title: `🚨 Emergency SOS: ${alert.userName || 'Community Member'}`,
          contentHtml: `<div style="cursor:pointer;background:#D32F2F;color:#FFF;padding:6px 10px;border-radius:18px;font-weight:bold;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;border:2px solid #FFF;">🚨 SOS</div>`,
        });

        const info = new window.google.maps.InfoWindow({
          content: `<div style="padding:6px;font-family:sans-serif;"><b style="color:#D32F2F;">🚨 Active Emergency SOS</b><p style="margin:4px 0 0;font-size:12px;color:#333;"><b>User:</b> ${alert.userName || 'Member'}</p><p style="margin:2px 0 0;font-size:11px;color:#666;">${loc.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</p></div>`,
        });
        if (emergencyMarker.addEventListener) {
          emergencyMarker.addEventListener('gmp-click', () => info.open(map, emergencyMarker));
        } else if (emergencyMarker.addListener) {
          emergencyMarker.addListener('click', () => info.open(map, emergencyMarker));
        }
        markersRef.current.push(emergencyMarker);
      });
    }

    // D. Active Trusted Circle Members Live Tracking (Matching same human icon, yellow color #FFD600, with Display Name on top)
    if (activeCircleTracker && circleMembersLocations.length > 0) {
      // Ensure blink keyframe is injected once in document head
      if (typeof document !== 'undefined' && !document.getElementById('circle-member-blink-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'circle-member-blink-style';
        styleEl.textContent = `
          @keyframes offlineMemberBlink {
            0%, 100% { opacity: 1.0; }
            50% { opacity: 0.25; }
          }
          .offline-blink-marker {
            animation: offlineMemberBlink 1.2s infinite ease-in-out;
          }
        `;
        document.head.appendChild(styleEl);
      }

      circleMembersLocations.forEach((member) => {
        const memberName = member.displayName || 'Member';
        const blinkClass = !member.isOnline ? 'offline-blink-marker' : '';
        const memberHtml = `
          <div class="${blinkClass}" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(-8px);">
            <div style="background:rgba(0,0,0,0.8);color:#FFD600;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;border:1px solid rgba(255,214,0,0.5);box-shadow:0 1px 4px rgba(0,0,0,0.4);margin-bottom:3px;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis;">
              ${memberName}
            </div>
            <div style="width:36px;height:36px;border-radius:18px;background:#FFD600;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;border:2px solid #FFF;">
              <span style="font-size:18px;">${member.isMoving ? '🚶' : '🧍'}</span>
            </div>
          </div>
        `;

        const marker = createMarker({
          position: { lat: member.latitude, lng: member.longitude },
          title: `👤 ${memberName} (${!member.isOnline ? 'Offline' : (member.isMoving ? 'Moving' : 'Stationary')})`,
          contentHtml: memberHtml,
        });

        const statusText = !member.isOnline
          ? '⚠️ Offline'
          : member.isMoving
          ? '🚶 Walking / In Motion'
          : '🧍 Stationary';

        const statusBg = member.isOnline ? '#E8F5E9' : '#FFF8E1';
        const statusColor = member.isOnline ? '#2E7D32' : '#F57F17';

        const info = new window.google.maps.InfoWindow({
          content: `
            <div style="padding:10px 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:210px;text-align:center;">
              <div style="font-weight:700;font-size:14px;color:#1B2E24;margin-bottom:6px;">👤 ${memberName}</div>
              <div style="display:inline-block;padding:4px 8px;border-radius:12px;background:${statusBg};color:${statusColor};font-size:11px;font-weight:600;margin-bottom:10px;">
                ${statusText}
              </div>
              <div>
                <button
                  id="nav-to-${member.uid}"
                  style="width:100%;padding:7px 12px;background:linear-gradient(135deg, #00897B, #004D40);color:#FFF;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;"
                >
                  <span>🧭</span> Navigate
                </button>
              </div>
            </div>
          `,
        });

        // Attach navigate click when InfoWindow DOM is ready
        window.google.maps.event.addListener(info, 'domready', () => {
          const btn = document.getElementById(`nav-to-${member.uid}`);
          if (btn) {
            btn.onclick = () => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.panTo({ lat: member.latitude, lng: member.longitude });
                mapInstanceRef.current.setZoom(17);
              }
              info.close();
            };
          }
        });

        if (marker.addEventListener) {
          marker.addEventListener('gmp-click', () => info.open(map, marker));
        } else if (marker.addListener) {
          marker.addListener('click', () => info.open(map, marker));
        }
        markersRef.current.push(marker);
      });
    }
  }, [mapLoaded, userLocation, unsafeZones.points, activeEmergencyAlerts, activeCircleTracker, circleMembersLocations]);

  const handleCenterUser = () => {
    if (mapInstanceRef.current && userLocation) {
      mapInstanceRef.current.setCenter(userLocation);
      mapInstanceRef.current.setZoom(16);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !mapInstanceRef.current) return;
    const clean = searchQuery.trim();

    try {
      // 100% Free geocoding via OpenStreetMap Nominatim (requires no Google Cloud billing account)
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(clean)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GuardianCircle/1.0',
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          mapInstanceRef.current.setCenter({ lat, lng });
          mapInstanceRef.current.setZoom(16);
          return;
        }
      }
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.alert('Location not found. Try searching with a city or landmark name.');
    }
  };

  return (
    <View style={styles.root}>
      {/* Search Header Bar */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#666" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search destination or address..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#888" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
        <ThemeToggle iconColor="#1A237E" style={{ marginLeft: 8 }} />
        <NotificationBell iconColor="#1A237E" size={22} />
      </View>

      {/* Active Trusted Circle Tracker Bar */}
      {activeCircleTracker && (
        <CircleMapTrackerBar
          circleName={activeCircleTracker.circleName}
          memberCount={circleMembersLocations.length + 1}
          onClose={() => {
            setActiveCircleTracker(null);
            setCircleMembersLocations([]);
          }}
          onChangeCircle={() => {
            navigation.navigate('TrustedCircle');
          }}
        />
      )}

      {/* Map View Port */}
      <View style={styles.mapContainer}>
        {loadError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#D32F2F" />
            <Text style={styles.errorTitle}>Could Not Load Google Maps</Text>
            <Text style={styles.errorSub}>{loadError}</Text>
          </View>
        ) : !mapLoaded ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00897B" />
            <Text style={styles.loadingText}>Loading Google Maps...</Text>
          </View>
        ) : null}

        {/* DOM node for Google Maps */}
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: mapLoaded ? 'block' : 'none',
          }}
        />

        {/* Recenter Button */}
        {mapLoaded && (
          <TouchableOpacity style={styles.recenterBtn} onPress={handleCenterUser} activeOpacity={0.85}>
            <Ionicons name="locate" size={24} color="#00897B" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    zIndex: 10,
    elevation: 4,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#212121',
    outlineStyle: 'none',
  },
  searchBtn: {
    marginLeft: 8,
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#00897B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#E8EAED',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D32F2F',
    marginTop: 12,
  },
  errorSub: {
    fontSize: 13,
    color: '#777',
    marginTop: 6,
    textAlign: 'center',
  },
  recenterBtn: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 5,
    cursor: 'pointer',
  },
});
