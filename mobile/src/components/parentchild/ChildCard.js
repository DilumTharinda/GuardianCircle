import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { ROUTES } from '../../constants/routes';

export default function ChildCard({
  child,
  onPress,
  onNavigateLocation,
  onNavigateHistory,
  onNavigateSafeZones,
  onOpenChildDevice,
  onUnlink,
  onToggleSOS,
}) {
  if (!child) return null;

  const isSOS = child.sosActive;
  const battery = child.batteryLevel ?? 80;
  const batteryColor =
    battery > 50 ? COLORS.safeGreen : battery > 20 ? COLORS.warnOrange : COLORS.dangerRed;

  return (
    <TouchableOpacity
      style={[styles.card, isSOS && styles.sosCard]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Child card for ${child.targetName}`}
    >
      {/* Header Row: Avatar, Name, Age, Online/SOS Badge */}
      <View style={styles.topRow}>
        <View style={styles.avatarContainer}>
          {child.targetPhotoURL ? (
            <Image source={{ uri: child.targetPhotoURL }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarEmojiBox}>
              <Text style={styles.avatarEmoji}>{child.avatarEmoji || '🧒'}</Text>
            </View>
          )}
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: child.isOnline ? COLORS.safeGreen : COLORS.textMuted },
            ]}
          />
        </View>

        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text style={styles.childName} numberOfLines={1}>
              {child.targetName}
            </Text>
            {child.targetAge && <Text style={styles.ageBadge}>{child.targetAge} yrs</Text>}
          </View>

          <View style={styles.statusRow}>
            <View style={[styles.pillBadge, { backgroundColor: COLORS.safeGreenLight }]}>
              <Text style={[styles.pillText, { color: COLORS.safeGreen }]}>
                {child.isOnline ? '🟢 Online' : '⚪ Offline'}
              </Text>
            </View>

            <View
              style={[
                styles.pillBadge,
                {
                  backgroundColor:
                    battery > 50
                      ? COLORS.safeGreenLight
                      : battery > 20
                      ? COLORS.warnOrangeLight
                      : COLORS.dangerRedLight,
                },
              ]}
            >
              <Text style={[styles.pillText, { color: batteryColor }]}>🔋 {battery}%</Text>
            </View>
          </View>
        </View>

        {isSOS && (
          <View style={styles.sosAlertPill}>
            <Text style={styles.sosAlertText}>🚨 SOS</Text>
          </View>
        )}
      </View>

      {/* Location & Safe Zone Banner */}
      <View style={styles.locationContainer}>
        <View style={styles.zoneRow}>
          <Text style={styles.zoneIcon}>📍</Text>
          <Text style={styles.zoneText} numberOfLines={1}>
            {child.currentZoneName || 'Location Active'}
          </Text>
        </View>
        <Text style={styles.addressText} numberOfLines={1}>
          {child.lastLocation?.address || 'Address updating...'}
        </Text>
      </View>

      {/* Movement / Activity & Last Updated Info */}
      <View style={styles.metaRow}>
        <Text style={styles.metaSpeed}>🏃 {child.speed || 'Stationary'}</Text>
        <Text style={styles.metaTime}>
          🕒 {child.lastLocation?.timestamp ? 'Updated just now' : 'Recent'}
        </Text>
      </View>

      {/* Quick Action Buttons Row 1 */}
      <View style={styles.actionsDivider} />
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={onNavigateLocation}
          activeOpacity={0.7}
        >
          <Text style={styles.actionBtnPrimaryText}>🗺️ Live Map</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onNavigateSafeZones}
          activeOpacity={0.7}
        >
          <Text style={styles.actionBtnText}>🛡️ Safe Zones</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onNavigateHistory}
          activeOpacity={0.7}
        >
          <Text style={styles.actionBtnText}>📜 History</Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons Row 2: Child Device Mode & Management */}
      <View style={[styles.actionsRow, { marginTop: 6 }]}>
        {onOpenChildDevice && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.childModeBtn]}
            onPress={onOpenChildDevice}
            activeOpacity={0.7}
          >
            <Text style={styles.childModeBtnText}>📱 View as Child (SOS)</Text>
          </TouchableOpacity>
        )}

        {onUnlink && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.unlinkBtn]}
            onPress={onUnlink}
            activeOpacity={0.7}
          >
            <Text style={styles.unlinkBtnText}>✕ Unlink</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.medium,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sosCard: {
    borderColor: COLORS.dangerRed,
    borderWidth: 2,
    backgroundColor: '#FFF5F5',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SPACING.md,
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.border,
  },
  avatarEmojiBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F0F4F8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 28,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childName: {
    ...TYPOGRAPHY.h3,
    fontSize: 17,
  },
  ageBadge: {
    fontSize: 12,
    color: COLORS.textSecondary,
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sosAlertPill: {
    backgroundColor: COLORS.dangerRed,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  sosAlertText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  locationContainer: {
    backgroundColor: '#F9FAFC',
    padding: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.infoBlue,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  zoneIcon: {
    fontSize: 14,
  },
  zoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
  },
  addressText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: 4,
  },
  metaSpeed: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  metaTime: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  actionsDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: SPACING.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#F1F3F5',
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: COLORS.primaryLight,
  },
  actionBtnPrimaryText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  actionBtnText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 11,
  },
  simSosBtn: {
    backgroundColor: '#FFF0F0',
    flex: 0.9,
  },
  simSosText: {
    color: COLORS.dangerRed,
    fontWeight: '700',
    fontSize: 11,
  },
  resolveBtn: {
    backgroundColor: COLORS.dangerRed,
    flex: 0.9,
  },
  resolveBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 11,
  },
  childModeBtn: {
    backgroundColor: '#0F172A',
    flex: 2,
    paddingVertical: 9,
  },
  childModeBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  unlinkBtn: {
    backgroundColor: '#FEE2E2',
    flex: 1,
    paddingVertical: 9,
  },
  unlinkBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 11,
  },
});
