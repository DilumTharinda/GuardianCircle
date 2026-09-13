import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import {
  getChildren,
  saveSafeZone,
  deleteSafeZone,
  calculateDistance,
} from '../../services/parentChildService';

const ZONE_PRESETS = [
  { name: 'Home', icon: '🏠', color: '#2E7D32', defaultRadius: 150 },
  { name: 'School', icon: '🏫', color: '#1976D2', defaultRadius: 250 },
  { name: 'Tuition / Class', icon: '📚', color: '#00897B', defaultRadius: 200 },
  { name: 'Police / Safe Point', icon: '🛡️', color: '#D32F2F', defaultRadius: 150 },
  { name: 'Hospital / Clinic', icon: '🏥', color: '#E53935', defaultRadius: 200 },
  { name: "Grandparent's", icon: '👵', color: '#7B1FA2', defaultRadius: 200 },
  { name: 'Sports Complex', icon: '⚽', color: '#FB8C00', defaultRadius: 350 },
  { name: 'Park / Playground', icon: '🌳', color: '#43A047', defaultRadius: 300 },
];

const RADIUS_OPTIONS = [100, 250, 500, 1000];

export default function SafeZonesScreen() {
  const route = useRoute();
  const initialChildId = route.params?.childId;

  const [childrenList, setChildrenList] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [loading, setLoading] = useState(true);

  // Modal State for adding safe zone
  const [modalVisible, setModalVisible] = useState(false);
  const [zoneName, setZoneName] = useState('Home');
  const [zoneIcon, setZoneIcon] = useState('🏠');
  const [zoneColor, setZoneColor] = useState('#2E7D32');
  const [zoneRadius, setZoneRadius] = useState(250);
  const [notifyEntry, setNotifyEntry] = useState(true);
  const [notifyExit, setNotifyExit] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const kids = await getChildren();
      setChildrenList(kids);
      if (!selectedChildId && kids.length > 0) {
        setSelectedChildId(kids[0].id);
      }
    } catch (err) {
      console.warn('[SafeZonesScreen] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeChild =
    childrenList.find((c) => c.id === selectedChildId) || childrenList[0] || null;

  function selectPreset(preset) {
    setZoneName(preset.name);
    setZoneIcon(preset.icon);
    setZoneColor(preset.color);
    setZoneRadius(preset.defaultRadius);
  }

  async function handleSaveZone() {
    if (!zoneName.trim()) {
      Alert.alert('Required', 'Please enter a name for the safe zone.');
      return;
    }
    if (!activeChild) return;

    setSaving(true);
    try {
      // Use child's current coords or realistic offset
      const baseLat = activeChild.lastLocation?.latitude || 6.9147;
      const baseLon = activeChild.lastLocation?.longitude || 79.8732;

      await saveSafeZone(activeChild.id, {
        name: zoneName.trim(),
        icon: zoneIcon,
        color: zoneColor,
        latitude: baseLat + (Math.random() - 0.5) * 0.005,
        longitude: baseLon + (Math.random() - 0.5) * 0.005,
        radius: zoneRadius,
        notifyOnEntry: notifyEntry,
        notifyOnExit: notifyExit,
      });

      setModalVisible(false);
      await loadData();
      Alert.alert('✅ Safe Zone Saved', `"${zoneName}" has been added with a ${zoneRadius}m geofence radius.`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save safe zone.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteZone(zone) {
    Alert.alert(
      'Delete Safe Zone',
      `Are you sure you want to remove "${zone.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSafeZone(activeChild.id, zone.id);
            await loadData();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading geofence boundaries...</Text>
      </View>
    );
  }

  const safeZones = activeChild?.safeZones || [];

  return (
    <View style={styles.container}>
      {/* Child Switcher Pills */}
      <View style={styles.topSelectorContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
          {childrenList.map((kid) => {
            const isSelected = kid.id === activeChild?.id;
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
                <Text style={styles.zoneCountPill}>
                  {(kid.safeZones || []).length} zones
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerTitle}>🛡️ Geofence Safety Alerting</Text>
          <Text style={styles.infoBannerText}>
            GuardianCircle calculates real-time distances using the Haversine formula and alerts you instantly when {activeChild?.targetName || 'your child'} enters or leaves these protected perimeters.
          </Text>
        </View>

        {/* Zones List Header */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>
            Configured Zones ({safeZones.length})
          </Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>+ New Safe Zone</Text>
          </TouchableOpacity>
        </View>

        {safeZones.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📍</Text>
            <Text style={styles.emptyTitle}>No Safe Zones Configured</Text>
            <Text style={styles.emptySub}>
              Add Home, School, or relative's houses to receive automated entry/exit alerts.
            </Text>
            <TouchableOpacity
              style={styles.emptyActionBtn}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.emptyActionBtnText}>+ Add First Safe Zone</Text>
            </TouchableOpacity>
          </View>
        ) : (
          safeZones.map((zone) => {
            // Compute real-time Haversine distance from child's last location
            const dist = calculateDistance(
              activeChild?.lastLocation?.latitude,
              activeChild?.lastLocation?.longitude,
              zone.latitude,
              zone.longitude
            );
            const isInside = dist <= (zone.radius || 200);

            return (
              <View key={zone.id} style={styles.zoneCard}>
                <View style={styles.zoneCardTop}>
                  <View
                    style={[
                      styles.zoneIconCircle,
                      { backgroundColor: `${zone.color || COLORS.primary}18` },
                    ]}
                  >
                    <Text style={styles.zoneIconEmoji}>{zone.icon || '📍'}</Text>
                  </View>

                  <View style={styles.zoneInfoCol}>
                    <View style={styles.zoneTitleRow}>
                      <Text style={styles.zoneNameText}>{zone.name}</Text>
                      <View
                        style={[
                          styles.insideBadge,
                          {
                            backgroundColor: isInside
                              ? COLORS.safeGreenLight
                              : '#F1F3F5',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.insideBadgeText,
                            {
                              color: isInside
                                ? COLORS.safeGreen
                                : COLORS.textMuted,
                            },
                          ]}
                        >
                          {isInside ? '🟢 INSIDE ZONE' : '⚪ OUTSIDE'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.zoneRadiusText}>
                      Perimeter Radius: <Text style={{ fontWeight: '700' }}>{zone.radius} meters</Text>
                    </Text>

                    {/* Haversine Math readout */}
                    <Text style={styles.distanceMathText}>
                      📐 Distance from child: <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{dist}m</Text>{' '}
                      ({isInside ? 'within safe boundary' : `${dist - zone.radius}m beyond perimeter`})
                    </Text>
                  </View>
                </View>

                {/* Notification preferences tags */}
                <View style={styles.zoneTagsRow}>
                  {zone.notifyOnEntry && (
                    <View style={styles.tagItem}>
                      <Text style={styles.tagItemText}>🔔 Notify on Entry</Text>
                    </View>
                  )}
                  {zone.notifyOnExit && (
                    <View style={styles.tagItem}>
                      <Text style={styles.tagItemText}>🚪 Notify on Exit</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.deleteZoneBtn}
                    onPress={() => handleDeleteZone(zone)}
                  >
                    <Text style={styles.deleteZoneText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add Safe Zone Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Safe Zone</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Preset Chips */}
              <Text style={styles.inputLabel}>Quick Presets</Text>
              <View style={styles.presetGrid}>
                {ZONE_PRESETS.map((p, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.presetChip,
                      zoneName === p.name && styles.presetChipActive,
                    ]}
                    onPress={() => selectPreset(p)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.presetEmoji}>{p.icon}</Text>
                    <Text
                      style={[
                        styles.presetName,
                        zoneName === p.name && styles.presetNameActive,
                      ]}
                    >
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom Name */}
              <Text style={styles.inputLabel}>Zone Label / Name *</Text>
              <TextInput
                style={styles.input}
                value={zoneName}
                onChangeText={setZoneName}
                placeholder="e.g. Karate Dojo"
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Radius Options */}
              <Text style={styles.inputLabel}>Geofence Radius (Meters)</Text>
              <View style={styles.radiusRow}>
                {RADIUS_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.radiusChip,
                      zoneRadius === r && styles.radiusChipActive,
                    ]}
                    onPress={() => setZoneRadius(r)}
                  >
                    <Text
                      style={[
                        styles.radiusChipText,
                        zoneRadius === r && styles.radiusChipTextActive,
                      ]}
                    >
                      {r >= 1000 ? `${r / 1000} km` : `${r}m`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notification Toggles */}
              <Text style={styles.inputLabel}>Alert Triggers</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Notify when child enters zone</Text>
                <Switch
                  value={notifyEntry}
                  onValueChange={setNotifyEntry}
                  trackColor={{ false: '#DDD', true: COLORS.safeGreen }}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Notify when child leaves zone</Text>
                <Switch
                  value={notifyExit}
                  onValueChange={setNotifyExit}
                  trackColor={{ false: '#DDD', true: COLORS.warnOrange }}
                />
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={styles.submitZoneBtn}
                onPress={handleSaveZone}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitZoneBtnText}>Save Safe Zone Perimeter</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  topSelectorContainer: {
    backgroundColor: COLORS.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  zoneCountPill: {
    fontSize: 10,
    backgroundColor: 'rgba(0,0,0,0.1)',
    color: COLORS.textSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  infoBanner: {
    backgroundColor: COLORS.infoBlueLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.infoBlue,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.infoBlue,
    marginBottom: 4,
  },
  infoBannerText: {
    fontSize: 12,
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  listHeaderTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: SPACING.md,
  },
  emptyActionBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
  },
  emptyActionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  zoneCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  zoneCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  zoneIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  zoneIconEmoji: {
    fontSize: 22,
  },
  zoneInfoCol: {
    flex: 1,
  },
  zoneTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  zoneNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  insideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  insideBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  zoneRadiusText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  distanceMathText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  zoneTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  tagItem: {
    backgroundColor: '#F1F3F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  tagItemText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  deleteZoneBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deleteZoneText: {
    fontSize: 11,
    color: COLORS.dangerRed,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    marginBottom: 6,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F3F5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    gap: 6,
  },
  presetChipActive: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  presetEmoji: {
    fontSize: 16,
  },
  presetName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  presetNameActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  radiusChip: {
    flex: 1,
    backgroundColor: '#F1F3F5',
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  radiusChipActive: {
    backgroundColor: COLORS.primary,
  },
  radiusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  radiusChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  toggleLabel: {
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  submitZoneBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: SPACING.xl,
    ...SHADOWS.medium,
  },
  submitZoneBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
