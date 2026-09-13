import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import {
  toggleBleProximity,
  pingBleTag,
  addPetOrItem,
} from '../../services/parentChildService';

export default function PetItemSection({ items = [], onRefresh }) {
  const [expanded, setExpanded] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagType, setTagType] = useState('pet'); // 'pet' | 'item'
  const [loading, setLoading] = useState(false);

  async function handleToggleProximity(itemId) {
    await toggleBleProximity(itemId);
    if (onRefresh) onRefresh();
  }

  async function handleRingTag(item) {
    if (item.status === 'out_of_range') {
      Alert.alert(
        'Out of BLE Range',
        `${item.name} is currently out of Bluetooth range. Proximity beep cannot be sent until in range.`
      );
      return;
    }
    await pingBleTag(item.id);
    if (onRefresh) onRefresh();
    Alert.alert('🔔 BLE Tag Triggered', `Buzzer activated on ${item.name} for 4 seconds!`);
  }

  async function handleAddTag() {
    if (!tagName.trim()) {
      Alert.alert('Required', 'Please enter a name for the pet or item.');
      return;
    }
    setLoading(true);
    try {
      await addPetOrItem('parent_user_default', {
        name: tagName.trim(),
        type: tagType,
      });
      setTagName('');
      setModalVisible(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add BLE tag.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <TouchableOpacity
        style={styles.headerRow}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>🐾 Tracked Pets & Valuables</Text>
          <View style={styles.tagCountBadge}>
            <Text style={styles.tagCountText}>{items.length} tags</Text>
          </View>
        </View>
        <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <Text style={styles.sectionSubtitle}>
            BLE Proximity Beacon tags for pet collars, backpacks, and keys.
          </Text>

          {items.map((item) => {
            const inRange = item.status === 'in_range';
            return (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemTopRow}>
                  <View style={styles.iconCircle}>
                    <Text style={styles.itemEmoji}>{item.avatarEmoji || '🏷️'}</Text>
                  </View>

                  <View style={styles.itemDetails}>
                    <View style={styles.nameLine}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.tagCode}>{item.tagCode}</Text>
                    </View>

                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.rangePill,
                          {
                            backgroundColor: inRange
                              ? COLORS.safeGreenLight
                              : COLORS.warnOrangeLight,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.rangePillText,
                            { color: inRange ? COLORS.safeGreen : COLORS.warnOrange },
                          ]}
                        >
                          {inRange ? '🟢 In Range (BLE)' : '⚪ Out of Range'}
                        </Text>
                      </View>

                      <Text style={styles.distanceText}>
                        {inRange ? `${item.distanceEstimate} (${item.rssi} dBm)` : 'Out of range'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.locationBar}>
                  <Text style={styles.locationText} numberOfLines={1}>
                    📍 {item.locationAddress} • 🔋 {item.batteryLevel}%
                  </Text>
                </View>

                {/* Actions */}
                <View style={styles.itemActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.ringBtn,
                      item.isRinging && styles.ringBtnActive,
                      !inRange && styles.ringBtnDisabled,
                    ]}
                    onPress={() => handleRingTag(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.ringBtnText}>
                      {item.isRinging ? '🔊 Beeping...' : '🔔 Ring Tag'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.simulateBtn}
                    onPress={() => handleToggleProximity(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.simulateBtnText}>
                      {inRange ? 'Simulate Exit' : 'Simulate Enter'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.addTagBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.addTagBtnText}>+ Add Pet Collar or BLE Item Tag</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal to register new BLE tag */}
      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Pair BLE Beacon Tag</Text>
            <Text style={styles.modalSub}>
              Attach a GuardianCircle BLE tag to your pet's collar or personal valuables.
            </Text>

            <View style={styles.typeSwitchRow}>
              <TouchableOpacity
                style={[styles.typeBtn, tagType === 'pet' && styles.typeBtnActive]}
                onPress={() => setTagType('pet')}
              >
                <Text style={styles.typeBtnText}>🐕 Pet (Dog/Cat)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, tagType === 'item' && styles.typeBtnActive]}
                onPress={() => setTagType('item')}
              >
                <Text style={styles.typeBtnText}>🎒 Valuables / Bag</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Tag Name</Text>
            <TextInput
              style={styles.input}
              placeholder={tagType === 'pet' ? 'e.g. Bella (Puppy)' : 'e.g. Laptop Sleeve'}
              placeholderTextColor={COLORS.textMuted}
              value={tagName}
              onChangeText={setTagName}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleAddTag}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Pair Beacon</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xxl,
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  tagCountBadge: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  tagCountText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  expandIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  body: {
    marginTop: SPACING.md,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  itemCard: {
    backgroundColor: '#F9FAFC',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemEmoji: {
    fontSize: 22,
  },
  itemDetails: {
    flex: 1,
  },
  nameLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  tagCode: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  rangePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  rangePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  distanceText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  locationBar: {
    backgroundColor: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    marginTop: SPACING.sm,
  },
  locationText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  itemActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACING.sm,
  },
  ringBtn: {
    flex: 1.2,
    backgroundColor: COLORS.infoBlueLight,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  ringBtnActive: {
    backgroundColor: '#FFE082',
  },
  ringBtnDisabled: {
    opacity: 0.5,
  },
  ringBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.infoBlue,
  },
  simulateBtn: {
    flex: 1,
    backgroundColor: '#EAECEF',
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  simulateBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  addTagBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addTagBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  modalBg: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.large,
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  typeSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: '#F1F3F5',
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    borderRadius: RADIUS.md,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#F0F0F0',
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  cancelModalBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  saveModalBtn: {
    flex: 1.5,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  saveModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
});
