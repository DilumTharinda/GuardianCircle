import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useNotificationPreferences } from '../../hooks/useNotificationPreferences';
import { RADIUS, SHADOWS, SPACING } from '../../constants/theme';

export default function NotificationSettingsScreen() {
  const { colors, isDark } = useTheme();
  const { preferences, updatePreference, error } = useNotificationPreferences();

  // Optimistic local state for instant switch response
  const [localPrefs, setLocalPrefs] = useState(preferences);

  useEffect(() => {
    setLocalPrefs(preferences);
  }, [preferences]);

  const handleToggle = (key, val) => {
    // 1. Instantly flip local switch state
    setLocalPrefs((prev) => ({ ...prev, [key]: val }));
    // 2. Persist in background without blocking UI
    updatePreference(key, val);
  };

  const styles = getStyles(colors, isDark);

  const categories = [
    {
      key: 'sos',
      title: 'Emergency SOS Alerts',
      desc: 'Critical emergency signals, fall alerts, and immediate community SOS. Always active.',
      icon: 'warning',
      color: colors.dangerRed,
      locked: true,
    },
    {
      key: 'lostFound',
      title: 'CircleFind & Item Alerts',
      desc: 'Updates on your missing item reports, potential matches, and local community alerts.',
      icon: 'search',
      color: colors.darkGreenMid,
      locked: false,
    },
    {
      key: 'journey',
      title: 'Journey & Navigation Updates',
      desc: 'Notifications when routing through unsafe areas or reaching check-ins.',
      icon: 'explore',
      color: '#1976D2',
      locked: false,
    },
    {
      key: 'reminders',
      title: 'Safety Reminders & Tips',
      desc: 'Community safety updates, profile tips, and service updates.',
      icon: 'notifications',
      color: '#FB8C00',
      locked: false,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        {categories.map((item, index) => {
          const isEnabled = localPrefs[item.key] ?? true;
          const isLast = index === categories.length - 1;

          return (
            <View
              key={item.key}
              style={[styles.prefRow, !isLast && styles.prefRowBorder]}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color + '15' }]}>
                <MaterialIcons name={item.icon} size={20} color={item.color} />
              </View>

              <View style={styles.textContainer}>
                <View style={styles.titleRow}>
                  <Text style={styles.prefTitle}>{item.title}</Text>
                  {item.locked && (
                    <View style={styles.lockedBadge}>
                      <Text style={styles.lockedText}>Always On</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.prefDesc}>{item.desc}</Text>
              </View>

              <View style={styles.switchWrapper}>
                <Switch
                  value={isEnabled}
                  disabled={item.locked}
                  onValueChange={(val) => handleToggle(item.key, val)}
                  trackColor={{ false: isDark ? '#424242' : '#CFD8DC', true: colors.darkGreenMid + '80' }}
                  thumbColor={isEnabled ? colors.darkGreenMid : isDark ? '#B0BEC5' : '#ECEFF1'}
                />
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingTop: 16,
      paddingBottom: 40,
    },
    errorBox: {
      backgroundColor: '#FFEBEE',
      borderRadius: RADIUS.md,
      padding: 12,
      marginBottom: 14,
    },
    errorText: {
      color: colors.dangerRed,
      fontSize: 12,
      fontWeight: '600',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8ECEF',
      overflow: 'hidden',
      ...SHADOWS.small,
    },
    prefRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 14,
    },
    prefRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F6',
    },
    iconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textContainer: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    prefTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    lockedBadge: {
      backgroundColor: isDark ? 'rgba(211, 47, 47, 0.2)' : '#FFEBEE',
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 6,
    },
    lockedText: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.dangerRed,
    },
    prefDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    switchWrapper: {
      marginLeft: 4,
    },
  });

