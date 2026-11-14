/**
 * GuardianCircle — MapScreen.js
 *
 * FINAL STABLE VERSION.
 * Fixes the "Empty Screen" issue by ensuring layout stability and forced dimensions.
 * Retains ALL requested features: Rotation, Markers, Reporting, and Compass.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  DeviceEventEmitter,
  Dimensions,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Magnetometer, Accelerometer } from 'expo-sensors';

import { getForegroundLocationSnapshot, DEFAULT_COORDS } from '../../services/locationService';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { DARK_MAP_STYLE } from '../../constants/mapStyles';
import { useUnsafeZones } from '../../hooks/useUnsafeZones';
import { FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import UnsafeLocationReportModal from '../../components/journey/UnsafeLocationReportModal';
import { getRouteCandidates, rankRouteCandidates } from '../../services/saferRouteService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

let MapView = null;
let Marker = null;
let Polyline = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default || Maps;
    Marker = Maps.Marker;
    Polyline = Maps.Polyline;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
  } catch (e) {
    console.warn('[MapScreen] Map library not loaded:', e.message);
  }
}

// Calculate precise distance between two coordinates in meters
function getCoordsDistanceMeters(c1, c2) {
  if (!c1 || !c2 || !Number.isFinite(c1.latitude) || !Number.isFinite(c2.latitude)) return 0;
  const dLat = (c1.latitude - c2.latitude) * 111320;
  const dLng = (c1.longitude - c2.longitude) * 111320 * Math.cos(c1.latitude * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Geocode search query (city, shop, landmark, address) into coordinates
async function searchPlaceCoordinates(query) {
  if (!query || typeof query !== 'string' || !query.trim()) return null;
  const clean = query.trim();

  // 1. Try native Expo Location geocoder (uses Google Play Services / Apple Maps)
  try {
    const results = await Location.geocodeAsync(clean);
    if (results && results.length > 0 && typeof results[0].latitude === 'number') {
      return {
        latitude: results[0].latitude,
        longitude: results[0].longitude,
        name: clean,
      };
    }
  } catch (_) {}

  // 2. Reliable fallback to OpenStreetMap Nominatim geocoding API
  try {
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
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
          name: data[0].display_name ? data[0].display_name.split(',')[0].trim() : clean,
        };
      }
    }
  } catch (_) {}

  return null;
}

// Fetch fast auto-suggestions matching places as user types (cities, shops, places)
async function fetchPlaceSuggestions(query) {
  if (!query || query.trim().length < 2) return [];
  const clean = query.trim();

  // 1. Try Photon autocomplete API (designed for instant typing search)
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=4`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features) && data.features.length > 0) {
        return data.features.map((f) => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [];
          const subtitleParts = [p.street, p.city || p.locality || p.district, p.country].filter(Boolean);
          return {
            title: p.name || clean,
            subtitle: subtitleParts.join(', '),
            latitude: coords[1],
            longitude: coords[0],
            type: p.osm_value || p.type || 'place',
          };
        }).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
      }
    }
  } catch (_) {}

  // 2. Reliable fallback to OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(clean)}&format=json&limit=4&addressdetails=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'GuardianCircle/1.0', Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item) => {
          const parts = (item.display_name || '').split(',');
          return {
            title: parts[0]?.trim() || clean,
            subtitle: parts.slice(1, 3).join(',').trim(),
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
            type: item.type || 'place',
          };
        }).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
      }
    }
  } catch (_) {}

  return [];
}

// Dynamic multi-tier zoom sizing matching map objects and roads
function getZoomMetrics(level) {
  switch (level) {
    case 5: // Very close street / road view (< 0.003 delta)
      return { level: 5, humanSize: 52, warningSize: 32, badgeSize: 64, ringD: 64, containerSize: 154 };
    case 4: // Close street / neighborhood (< 0.008 delta)
      return { level: 4, humanSize: 46, warningSize: 28, badgeSize: 54, ringD: 54, containerSize: 130 };
    case 3: // Suburb / standard default (< 0.025 delta)
      return { level: 3, humanSize: 40, warningSize: 24, badgeSize: 48, ringD: 48, containerSize: 116 };
    case 2: // City view (< 0.08 delta)
      return { level: 2, humanSize: 34, warningSize: 20, badgeSize: 40, ringD: 40, containerSize: 96 };
    case 1: // State / country view (>= 0.08 delta)
    default:
      return { level: 1, humanSize: 28, warningSize: 16, badgeSize: 34, ringD: 34, containerSize: 82 };
  }
}

export default function MapScreen({ navigation, route }) {
  const { user } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();

  // State
  const [locationState, setLocationState] = useState({ status: 'loading' });
  const [reportOpen, setReportOpen] = useState(false);
  const [heading, setHeading] = useState(0);
  const [headingMode, setHeadingMode] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const [zoomMetrics, setZoomMetrics] = useState(() => getZoomMetrics(3));
  const lastZoomLevel = useRef(3);

  // Search Place & Safest Route State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounceTimer = useRef(null);
  const [searchLocation, setSearchLocation] = useState(null); // { latitude, longitude, name }
  const [activeRoute, setActiveRoute] = useState(null); // { coordinates, distance, duration, safetyLabel, name }

  // Open half window for unsafe location reporting when double-tapped on Map tab icon
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('OPEN_UNSAFE_REPORT', () => {
      setReportOpen(true);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (route?.params?.openReport) {
      setReportOpen(true);
      navigation?.setParams?.({ openReport: undefined });
    }
    if (route?.params?.destination) {
      const dest = route.params.destination;
      navigation?.setParams?.({ destination: undefined });
      if (dest && typeof dest.latitude === 'number' && typeof dest.longitude === 'number') {
        setTimeout(() => {
          handleRouteToDestination(dest);
        }, 350);
      }
    }
  }, [route?.params?.openReport, route?.params?.destination, navigation, handleRouteToDestination]);

  const mapRef = useRef(null);
  const headingSubscription = useRef(null);
  const lastHeadingUpdate = useRef(0);
  const lastHeadingVal = useRef(0);

  const mapAvailable = MapView && Marker && Platform.OS !== 'web';
  const unsafeZones = useUnsafeZones(user?.uid, true);

  // ── Animated Rings Moving Out (like HomeScreen SOS waves) ───────────────────
  const ring1Scale = useRef(new Animated.Value(1.0)).current;
  const ring1Opacity = useRef(new Animated.Value(0.85)).current;
  const ring2Scale = useRef(new Animated.Value(1.0)).current;
  const ring2Opacity = useRef(new Animated.Value(0.65)).current;
  const coreScale = useRef(new Animated.Value(1.0)).current;

  useEffect(() => {
    let isMounted = true;
    const pulseSOS = () => {
      if (!isMounted) return;
      Animated.parallel([
        // Subtle core icon breathing (1.0 -> 1.07 -> 1.0)
        Animated.sequence([
          Animated.timing(coreScale, { toValue: 1.07, duration: 1200, useNativeDriver: false }),
          Animated.timing(coreScale, { toValue: 1.0, duration: 1200, useNativeDriver: false }),
        ]),
        // Ring 1 (inner ripple) — expands outward from 1.0 to 1.95, fading out
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ring1Scale, { toValue: 1.95, duration: 1200, useNativeDriver: false }),
            Animated.timing(ring1Opacity, { toValue: 0.0, duration: 1200, useNativeDriver: false }),
          ]),
          Animated.parallel([
            Animated.timing(ring1Scale, { toValue: 1.0, duration: 0, useNativeDriver: false }),
            Animated.timing(ring1Opacity, { toValue: 0.85, duration: 0, useNativeDriver: false }),
          ]),
        ]),
        // Ring 2 (outer ripple) — offset by 550ms like HomeScreen SOS waves
        Animated.sequence([
          Animated.delay(550),
          Animated.parallel([
            Animated.timing(ring2Scale, { toValue: 2.30, duration: 1200, useNativeDriver: false }),
            Animated.timing(ring2Opacity, { toValue: 0.0, duration: 1200, useNativeDriver: false }),
          ]),
          Animated.parallel([
            Animated.timing(ring2Scale, { toValue: 1.0, duration: 0, useNativeDriver: false }),
            Animated.timing(ring2Opacity, { toValue: 0.65, duration: 0, useNativeDriver: false }),
          ]),
        ]),
      ]).start(() => {
        if (isMounted) pulseSOS();
      });
    };

    pulseSOS();
    return () => {
      isMounted = false;
    };
  }, [ring1Scale, ring1Opacity, ring2Scale, ring2Opacity, coreScale]);

  // ── Two-Finger Pinch Zoom Detection & Dynamic Circle Buttons ────────────────
  const [zoomButtonsVisible, setZoomButtonsVisible] = useState(false);
  const zoomButtonsAnim = useRef(new Animated.Value(0)).current;
  const zoomHideTimer = useRef(null);
  const currentRegionRef = useRef(null);
  const initialPinchDist = useRef(null);

  const showZoomButtons = useCallback(() => {
    setZoomButtonsVisible(true);
    Animated.timing(zoomButtonsAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    if (zoomHideTimer.current) {
      clearTimeout(zoomHideTimer.current);
    }
    // Automatically hide after 2.5 seconds of inactivity
    zoomHideTimer.current = setTimeout(() => {
      Animated.timing(zoomButtonsAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setZoomButtonsVisible(false);
      });
    }, 2500);
  }, [zoomButtonsAnim]);

  useEffect(() => {
    return () => {
      if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current);
    };
  }, []);

  // ONLY detect two-finger pinch-in / pinch-out gestures (spreading or pinching fingers)
  // Movement, rotation, single-finger panning, and compass updates will NEVER trigger this.
  const handleTouchStart = useCallback((e) => {
    const touches = e?.nativeEvent?.touches;
    if (touches && touches.length === 2) {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      initialPinchDist.current = Math.sqrt(dx * dx + dy * dy);
    } else {
      initialPinchDist.current = null;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    const touches = e?.nativeEvent?.touches;
    if (touches && touches.length === 2 && initialPinchDist.current !== null) {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      const currentDist = Math.sqrt(dx * dx + dy * dy);
      const delta = Math.abs(currentDist - initialPinchDist.current);

      // Only show buttons when user actively pinches or spreads two fingers (distance delta > 18px).
      // Twisting two fingers (rotation) or holding them in place keeps distance constant and does NOT show buttons.
      if (delta > 18) {
        showZoomButtons();
      }
    }
  }, [showZoomButtons]);

  const handleTouchEnd = useCallback((e) => {
    const touches = e?.nativeEvent?.touches;
    if (!touches || touches.length < 2) {
      initialPinchDist.current = null;
    }
  }, []);

  const handleZoomIn = useCallback(async () => {
    showZoomButtons();
    if (!mapRef.current) return;
    try {
      const camera = await mapRef.current.getCamera();
      if (camera && typeof camera.zoom === 'number') {
        mapRef.current.animateCamera({ zoom: Math.min(camera.zoom + 1, 20) }, { duration: 250 });
        return;
      }
    } catch (_) {}
    if (currentRegionRef.current) {
      const { latitude, longitude, latitudeDelta, longitudeDelta } = currentRegionRef.current;
      mapRef.current.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: Math.max(latitudeDelta / 2, 0.0005),
        longitudeDelta: Math.max(longitudeDelta / 2, 0.0005),
      }, 250);
    }
  }, [showZoomButtons]);

  const handleZoomOut = useCallback(async () => {
    showZoomButtons();
    if (!mapRef.current) return;
    try {
      const camera = await mapRef.current.getCamera();
      if (camera && typeof camera.zoom === 'number') {
        mapRef.current.animateCamera({ zoom: Math.max(camera.zoom - 1, 2) }, { duration: 250 });
        return;
      }
    } catch (_) {}
    if (currentRegionRef.current) {
      const { latitude, longitude, latitudeDelta, longitudeDelta } = currentRegionRef.current;
      mapRef.current.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: Math.min(latitudeDelta * 2, 1.0),
        longitudeDelta: Math.min(longitudeDelta * 2, 1.0),
      }, 250);
    }
  }, [showZoomButtons]);

  const handleRegionChange = useCallback((currentRegion) => {
    if (!currentRegion?.latitudeDelta) return;
    currentRegionRef.current = currentRegion;

    const delta = Math.max(currentRegion.latitudeDelta, 0.0005);

    let newLevel = 3;
    if (delta < 0.003) newLevel = 5;
    else if (delta < 0.008) newLevel = 4;
    else if (delta < 0.025) newLevel = 3;
    else if (delta < 0.08) newLevel = 2;
    else newLevel = 1;

    if (newLevel !== lastZoomLevel.current) {
      lastZoomLevel.current = newLevel;
      setZoomMetrics(getZoomMetrics(newLevel));
    }
  }, []);

  // ── Location Handling & Live Movement Tracking ────────────────────────────────
  const locationSubscription = useRef(null);
  const accelSubscription = useRef(null);
  const lastCoords = useRef(null);
  const lastStepTime = useRef(0);
  const motionStartTime = useRef(0);
  const cadenceStepCount = useRef(0);
  const stationaryAnchor = useRef(null);
  const idleCheckInterval = useRef(null);

  // Rapid & reliable movement detection
  const onCadenceStep = useCallback((now) => {
    lastStepTime.current = now;
    cadenceStepCount.current += 1;

    if (!motionStartTime.current) {
      motionStartTime.current = now;
      cadenceStepCount.current = 1;
      if (!stationaryAnchor.current && lastCoords.current) {
        stationaryAnchor.current = { ...lastCoords.current };
      }
    }

    const durationMs = now - motionStartTime.current;
    const distFromAnchor = stationaryAnchor.current && lastCoords.current
      ? getCoordsDistanceMeters(lastCoords.current, stationaryAnchor.current)
      : 0;

    // Average walking stride length is ~0.75m per step
    const totalDistMoved = Math.max(distFromAnchor, cadenceStepCount.current * 0.75);

    // Prompt transition to walking once duration >= 2.0s AND distance >= 1.5m
    if (durationMs >= 2000 && totalDistMoved >= 1.5) {
      setIsMoving((prev) => {
        if (!prev) return true;
        return prev;
      });
    }
  }, []);

  const onGpsLocation = useCallback((currentFix, speed) => {
    const now = Date.now();
    const prevFix = lastCoords.current;
    const distBetweenFixes = prevFix ? getCoordsDistanceMeters(currentFix, prevFix) : 0;
    lastCoords.current = currentFix;

    if (!stationaryAnchor.current) {
      stationaryAnchor.current = { ...currentFix };
    }

    const distFromAnchor = getCoordsDistanceMeters(currentFix, stationaryAnchor.current);

    // If currently stopped:
    if (!motionStartTime.current && distFromAnchor >= 1.0) {
      motionStartTime.current = now - 1000;
    }

    if (distFromAnchor >= 1.5) {
      if (!motionStartTime.current) motionStartTime.current = now - 1500;
      const durationMs = now - motionStartTime.current;
      if (durationMs >= 2000) {
        setIsMoving((prev) => {
          if (!prev) return true;
          return prev;
        });
      }
    }

    // While walking: only refresh lastStepTime if user is ACTIVELY traveling between fixes
    if (distBetweenFixes > 0.35 || (typeof speed === 'number' && speed > 0.3)) {
      lastStepTime.current = now;
    }
  }, []);

  const loadLocation = useCallback(async () => {
    setLocationState({ status: 'loading' });
    try {
      const result = await getForegroundLocationSnapshot();
      if (result.status === 'success') {
        setLocationState(result);
        const fix = { latitude: result.latitude, longitude: result.longitude, time: Date.now() };
        lastCoords.current = fix;
        stationaryAnchor.current = fix;
      } else {
        const fallback = {
          status: 'success',
          latitude: DEFAULT_COORDS.latitude,
          longitude: DEFAULT_COORDS.longitude,
          time: Date.now(),
        };
        setLocationState(fallback);
        lastCoords.current = fallback;
        stationaryAnchor.current = fallback;
      }
    } catch (e) {
      const fallback = {
        status: 'success',
        latitude: DEFAULT_COORDS.latitude,
        longitude: DEFAULT_COORDS.longitude,
        time: Date.now(),
      };
      setLocationState(fallback);
      lastCoords.current = fallback;
      stationaryAnchor.current = fallback;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!mapAvailable) return;
      loadLocation();

      let isMounted = true;

      // 1. High-Precision Accelerometer Cadence Detection
      // Catches natural walking steps (spread >= 0.09g spaced >= 320ms apart)
      async function startAccelerometer() {
        try {
          const available = await Accelerometer.isAvailableAsync().catch(() => false);
          if (!available || !isMounted) return;

          Accelerometer.setUpdateInterval(100);

          const MAG_BUFFER_LEN = 6;
          const magHistory = [];
          let lastCadenceTime = 0;

          const sub = Accelerometer.addListener((data) => {
            if (!isMounted || !data) return;
            const { x, y, z } = data;

            let mag = Math.sqrt(x * x + y * y + z * z);
            if (mag > 4.0) {
              mag = mag / 9.80665;
            }

            magHistory.push(mag);
            if (magHistory.length > MAG_BUFFER_LEN) magHistory.shift();

            let spread = 0;
            if (magHistory.length >= 4) {
              let min = magHistory[0];
              let max = magHistory[0];
              for (let i = 1; i < magHistory.length; i++) {
                if (magHistory[i] < min) min = magHistory[i];
                if (magHistory[i] > max) max = magHistory[i];
              }
              spread = max - min;
            }

            const now = Date.now();
            const timeSinceLast = now - lastCadenceTime;

            // Real walking cadence: peak-to-peak spread in 400ms buffer is >= 0.09g
            // Hand holding produces < 0.03g; walking steps produce 0.10g - 0.25g
            if (spread >= 0.09 && (timeSinceLast >= 320 || lastCadenceTime === 0)) {
              lastCadenceTime = now;
              onCadenceStep(now);
            }
          });
          accelSubscription.current = sub;
        } catch (err) {
          console.warn('[MapScreen] Accelerometer error:', err?.message);
        }
      }

      // 2. High-Precision GPS Position & Distance Delta Tracking
      async function startWatchingPosition() {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const sub = await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.High,
                timeInterval: 800,
                distanceInterval: 0.1,
              },
              (pos) => {
                if (!isMounted || !pos?.coords) return;
                const { latitude, longitude, speed } = pos.coords;
                const now = Date.now();
                const currentFix = { latitude, longitude, time: now };

                setLocationState((prev) => ({
                  ...prev,
                  status: 'success',
                  latitude,
                  longitude,
                }));

                onGpsLocation(currentFix, speed);
              }
            );
            locationSubscription.current = sub;
          }
        } catch (_) {}
      }

      // 3. Fast Stop & Stationary Checker (runs every 200ms)
      idleCheckInterval.current = setInterval(() => {
        if (!isMounted) return;
        const now = Date.now();
        const timeSinceLastMotion = now - lastStepTime.current;

        // When user stops walking:
        // Promptly switches to stop icon within 1.0 second of no walking steps
        if (timeSinceLastMotion >= 1000) {
          setIsMoving((prev) => {
            if (prev) {
              motionStartTime.current = 0;
              cadenceStepCount.current = 0;
              if (lastCoords.current) {
                stationaryAnchor.current = { ...lastCoords.current };
              }
              return false;
            }
            return prev;
          });
        }

        // If stationary and motion paused for >= 700ms before reaching 2.0s / 1.5m:
        // Reset motionStartTime so small twitches don't accumulate
        if (timeSinceLastMotion >= 700 && motionStartTime.current > 0) {
          motionStartTime.current = 0;
          cadenceStepCount.current = 0;
        }
      }, 200);

      startAccelerometer();
      startWatchingPosition();

      return () => {
        isMounted = false;
        if (idleCheckInterval.current) {
          clearInterval(idleCheckInterval.current);
          idleCheckInterval.current = null;
        }
        if (locationSubscription.current) {
          if (typeof locationSubscription.current.remove === 'function') {
            locationSubscription.current.remove();
          }
          locationSubscription.current = null;
        }
        if (accelSubscription.current) {
          if (typeof accelSubscription.current.remove === 'function') {
            accelSubscription.current.remove();
          }
          accelSubscription.current = null;
        }
      };
    }, [loadLocation, mapAvailable, onCadenceStep, onGpsLocation]),
  );

  // ── Compass & Rotation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!focused || !mapAvailable) return;

    let isMounted = true;

    async function startCompass() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const sub = await Location.watchHeadingAsync((headingData) => {
            if (!isMounted) return;
            const h = headingData.trueHeading >= 0 ? headingData.trueHeading : headingData.magHeading;
            if (Number.isFinite(h)) handleNewHeading(Math.round(h));
          });
          headingSubscription.current = sub;
          return;
        }
      } catch (err) {
        console.warn('[MapScreen] watchHeadingAsync fallback:', err?.message);
      }

      try {
        Magnetometer.setUpdateInterval(150);
        const sub = Magnetometer.addListener((data) => {
          if (!isMounted || !data) return;
          const { x, y } = data;
          let angle = Math.atan2(y, x) * (180 / Math.PI);
          let deg = Math.round(90 - angle);
          if (deg < 0) deg += 360;
          handleNewHeading(deg);
        });
        headingSubscription.current = sub;
      } catch (err) {
        console.warn('[MapScreen] Magnetometer fallback failed:', err?.message);
      }
    }

    function handleNewHeading(newDeg) {
      const now = Date.now();
      const diff = Math.abs(newDeg - lastHeadingVal.current);
      if (diff < 2 && now - lastHeadingUpdate.current < 200) return;

      lastHeadingVal.current = newDeg;
      lastHeadingUpdate.current = now;
      setHeading(newDeg);

      if (headingMode && mapRef.current) {
        try {
          mapRef.current.animateCamera({ heading: newDeg }, { duration: 250 });
        } catch (_) {}
      }
    }

    startCompass();

    return () => {
      isMounted = false;
      if (headingSubscription.current) {
        if (typeof headingSubscription.current.remove === 'function') {
          headingSubscription.current.remove();
        }
        headingSubscription.current = null;
      }
    };
  }, [focused, mapAvailable, headingMode]);

  const moveToCurrentLocation = useCallback(() => {
    const target = locationState.status === 'success' ? locationState : DEFAULT_COORDS;
    if (mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: { latitude: target.latitude, longitude: target.longitude },
          heading: headingMode ? heading : 0,
          zoom: 16,
        },
        { duration: 800 },
      );
    }
  }, [locationState, headingMode, heading]);

  const resetToNorth = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.animateCamera({ heading: 0 }, { duration: 500 });
    }
    setHeadingMode((prev) => !prev);
  }, []);

  const handleCancelRoute = useCallback(() => {
    setActiveRoute(null);
    setSearchLocation(null);
    setSearchQuery('');
    setSuggestions([]);
    setSearchOpen(false);
    setSearching(false);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    moveToCurrentLocation();
  }, [moveToCurrentLocation]);

  const handleToggleSearch = useCallback(() => {
    if (activeRoute || searchOpen) {
      handleCancelRoute();
    } else {
      setSearchOpen(true);
    }
  }, [activeRoute, searchOpen, handleCancelRoute]);

  const handleQueryChange = useCallback((text) => {
    setSearchQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const results = await fetchPlaceSuggestions(text);
      setSuggestions(results);
    }, 250);
  }, []);

  const handleRouteToDestination = useCallback(async (destinationPlace) => {
    Keyboard.dismiss();
    setSearching(true);
    setSearchOpen(false);
    setSuggestions([]);

    try {
      setSearchLocation(destinationPlace);

      const origin = locationState.status === 'success'
        ? { latitude: locationState.latitude, longitude: locationState.longitude }
        : DEFAULT_COORDS;
      const destination = { latitude: destinationPlace.latitude, longitude: destinationPlace.longitude };

      let routeCoords = [];
      let distanceStr = '';
      let durationStr = '';
      let safetyLabel = 'Shortest Route';

      try {
        const candidates = await getRouteCandidates(origin, destination);
        const ranked = rankRouteCandidates(candidates, unsafeZones.points || []);

        if (ranked.routes && ranked.routes.length > 0) {
          const best = ranked.routes[0];
          routeCoords = best.coordinates;
          distanceStr = `${(best.distanceMeters / 1000).toFixed(1)} km`;
          durationStr = `${Math.round(best.durationSeconds / 60)} min`;
          if (best.riskScore != null) {
            safetyLabel = best.riskScore === 0 ? 'Safest · 0 Unsafe Reports' : 'Safest Route';
          }
        }
      } catch (routingErr) {
        console.warn('[MapScreen] Routing candidate fetch failed:', routingErr?.message);
      }

      // Direct fallback path if OSRM service is offline or returned no segments
      if (!routeCoords || routeCoords.length < 2) {
        routeCoords = [origin, destination];
        const directKm = (getCoordsDistanceMeters(origin, destination) / 1000).toFixed(1);
        distanceStr = `${directKm} km`;
        durationStr = `${Math.round(directKm * 2)} min`;
        safetyLabel = 'Direct Route';
      }

      setActiveRoute({
        coordinates: routeCoords,
        distance: distanceStr,
        duration: durationStr,
        safetyLabel,
        name: destinationPlace.name || destinationPlace.title,
      });

      if (mapRef.current) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates([origin, ...routeCoords, destination], {
            edgePadding: { top: 130, right: 60, bottom: 160, left: 60 },
            animated: true,
          });
        }, 200);
      }
    } catch (e) {
      Alert.alert('Routing Failed', 'Could not compute route to location. Please try again.');
    } finally {
      setSearching(false);
    }
  }, [locationState, unsafeZones.points]);

  const handleSelectSuggestion = useCallback((place) => {
    setSearchQuery(place.title);
    handleRouteToDestination({
      latitude: place.latitude,
      longitude: place.longitude,
      name: place.title,
    });
  }, [handleRouteToDestination]);

  const handleSearchAndRoute = useCallback(async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    setSearching(true);

    try {
      const place = await searchPlaceCoordinates(searchQuery);
      if (!place) {
        Alert.alert(
          'Location Not Found',
          `Could not find "${searchQuery.trim()}". Please check spelling or try a nearby city or shop name.`,
          [{ text: 'OK' }]
        );
        setSearching(false);
        return;
      }
      await handleRouteToDestination(place);
    } catch (_) {
      setSearching(false);
    }
  }, [searchQuery, handleRouteToDestination]);

  const styles = getStyles(colors, isDark, insets);

  if (!mapAvailable) {
    return (
      <View style={styles.root}>
        <MapHeader title="Map" isDark={isDark} colors={colors} insets={insets} onToggleTheme={toggleTheme} />
        <View style={styles.statusContainer}>
          <Ionicons name="alert-circle-outline" size={52} color={colors.textMuted} />
          <Text style={styles.statusTitle}>Map SDK Missing</Text>
        </View>
      </View>
    );
  }

  const region = locationState.status === 'success'
    ? { latitude: locationState.latitude, longitude: locationState.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: DEFAULT_COORDS.latitude, longitude: DEFAULT_COORDS.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.darkGreen} />
      <MapHeader
        title="Map"
        isDark={isDark}
        colors={colors}
        insets={insets}
        onToggleTheme={toggleTheme}
        headingMode={headingMode}
        isMoving={isMoving}
      />

      <View
        style={styles.mapContainer}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT - (insets.top || 0) - 60 }}
          customMapStyle={isDark ? DARK_MAP_STYLE : []}
          showsUserLocation={true}
          showsCompass={false}
          showsMyLocationButton={false}
          rotateEnabled={true}
          initialRegion={region}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChange}
        >
          {/* 1. Live User Location Marker (Human icon shown very near native blue dot) */}
          {locationState.status === 'success' && (
            <Marker
              key={`user-loc-${isMoving ? 'walk' : 'stop'}-z${zoomMetrics.level}`}
              coordinate={{ latitude: locationState.latitude, longitude: locationState.longitude }}
              anchor={{ x: 0.28, y: 0.5 }}
              title="My Live Location"
              tracksViewChanges={true}
              zIndex={999}
            >
              <View
                style={[
                  styles.userMarkerContainer,
                  {
                    width: zoomMetrics.containerSize,
                    height: zoomMetrics.containerSize,
                  },
                ]}
              >
                {/* Outer Pulse Ring (Ring 2) — delayed 550ms */}
                <Animated.View
                  style={[
                    styles.userPulseRingBase,
                    {
                      width: zoomMetrics.ringD,
                      height: zoomMetrics.ringD,
                      borderRadius: zoomMetrics.ringD / 2,
                      transform: [{ scale: ring2Scale }],
                      opacity: ring2Opacity,
                    },
                  ]}
                />

                {/* Inner Pulse Ring (Ring 1) */}
                <Animated.View
                  style={[
                    styles.userPulseRingBase,
                    {
                      width: zoomMetrics.ringD,
                      height: zoomMetrics.ringD,
                      borderRadius: zoomMetrics.ringD / 2,
                      transform: [{ scale: ring1Scale }],
                      opacity: ring1Opacity,
                    },
                  ]}
                />

                {/* Clean White Human Icon (NO green circle) */}
                <Animated.View
                  style={[
                    styles.humanMarkerBadge,
                    {
                      transform: [{ scale: coreScale }],
                    },
                  ]}
                >
                  <MaterialIcons
                    name={isMoving ? 'directions-walk' : 'man'}
                    size={zoomMetrics.humanSize}
                    color="#FFFFFF"
                  />
                </Animated.View>
              </View>
            </Marker>
          )}

          {/* 2. Reported Unsafe Locations (Dual SOS-Style Warning Pulse Rings + Breathing Core) */}
          {unsafeZones.status === 'ready' && unsafeZones.points.map((point, index) => (
            <Marker
              key={`unsafe-${index}-z${zoomMetrics.level}`}
              coordinate={{ latitude: point.latitude, longitude: point.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={50}
              tracksViewChanges={true}
              onPress={() => {
                Alert.alert(
                  "⚠️ Unsafe Location",
                  `This location has been reported ${point.weight || 1} time(s) as unsafe. Stay alert.`,
                  [{ text: "OK" }]
                );
              }}
            >
              <View
                style={[
                  styles.warningMarkerContainer,
                  {
                    width: zoomMetrics.containerSize,
                    height: zoomMetrics.containerSize,
                  },
                ]}
              >
                {/* Outer Warning Pulse Ring (Ring 2) — delayed 550ms */}
                <Animated.View
                  style={[
                    styles.warningPulseRingBase,
                    {
                      width: zoomMetrics.ringD,
                      height: zoomMetrics.ringD,
                      borderRadius: zoomMetrics.ringD / 2,
                      transform: [{ scale: ring2Scale }],
                      opacity: ring2Opacity,
                    },
                  ]}
                />

                {/* Inner Warning Pulse Ring (Ring 1) */}
                <Animated.View
                  style={[
                    styles.warningPulseRingBase,
                    {
                      width: zoomMetrics.ringD,
                      height: zoomMetrics.ringD,
                      borderRadius: zoomMetrics.ringD / 2,
                      transform: [{ scale: ring1Scale }],
                      opacity: ring1Opacity,
                    },
                  ]}
                />

                {/* Breathing Core Warning Badge */}
                <Animated.View
                  style={[
                    styles.warningMarkerBadge,
                    {
                      width: zoomMetrics.badgeSize,
                      height: zoomMetrics.badgeSize,
                      borderRadius: zoomMetrics.badgeSize / 2,
                      transform: [{ scale: coreScale }],
                    },
                  ]}
                >
                  <Ionicons name="warning" size={zoomMetrics.warningSize} color="#FFF" />
                </Animated.View>
              </View>
            </Marker>
          ))}

          {/* 3. Highlighted Route Path (Google Maps Style) */}
          {activeRoute && Polyline && (
            <>
              {/* Outer Casing Line (Dark Navigation Border #1558B0) */}
              <Polyline
                coordinates={activeRoute.coordinates}
                strokeColor="#1558B0"
                strokeWidth={7}
                lineCap="round"
                lineJoin="round"
                zIndex={40}
              />
              {/* Inner Highlighting Line (Google Maps Navigation Blue #4285F4) */}
              <Polyline
                coordinates={activeRoute.coordinates}
                strokeColor="#4285F4"
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
                zIndex={41}
              />
            </>
          )}

          {/* 4. Search Destination Location Marker */}
          {searchLocation && (
            <Marker
              coordinate={{ latitude: searchLocation.latitude, longitude: searchLocation.longitude }}
              anchor={{ x: 0.5, y: 1.0 }}
              title={searchLocation.name}
              description={activeRoute ? `${activeRoute.distance} (${activeRoute.duration})` : undefined}
              zIndex={995}
            >
              <View style={styles.destinationPinContainer}>
                <View style={styles.destinationPinBadge}>
                  <Ionicons name="location" size={24} color="#FFF" />
                </View>
                <View style={styles.destinationPinTriangle} />
              </View>
            </Marker>
          )}
        </MapView>

        {/* Top-Left Search / Cancel Button (Single dedicated cancel button) */}
        <TouchableOpacity
          style={[
            styles.searchButton,
            (activeRoute || searchOpen) && styles.searchButtonActiveRoute,
          ]}
          onPress={handleToggleSearch}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={activeRoute || searchOpen ? 'Cancel' : 'Search Location'}
        >
          {activeRoute || searchOpen ? (
            <Ionicons name="close" size={24} color="#D32F2F" />
          ) : (
            <Ionicons name="search" size={20} color={colors.darkGreenMid} />
          )}
        </TouchableOpacity>

        {/* Floating Search Input Bar (Placed right beside the top-left button) */}
        {searchOpen && (
          <View style={styles.searchBarContainer}>
            <TextInput
              style={styles.searchBarInput}
              value={searchQuery}
              onChangeText={handleQueryChange}
              placeholder="Search city, shop, or place..."
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              onSubmitEditing={handleSearchAndRoute}
              autoFocus={true}
            />

            {searching ? (
              <ActivityIndicator size="small" color={colors.darkGreenMid} style={{ marginRight: 6 }} />
            ) : (
              <TouchableOpacity
                style={styles.searchBarSubmitBtn}
                onPress={handleSearchAndRoute}
                disabled={!searchQuery.trim()}
                accessibilityLabel="Find Route"
              >
                <LinearGradient
                  colors={[colors.darkGreen, colors.darkGreenLight]}
                  style={styles.searchBarSubmitGradient}
                >
                  <Ionicons name="arrow-forward" size={16} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Auto-Suggestion Matching Places Dropdown */}
        {searchOpen && suggestions.length > 0 && (
          <View style={styles.suggestionsDropdown}>
            {suggestions.map((item, index) => (
              <TouchableOpacity
                key={`${item.latitude}-${item.longitude}-${index}`}
                style={[
                  styles.suggestionRow,
                  index === suggestions.length - 1 && styles.suggestionRowLast,
                ]}
                onPress={() => handleSelectSuggestion(item)}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionIconBox}>
                  <Ionicons
                    name={
                      item.type === 'shop' || item.type === 'supermarket'
                        ? 'cart-outline'
                        : item.type === 'city' || item.type === 'town'
                        ? 'business-outline'
                        : 'location-outline'
                    }
                    size={18}
                    color={colors.darkGreenMid}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Floating Route Summary Banner (Single Cancel button in top-left, no duplicate here) */}
        {activeRoute && !searchOpen && (
          <View style={styles.routeSummaryBanner}>
            <View style={styles.routeSummaryIcon}>
              <Ionicons name="navigate" size={18} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeSummaryTitle} numberOfLines={1}>
                {activeRoute.name}
              </Text>
              <Text style={styles.routeSummarySubtitle}>
                {activeRoute.distance} · {activeRoute.duration} · {activeRoute.safetyLabel}
              </Text>
            </View>
          </View>
        )}

        {locationState.status === 'loading' && (
          <View style={styles.floatingLoadingBadge}>
            <ActivityIndicator size="small" color={colors.darkGreenMid} />
            <Text style={styles.floatingLoadingText}>Acquiring GPS...</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.compassButton, !headingMode && styles.compassButtonInactive]}
          onPress={resetToNorth}
          activeOpacity={0.8}
        >
          <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
            <Ionicons name="compass" size={32} color={headingMode ? colors.darkGreenMid : colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* Dynamic Zoom In & Zoom Out Circle Buttons (Bottom Right Corner) */}
        <Animated.View
          style={[
            styles.zoomControlsContainer,
            {
              opacity: zoomButtonsAnim,
              transform: [
                {
                  scale: zoomButtonsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.75, 1.0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={zoomButtonsVisible ? 'auto' : 'none'}
        >
          <TouchableOpacity
            style={styles.zoomCircleBtn}
            onPress={handleZoomIn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Zoom In"
          >
            <Ionicons name="add" size={24} color={colors.darkGreenMid} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.zoomCircleBtn, { marginTop: 10 }]}
            onPress={handleZoomOut}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Zoom Out"
          >
            <Ionicons name="remove" size={24} color={colors.darkGreenMid} />
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={styles.fab}
          onPress={moveToCurrentLocation}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={24} color={colors.darkGreenMid} />
        </TouchableOpacity>
      </View>

      {reportOpen && (
        <UnsafeLocationReportModal
          visible
          uid={user?.uid}
          onClose={() => setReportOpen(false)}
          onReported={() => setReportOpen(false)}
        />
      )}
    </View>
  );
}

function MapHeader({ title, isDark, colors, insets, onToggleTheme, headingMode, isMoving }) {
  return (
    <LinearGradient
      colors={[colors.darkGreen, colors.darkGreenMid]}
      style={{
        paddingTop: (insets?.top ?? 24) + 4,
        paddingBottom: 12,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
      }}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="map" size={22} color="#FFF" />
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFF' }}>{title}</Text>

        {/* Real-Time Live Movement / Stationary Status Pill */}
        <View
          style={{
            backgroundColor: isMoving ? 'rgba(76, 175, 80, 0.45)' : 'rgba(255, 255, 255, 0.18)',
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            borderWidth: 1,
            borderColor: isMoving ? '#81C784' : 'rgba(255, 255, 255, 0.25)',
          }}
        >
          <MaterialIcons name={isMoving ? 'directions-walk' : 'man'} size={14} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>
            {isMoving ? 'Moving' : 'Stopped'}
          </Text>
        </View>

        {headingMode && (
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4
          }}>
            <Ionicons name="compass-outline" size={12} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '600' }}>Live Heading</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={onToggleTheme} style={{ padding: 8 }}>
        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={22} color="#FFF" />
      </TouchableOpacity>
    </LinearGradient>
  );
}

const getStyles = (colors, isDark, insets) => {
  const TAB_BAR_H = 62 + (insets?.bottom ?? 0);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    mapContainer: { flex: 1, position: 'relative' },
    floatingLoadingBadge: {
      position: 'absolute',
      top: 68,
      left: 16,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(26, 36, 32, 0.92)' : 'rgba(255, 255, 255, 0.94)',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: RADIUS.full,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      zIndex: 15,
      ...SHADOWS.small,
    },
    floatingLoadingText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    statusContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    statusTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center', marginTop: 10 },
    userMarkerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    userPulseRingBase: {
      position: 'absolute',
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      borderColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.65,
      shadowRadius: 3,
      elevation: 4,
    },
    humanMarkerBadge: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.95,
      shadowRadius: 4,
      elevation: 7,
    },
    warningMarkerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningPulseRingBase: {
      position: 'absolute',
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      borderColor: 'rgba(244, 67, 54, 0.95)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.65,
      shadowRadius: 3,
      elevation: 4,
    },
    warningMarkerBadge: {
      backgroundColor: colors.dangerRed || '#D32F2F',
      borderWidth: 2.5,
      borderColor: '#FFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.9,
      shadowRadius: 5,
      elevation: 8,
    },
    searchButton: {
      position: 'absolute',
      top: 16,
      left: 16,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? colors.surface : '#FFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.small,
      zIndex: 20,
    },
    searchButtonActiveRoute: {
      backgroundColor: isDark ? 'rgba(211, 47, 47, 0.22)' : '#FFEBEE',
      borderColor: '#EF5350',
    },
    searchBarContainer: {
      position: 'absolute',
      top: 16,
      left: 68,
      right: 16,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? colors.surface : '#FFF',
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 14,
      paddingRight: 5,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.medium,
      zIndex: 30,
    },
    searchBarInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    searchBarSubmitBtn: {
      borderRadius: 17,
      overflow: 'hidden',
    },
    searchBarSubmitGradient: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    suggestionsDropdown: {
      position: 'absolute',
      top: 68,
      left: 16,
      right: 16,
      backgroundColor: isDark ? colors.surface : '#FFFFFF',
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...SHADOWS.large,
      zIndex: 40,
    },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 10,
    },
    suggestionRowLast: {
      borderBottomWidth: 0,
    },
    suggestionIconBox: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? colors.darkGreenSurface : '#E8F5E9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    suggestionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    suggestionSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    routeSummaryBanner: {
      position: 'absolute',
      top: 68,
      left: 16,
      right: 16,
      backgroundColor: isDark ? 'rgba(26, 36, 32, 0.95)' : 'rgba(255, 255, 255, 0.97)',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.medium,
      zIndex: 20,
      gap: 10,
    },
    routeSummaryIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.darkGreenMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    routeSummaryTitle: {
      fontSize: 13,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    routeSummarySubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    destinationPinContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    destinationPinBadge: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#E53935',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#FFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.45,
      shadowRadius: 4,
      elevation: 7,
    },
    destinationPinTriangle: {
      width: 0,
      height: 0,
      backgroundColor: 'transparent',
      borderStyle: 'solid',
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderBottomWidth: 0,
      borderTopWidth: 8,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: '#E53935',
      marginTop: -2,
    },
    compassButton: {
      position: 'absolute',
      top: 16,
      right: 16,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? colors.surface : '#FFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.small,
      zIndex: 20,
    },
    compassButtonInactive: {
      opacity: 0.6,
    },
    zoomControlsContainer: {
      position: 'absolute',
      right: 20,
      bottom: TAB_BAR_H + 86,
      alignItems: 'center',
      zIndex: 25,
    },
    zoomCircleBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: isDark ? colors.surface : '#FFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 5,
      ...SHADOWS.medium,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: TAB_BAR_H + 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? colors.surface : '#FFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 5,
      zIndex: 20,
      ...SHADOWS.medium,
    },
  });
};
