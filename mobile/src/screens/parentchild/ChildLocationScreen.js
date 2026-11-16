import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { DARK_MAP_STYLE } from '../../constants/mapStyles';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getChildren,
  updateChildLocation,
  sendCheckInRequest,
} from '../../services/parentChildService';
import { avatarIconForChild } from '../../utils/parentChildIcons';
import MapFallbackView from '../../components/parentchild/MapFallbackView';
import ChildDeviceModal from '../../components/parentchild/ChildDeviceModal';

// Conditionally import react-native-maps to avoid crashes on web
let MapView = null;
let Marker = null;
let Circle = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
    Circle = Maps.Circle;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
  } catch (e) {
    console.warn('[ChildLocationScreen] react-native-maps not loaded natively, using fallback');
  }
}

const DEFAULT_COORDS = { latitude: 6.9147, longitude: 79.8732 };
const FRESH_LOCATION_MS = 5 * 60 * 1000; // older than 5 minutes counts as stale

// The location timestamp can be an ISO string (local data) or a Firestore
// Timestamp (live data). Return a Date, or null if it can't be read.
function toDate(value) {
  if (!value) return null;
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function ChildLocationScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const route = useRoute();
  const initialChildId = route.params?.childId;

  // Built before any early return below, so every render can use it.
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [childrenList, setChildrenList] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [childDeviceVisible, setChildDeviceVisible] = useState(false);
  const mapRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const kids = await getChildren(user?.uid);
      setChildrenList(kids);
      if (!selectedChildId && kids.length > 0) {
        setSelectedChildId(kids[0].id);
      }
    } catch (err) {
      console.warn('[ChildLocationScreen] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, user?.uid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic polling every 4 seconds to sync live coordinates and SOS state
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadData]);

  const activeChild =
    childrenList.find((c) => c.id === selectedChildId) || childrenList[0] || null;

  const childLat = activeChild?.lastLocation?.latitude ?? DEFAULT_COORDS.latitude;
  const childLng = activeChild?.lastLocation?.longitude ?? DEFAULT_COORDS.longitude;

  const recenterMap = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: childLat,
        longitude: childLng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      600
    );
  }, [childLat, childLng]);

  // Follow the child when they move or when a different child is picked.
  // The map is not locked to a fixed region, so the parent can still pan
  // and zoom between updates.
  useEffect(() => {
    if (activeChild) recenterMap();
  }, [activeChild?.id, childLat, childLng, recenterMap]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCallChild() {
    if (!activeChild?.targetPhone) {
      Alert.alert('No Phone Number', 'No contact phone number is configured for this child.');
      return;
    }
    const phoneUrl = `tel:${activeChild.targetPhone.replace(/[^0-9+]/g, '')}`;
    Linking.canOpenURL(phoneUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(phoneUrl);
        } else {
          Alert.alert('Calling Child', `Dialing ${activeChild.targetName}: ${activeChild.targetPhone}`);
        }
      })
      .catch(() => {
        Alert.alert('Calling Child', `Dialing ${activeChild.targetName}: ${activeChild.targetPhone}`);
      });
  }

  async function handleSendCheckIn() {
    if (!activeChild) return;
    setRequesting(true);
    try {
      await sendCheckInRequest(activeChild.id);
      Alert.alert(
        'Check-in Request Sent',
        `Notification sent to ${activeChild.targetName}'s device. They will be prompted to acknowledge their current location.`
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send check-in request.');
    } finally {
      setRequesting(false);
    }
  }

  async function handleSimulateMovement() {
    if (!activeChild) return;
    // Simulate slight GPS coordinate shift (e.g. child walking towards park)
    const randomOffsetLat = (Math.random() - 0.5) * 0.003;
    const randomOffsetLon = (Math.random() - 0.5) * 0.003;
    const newCoords = {
      latitude: childLat + randomOffsetLat,
      longitude: childLng + randomOffsetLon,
    };

    const updated = await updateChildLocation(
      activeChild.id,
      newCoords,
      `Updated Location near Sector ${Math.floor(Math.random() * 10 + 1)}`
    );

    await loadData();
    const transitions = updated?.transitionSummary;
    let transitionText = `New coordinates received for ${activeChild.targetName}.\nStatus: "${updated?.currentZoneName}".`;
    if (transitions?.entered?.length > 0) {
      transitionText += `\nEntered safe zone: ${transitions.entered.join(', ')}`;
    }
    if (transitions?.exited?.length > 0) {
      transitionText += `\nLeft safe zone: ${transitions.exited.join(', ')}`;
    }

    Alert.alert('Live GPS Ping Updated', transitionText);
  }

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Acquiring live satellite GPS...</Text>
      </View>
    );
  }

  if (!activeChild) {
    return (
      <View style={styles.emptyCenter}>
        <MaterialIcons name="map" size={48} color={colors.textMuted} style={{ marginBottom: 8 }} />
        <Text style={styles.emptyTitle}>No Child Selected</Text>
      </View>
    );
  }

  const childCoords = {
    latitude: childLat,
    longitude: childLng,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  const safeZones = activeChild.safeZones || [];
  const battery = activeChild.batteryLevel ?? 80;
  const batteryColor =
    battery > 50 ? colors.safeGreen : battery > 20 ? colors.warnOrange : colors.dangerRed;

  // Real "last updated" time from the location record
  const lastUpdate = toDate(activeChild.lastLocation?.timestamp);
  const isFresh = lastUpdate ? Date.now() - lastUpdate.getTime() < FRESH_LOCATION_MS : false;
  const updatedText = lastUpdate
    ? `Updated ${formatDistanceToNow(lastUpdate, { addSuffix: true })}`
    : 'No location update yet';

  return (
    <View style={styles.container}>
      {/* Top Child Selector Pills */}
      <View style={styles.topSelectorContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
          {childrenList.map((kid) => {
            const isSelected = kid.id === activeChild.id;
            return (
              <TouchableOpacity
                key={kid.id}
                style={[styles.childPill, isSelected && styles.childPillActive]}
                onPress={() => setSelectedChildId(kid.id)}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={avatarIconForChild(kid)}
                  size={18}
                  color={isSelected ? '#FFF' : colors.textPrimary}
                />
                <Text style={[styles.childPillName, isSelected && styles.childPillNameActive]}>
                  {kid.targetName.split(' ')[0]}
                </Text>
                {kid.sosActive && <MaterialIcons name="warning" size={14} color={colors.dangerRed} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Map View Area */}
      <View style={styles.mapArea}>
        {MapView && Platform.OS !== 'web' ? (
          <>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              customMapStyle={isDark ? DARK_MAP_STYLE : []}
              initialRegion={childCoords}
            >
              {/* Safe Zone Geofence Circles */}
              {safeZones.map((zone) => (
                <Circle
                  key={zone.id}
                  center={{ latitude: zone.latitude, longitude: zone.longitude }}
                  radius={zone.radius || 200}
                  fillColor={`${zone.color || '#2E7D32'}22`}
                  strokeColor={zone.color || '#2E7D32'}
                  strokeWidth={2}
                />
              ))}

              {/* Child Marker */}
              <Marker
                coordinate={{ latitude: childLat, longitude: childLng }}
                title={activeChild.targetName}
                description={activeChild.currentZoneName || activeChild.lastLocation?.address}
              >
                <View style={[styles.customPin, activeChild.sosActive && styles.customPinSOS]}>
                  <MaterialIcons name={avatarIconForChild(activeChild)} size={24} color="#FFF" />
                </View>
              </Marker>
            </MapView>

            {/* Jump back to the child after panning away */}
            <TouchableOpacity
              style={styles.recenterBtn}
              onPress={recenterMap}
              activeOpacity={0.8}
              accessibilityLabel="Centre map on child"
            >
              <MaterialIcons name="my-location" size={22} color={colors.primary} />
            </TouchableOpacity>
          </>
        ) : (
          /* Web / Emulator Interactive Radar Fallback */
          <MapFallbackView child={activeChild} safeZones={safeZones} />
        )}
      </View>

      {/* Bottom Sliding Info Card */}
      <View style={styles.bottomCard}>
        {/* Child Profile Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardAvatar}>
            <MaterialIcons name={avatarIconForChild(activeChild)} size={28} color={colors.primary} />
          </View>

          <View style={styles.cardInfoCol}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardChildName}>{activeChild.targetName}</Text>
              <View style={[styles.batteryPill, { backgroundColor: colors.safeGreenLight }]}>
                <MaterialIcons
                  name={battery > 20 ? 'battery-full' : 'battery-alert'}
                  size={14}
                  color={batteryColor}
                />
                <Text style={[styles.batteryPillText, { color: batteryColor }]}>{battery}%</Text>
              </View>
            </View>

            <View style={styles.zoneTagRow}>
              <MaterialIcons name="place" size={14} color={colors.primary} />
              <Text style={styles.zoneTagText}>
                {activeChild.currentZoneName || 'Location Active'}
              </Text>
              <Text style={styles.speedTagText}>• {activeChild.speed || 'Walking'}</Text>
            </View>
          </View>
        </View>

        {/* Live Address Display */}
        <View style={styles.addressBox}>
          <Text style={styles.addressLabel}>LIVE GPS ADDRESS</Text>
          <Text style={styles.addressVal} numberOfLines={2}>
            {activeChild.lastLocation?.address || 'Address synchronizing with satellites...'}
          </Text>
          <View style={styles.updatedRow}>
            <MaterialIcons
              name="fiber-manual-record"
              size={10}
              color={isFresh ? colors.safeGreen : colors.warnOrange}
            />
            <Text style={styles.lastPingTime}>{updatedText}</Text>
          </View>
        </View>

        {/* Action Button Grid */}
        <View style={styles.actionButtonRow}>
          <TouchableOpacity
            style={styles.callButton}
            onPress={handleCallChild}
            activeOpacity={0.8}
          >
            <MaterialIcons name="phone" size={18} color="#FFF" />
            <Text style={styles.callButtonText}>Call Child</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkInButton}
            onPress={handleSendCheckIn}
            disabled={requesting}
            activeOpacity={0.8}
          >
            {requesting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="notifications-active" size={18} color="#FFF" />
                <Text style={styles.checkInButtonText}>Request Check-in</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Simulator Tools */}
        <View style={styles.simRow}>
          <TouchableOpacity
            style={styles.simMoveBtn}
            onPress={handleSimulateMovement}
            activeOpacity={0.7}
          >
            <MaterialIcons name="directions-walk" size={16} color={colors.textSecondary} />
            <Text style={styles.simMoveBtnText}>Simulate Movement & Geofence Ping</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.simMoveBtn, { backgroundColor: '#0F172A', marginTop: 8 }]}
            onPress={() => setChildDeviceVisible(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="smartphone" size={16} color="#38BDF8" />
            <Text style={[styles.simMoveBtnText, { color: '#38BDF8' }]}>View as Child (SOS & Check-in)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Child Device Simulation Modal (FR-4.4) */}
      <ChildDeviceModal
        visible={childDeviceVisible}
        child={activeChild}
        onClose={() => {
          setChildDeviceVisible(false);
          loadData();
        }}
        onStateChange={loadData}
      />
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
  },
  topSelectorContainer: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  selectorScroll: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  childPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F3F5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  childPillActive: {
    backgroundColor: colors.primary,
    ...SHADOWS.small,
  },
  childPillName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  childPillNameActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  mapArea: {
    flex: 1,
    backgroundColor: '#E8EDF2',
  },
  map: {
    flex: 1,
  },
  recenterBtn: {
    position: 'absolute',
    right: SPACING.lg,
    top: SPACING.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  customPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    ...SHADOWS.medium,
  },
  customPinSOS: {
    backgroundColor: colors.dangerRed,
    borderColor: '#FFCDD2',
    transform: [{ scale: 1.2 }],
  },
  bottomCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    ...SHADOWS.large,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F4F8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardInfoCol: {
    flex: 1,
    gap: 2,
  },
  cardNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardChildName: {
    ...TYPOGRAPHY.h3,
    fontSize: 17,
  },
  batteryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  batteryPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  zoneTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoneTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  speedTagText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  addressBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.infoBlue,
  },
  addressLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.infoBlue,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  addressVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  lastPingTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.safeGreen,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  callButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  checkInButton: {
    flex: 1.2,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  checkInButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  simRow: {
    marginTop: SPACING.sm,
  },
  simMoveBtn: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#F1F3F5',
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simMoveBtnText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
