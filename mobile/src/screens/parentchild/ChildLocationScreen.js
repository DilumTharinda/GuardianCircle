import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useRoute } from '@react-navigation/native';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import {
  getChildren,
  updateChildLocation,
  sendCheckInRequest,
  triggerMockSOS,
} from '../../services/parentChildService';
import MapFallbackView from '../../components/parentchild/MapFallbackView';

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

export default function ChildLocationScreen() {
  const route = useRoute();
  const initialChildId = route.params?.childId;

  const [childrenList, setChildrenList] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const mapRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const kids = await getChildren();
      setChildrenList(kids);
      if (!selectedChildId && kids.length > 0) {
        setSelectedChildId(kids[0].id);
      }
    } catch (err) {
      console.warn('[ChildLocationScreen] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeChild =
    childrenList.find((c) => c.id === selectedChildId) || childrenList[0] || null;

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
        '📲 Check-in Request Sent',
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
      latitude: (activeChild.lastLocation?.latitude || 6.9147) + randomOffsetLat,
      longitude: (activeChild.lastLocation?.longitude || 79.8732) + randomOffsetLon,
    };

    const updated = await updateChildLocation(
      activeChild.id,
      newCoords,
      `Updated Location near Sector ${Math.floor(Math.random() * 10 + 1)}`
    );

    await loadData();
    Alert.alert(
      '📍 Live GPS Ping Updated',
      `New coordinates received for ${activeChild.targetName}!\nSafe-zone boundaries re-evaluated: Status is "${updated?.currentZoneName}".`
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Acquiring live satellite GPS...</Text>
      </View>
    );
  }

  if (!activeChild) {
    return (
      <View style={styles.emptyCenter}>
        <Text style={styles.emptyEmoji}>🗺️</Text>
        <Text style={styles.emptyTitle}>No Child Selected</Text>
      </View>
    );
  }

  const childCoords = {
    latitude: activeChild.lastLocation?.latitude || 6.9147,
    longitude: activeChild.lastLocation?.longitude || 79.8732,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  const safeZones = activeChild.safeZones || [];
  const battery = activeChild.batteryLevel ?? 80;
  const batteryColor =
    battery > 50 ? COLORS.safeGreen : battery > 20 ? COLORS.warnOrange : COLORS.dangerRed;

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
                <Text style={styles.childPillEmoji}>{kid.avatarEmoji || '🧒'}</Text>
                <Text style={[styles.childPillName, isSelected && styles.childPillNameActive]}>
                  {kid.targetName.split(' ')[0]}
                </Text>
                {kid.sosActive && <Text style={styles.sosDot}>🚨</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Map View Area */}
      <View style={styles.mapArea}>
        {MapView && Platform.OS !== 'web' ? (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={childCoords}
            region={childCoords}
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
              coordinate={{
                latitude: childCoords.latitude,
                longitude: childCoords.longitude,
              }}
              title={activeChild.targetName}
              description={activeChild.currentZoneName || activeChild.lastLocation?.address}
            >
              <View style={[styles.customPin, activeChild.sosActive && styles.customPinSOS]}>
                <Text style={styles.customPinText}>{activeChild.avatarEmoji || '🧒'}</Text>
              </View>
            </Marker>
          </MapView>
        ) : (
          /* Web / Emulator Interactive Radar Fallback */
          <MapFallbackView child={activeChild} safeZones={safeZones} />
        )}
      </View>

      {/* Bottom Sliding Info Card */}
      <View style={styles.bottomCard}>
        {/* Child Profile Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardAvatarCol}>
            <View style={styles.cardAvatar}>
              <Text style={styles.cardAvatarEmoji}>{activeChild.avatarEmoji || '🧒'}</Text>
            </View>
          </View>

          <View style={styles.cardInfoCol}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardChildName}>{activeChild.targetName}</Text>
              <View style={[styles.batteryPill, { backgroundColor: COLORS.safeGreenLight }]}>
                <Text style={[styles.batteryPillText, { color: batteryColor }]}>
                  🔋 {battery}%
                </Text>
              </View>
            </View>

            <View style={styles.zoneTagRow}>
              <Text style={styles.zoneTagText}>
                📍 {activeChild.currentZoneName || 'Location Active'}
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
          <Text style={styles.lastPingTime}>
            GPS Signal: 🟢 Strong (HDOP 0.8) • Updated just now
          </Text>
        </View>

        {/* Action Button Grid */}
        <View style={styles.actionButtonRow}>
          <TouchableOpacity
            style={styles.callButton}
            onPress={handleCallChild}
            activeOpacity={0.8}
          >
            <Text style={styles.callButtonText}>📞 Call Child</Text>
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
              <Text style={styles.checkInButtonText}>📲 Request Check-in</Text>
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
            <Text style={styles.simMoveBtnText}>🚶 Simulate Movement & Geofence Ping</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
  },
  topSelectorContainer: {
    backgroundColor: COLORS.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    backgroundColor: COLORS.primary,
    ...SHADOWS.small,
  },
  childPillEmoji: {
    fontSize: 16,
  },
  childPillName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  childPillNameActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  sosDot: {
    fontSize: 12,
  },
  mapArea: {
    flex: 1,
    backgroundColor: '#E8EDF2',
  },
  map: {
    flex: 1,
  },
  customPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    ...SHADOWS.medium,
  },
  customPinSOS: {
    backgroundColor: COLORS.dangerRed,
    borderColor: '#FFCDD2',
    transform: [{ scale: 1.2 }],
  },
  customPinText: {
    fontSize: 22,
  },
  bottomCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    ...SHADOWS.large,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  cardAvatarCol: {},
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F4F8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardAvatarEmoji: {
    fontSize: 26,
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
    color: COLORS.primary,
  },
  speedTagText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  addressBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.infoBlue,
  },
  addressLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.infoBlue,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  addressVal: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  lastPingTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  callButton: {
    flex: 1,
    backgroundColor: COLORS.safeGreen,
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
    backgroundColor: COLORS.primary,
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
    backgroundColor: '#F1F3F5',
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  simMoveBtnText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
