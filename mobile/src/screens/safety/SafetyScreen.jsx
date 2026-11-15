import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Linking,
  Alert,
  Platform,
  Vibration,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import SosButton from '../../components/SosButton';
import CountdownModal from '../../components/CountdownModal';
import FallDetectionModal from '../../components/FallDetectionModal';
import { useShakeSOS } from '../../hooks/useShakeSOS';
import { useVolumeButtonTrigger } from '../../hooks/useVolumeButtonTrigger';
import { useFallDetection } from '../../hooks/useFallDetection';
import { initWidgetListener, triggerWidgetSOS } from '../../services/widgetService';
import {
  subscribeToUserActiveAlert,
  resolveAlert,
  getAlertHistory,
} from '../../services/alertService';
import { triggerSOS } from '../../services/sosService';
import { TRIGGER_TYPES } from '../../constants/alertTriggers';
import { useTheme } from '../../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import NotificationBell from '../../components/common/NotificationBell';
import ThemeToggle from '../../components/ThemeToggle';
import { scale, verticalScale, normalize } from '../../utils/responsive';
import { FONTS, SPACING, RADIUS } from '../../constants/theme';

export default function SafetyScreen() {
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = user?.uid || 'demo_user_active';

  // Active SOS alert state
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Trigger Settings Toggles
  const [shakeEnabled, setShakeEnabled] = useState(true);
  const [fallDetectionEnabled, setFallDetectionEnabled] = useState(true);
  const [volumeButtonEnabled, setVolumeButtonEnabled] = useState(true);

  // Modals state
  const [countdownVisible, setCountdownVisible] = useState(false);
  const [countdownTriggerType, setCountdownTriggerType] = useState('shake');
  const [cancelCountdownFn, setCancelCountdownFn] = useState(null);

  const [fallModalVisible, setFallModalVisible] = useState(false);
  const fallActionRef = useRef(null);

  // 1. Subscribe to real-time active alert
  useEffect(() => {
    const unsub = subscribeToUserActiveAlert(userId, (alertDoc) => {
      setActiveAlert(alertDoc);
      loadHistory();
    });

    loadHistory();
    return () => unsub?.();
  }, [userId]);

  // 2. Widget Listener
  useEffect(() => {
    const cleanup = initWidgetListener((alertId) => {
      console.log('Widget alert received:', alertId);
      loadHistory();
    });
    return cleanup;
  }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const history = await getAlertHistory(userId);
      setAlertHistory(history);
    } catch (e) {
      console.warn('[SafetyScreen] History load error:', e);
    } finally {
      setLoadingHistory(false);
    }
  }

  // 3. Sensor Triggers Hook Integrations
  useShakeSOS(
    (cancelFn, type, seconds) => {
      setCancelCountdownFn(() => cancelFn);
      setCountdownTriggerType(type);
      setCountdownVisible(true);
    },
    shakeEnabled
  );

  const { simulateTriplePress } = useVolumeButtonTrigger(
    (cancelFn, type, seconds) => {
      setCancelCountdownFn(() => cancelFn);
      setCountdownTriggerType(type);
      setCountdownVisible(true);
    },
    volumeButtonEnabled
  );

  const { simulateFall } = useFallDetection(
    ({ cancel, remaining, triggerEmergencyNow }) => {
      fallActionRef.current = { cancel, triggerEmergencyNow };
      setFallModalVisible(true);
      try {
        Vibration.vibrate([0, 200, 100, 300]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {}
    },
    fallDetectionEnabled
  );

  // Modal Handlers
  const handleCancelCountdown = () => {
    if (cancelCountdownFn) {
      cancelCountdownFn();
      setCancelCountdownFn(null);
    }
    setCountdownVisible(false);
  };

  const handleDismissFall = () => {
    if (fallActionRef.current?.cancel) {
      fallActionRef.current.cancel();
    }
    setFallModalVisible(false);
  };

  const handleTriggerFallSOSNow = () => {
    if (fallActionRef.current?.triggerEmergencyNow) {
      fallActionRef.current.triggerEmergencyNow();
    }
    setFallModalVisible(false);
  };

  // Resolve active alert
  const handleResolveAlert = async () => {
    if (!activeAlert?.id) return;
    try {
      await resolveAlert(activeAlert.id, 'User confirmed safe and resolved emergency');
      setActiveAlert(null);
      Alert.alert('Emergency Resolved', 'Your status has been updated to safe.');
      loadHistory();
    } catch (e) {
      Alert.alert('Error', 'Could not resolve alert. Please try again.');
    }
  };

  // Dial emergency services
  const dialEmergency = (number, label) => {
    Alert.alert(
      `Call ${label}?`,
      `This will place a direct telephone call to ${number}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call Now',
          style: 'destructive',
          onPress: () => Linking.openURL(`tel:${number}`),
        },
      ]
    );
  };

  const styles = getStyles(colors, isDark, insets);

  return (
    <View style={styles.screenWrapper}>
      {/* Top Green Gradient Header matching Map Screen */}
      <LinearGradient
        colors={[colors.darkGreen, colors.darkGreenMid]}
        style={styles.greenHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerTitleRow}>
          <Ionicons name="shield" size={22} color="#FFF" />
          <Text style={styles.headerTitleText} numberOfLines={1}>Safety</Text>
        </View>
        <ThemeToggle iconColor="#FFF" style={{ marginRight: 6 }} />
        <NotificationBell iconColor="#FFF" size={20} />
      </LinearGradient>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* 1. Emergency Status Bar / Active Alert Banner */}
      {activeAlert ? (
        <View style={styles.activeEmergencyBanner}>
          <View style={styles.activeHeaderRow}>
            <View style={styles.activePulseIcon}>
              <MaterialIcons name="emergency" size={18} color="#D32F2F" />
            </View>
            <Text style={styles.activeAlertTitle}>EMERGENCY SOS ACTIVE</Text>
          </View>
          <Text style={styles.activeAlertText}>
            Trigger: {activeAlert.triggerType?.toUpperCase() || 'IN-APP'}
          </Text>
          <View style={styles.locRow}>
            <MaterialIcons name="place" size={16} color={colors.dangerRed || '#D32F2F'} />
            <Text style={styles.activeAlertCoords}>
              {activeAlert.location?.address || `${activeAlert.location?.lat?.toFixed?.(4)}, ${activeAlert.location?.lng?.toFixed?.(4)}`}
            </Text>
          </View>
          <Text style={styles.activeAlertRecipients}>
            Recipients notified: Trusted Circle & linked guardians.
          </Text>

          <TouchableOpacity
            style={styles.resolveBtn}
            onPress={handleResolveAlert}
            activeOpacity={0.85}
          >
            <MaterialIcons name="check-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.resolveBtnText}>I AM SAFE (RESOLVE SOS)</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.statusCard}>
          <View style={styles.shieldBadge}>
            <MaterialIcons name="verified-user" size={24} color={colors.darkGreenMid || '#06756A'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle} numberOfLines={1}>Protection Shield Active</Text>
            <Text style={styles.statusSubtitle} numberOfLines={1} ellipsizeMode="tail">
              Sensors monitoring • Ready to dispatch SOS
            </Text>
          </View>
        </View>
      )}

      {/* 2. Main SOS Button Hub */}
      <View style={styles.sosCard}>
        <Text style={styles.sosHeading} numberOfLines={1}>Tap to Broadcast Emergency</Text>
        <Text style={styles.sosSubheading} numberOfLines={2}>
          Sends your real-time GPS coordinates and alert to your Trusted Circle & Admin Dashboard.
        </Text>

        <SosButton
          size="large"
          onAlertTriggered={(alertId) => {
            loadHistory();
          }}
        />

        <View style={styles.triggerBadgeRow}>
          <View style={styles.triggerBadge}>
            <MaterialIcons name="flash-on" size={14} color="#E65100" />
            <Text style={styles.triggerBadgeText}>Instant Dispatch</Text>
          </View>
          <View style={styles.triggerBadge}>
            <MaterialIcons name="my-location" size={14} color="#1565C0" />
            <Text style={styles.triggerBadgeText}>Live GPS Geocoding</Text>
          </View>
        </View>
      </View>

      {/* 3. Emergency Trigger Controls */}
      <Text style={styles.sectionHeader}>Emergency Trigger Controls</Text>

      {/* Shake to SOS */}
      <View style={styles.triggerRow}>
        <View style={styles.triggerIconContainer}>
          <MaterialIcons name="vibration" size={22} color={colors.darkGreenMid || '#06756A'} />
        </View>
        <View style={styles.triggerInfo}>
          <Text style={styles.triggerName} numberOfLines={1}>Shake-to-SOS</Text>
          <Text style={styles.triggerDesc} numberOfLines={1} ellipsizeMode="tail">Vigorously shake phone to trigger 5s countdown</Text>
        </View>
        <Switch
          value={shakeEnabled}
          onValueChange={setShakeEnabled}
          trackColor={{ false: '#CCC', true: colors.primary || '#EF5350' }}
          thumbColor={shakeEnabled ? (colors.primaryDark || '#D32F2F') : '#F4F3F4'}
        />
      </View>

      {/* Fall / Sudden Stop Detection */}
      <View style={styles.triggerRow}>
        <View style={styles.triggerIconContainer}>
          <MaterialCommunityIcons name="car-brake-alert" size={22} color={colors.warnOrange || '#FB8C00'} />
        </View>
        <View style={styles.triggerInfo}>
          <Text style={styles.triggerName} numberOfLines={1}>Fall & Sudden Stop</Text>
          <Text style={styles.triggerDesc} numberOfLines={1} ellipsizeMode="tail">Motion sensor detects abrupt impact with prompt</Text>
        </View>
        <Switch
          value={fallDetectionEnabled}
          onValueChange={setFallDetectionEnabled}
          trackColor={{ false: '#CCC', true: colors.primary || '#EF5350' }}
          thumbColor={fallDetectionEnabled ? (colors.primaryDark || '#D32F2F') : '#F4F3F4'}
        />
      </View>

      {/* Triple Volume Button Trigger */}
      <View style={styles.triggerRow}>
        <View style={styles.triggerIconContainer}>
          <MaterialIcons name="volume-up" size={22} color={colors.infoBlue || '#1976D2'} />
        </View>
        <View style={styles.triggerInfo}>
          <Text style={styles.triggerName} numberOfLines={1}>Triple Volume Press</Text>
          <Text style={styles.triggerDesc} numberOfLines={1} ellipsizeMode="tail">3 quick volume presses trigger 5s countdown</Text>
        </View>
        <Switch
          value={volumeButtonEnabled}
          onValueChange={setVolumeButtonEnabled}
          trackColor={{ false: '#CCC', true: colors.primary || '#EF5350' }}
          thumbColor={volumeButtonEnabled ? (colors.primaryDark || '#D32F2F') : '#F4F3F4'}
        />
      </View>

      {/* 4. Emergency Speed Dialers */}
      <Text style={styles.sectionHeader}>Emergency Contacts & Speed Dial</Text>
      <View style={styles.speedDialGrid}>
        <TouchableOpacity
          style={[styles.dialCard, { borderLeftColor: '#1976D2' }]}
          onPress={() => dialEmergency('119', 'Police Emergency')}
          activeOpacity={0.75}
        >
          <View style={[styles.dialIconCircle, { backgroundColor: '#E3F2FD' }]}>
            <MaterialIcons name="local-police" size={24} color="#1976D2" />
          </View>
          <Text style={styles.dialName} numberOfLines={1}>Police</Text>
          <Text style={styles.dialNumber} numberOfLines={1}>119</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dialCard, { borderLeftColor: '#E53935' }]}
          onPress={() => dialEmergency('1990', 'Suwa Seriya Ambulance')}
          activeOpacity={0.75}
        >
          <View style={[styles.dialIconCircle, { backgroundColor: '#FFEBEE' }]}>
            <MaterialIcons name="medical-services" size={24} color="#E53935" />
          </View>
          <Text style={styles.dialName} numberOfLines={1}>Ambulance</Text>
          <Text style={[styles.dialNumber, { color: '#E53935' }]} numberOfLines={1}>1990</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dialCard, { borderLeftColor: '#FB8C00' }]}
          onPress={() => dialEmergency('110', 'Fire & Rescue')}
          activeOpacity={0.75}
        >
          <View style={[styles.dialIconCircle, { backgroundColor: '#FFF3E0' }]}>
            <MaterialIcons name="fire-extinguisher" size={24} color="#FB8C00" />
          </View>
          <Text style={styles.dialName} numberOfLines={1}>Fire & Rescue</Text>
          <Text style={[styles.dialNumber, { color: '#FB8C00' }]} numberOfLines={1}>110</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dialCard, { borderLeftColor: '#43A047' }]}
          onPress={() => dialEmergency('0112903903', 'Campus Security')}
          activeOpacity={0.75}
        >
          <View style={[styles.dialIconCircle, { backgroundColor: '#E8F5E9' }]}>
            <MaterialIcons name="security" size={24} color="#43A047" />
          </View>
          <Text style={styles.dialName} numberOfLines={1}>Campus Sec</Text>
          <Text style={[styles.dialNumber, { color: '#43A047' }]} numberOfLines={1}>011-2903903</Text>
        </TouchableOpacity>
      </View>

      {/* 5. Recent Alerts Log */}
      <Text style={styles.sectionHeader}>Recent Emergency Alerts</Text>
      {alertHistory.length === 0 ? (
        <View style={styles.emptyHistoryCard}>
          <MaterialIcons name="health-and-safety" size={28} color={colors.textSecondary || '#90A4AE'} style={{ marginBottom: 4 }} />
          <Text style={styles.emptyHistoryText}>No emergency alerts on record. Stay safe!</Text>
        </View>
      ) : (
        alertHistory.slice(0, 5).map((item) => (
          <View key={item.id} style={styles.historyCard}>
            <View style={styles.historyTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="notifications-active" size={16} color={colors.darkGreenMid || '#06756A'} />
                <Text style={styles.historyType}>
                  {item.triggerType?.toUpperCase() || 'EMERGENCY'}
                </Text>
              </View>
              <Text
                style={[
                  styles.historyStatus,
                  item.status === 'resolved'
                    ? styles.statusResolved
                    : item.status === 'cancelled'
                    ? styles.statusCancelled
                    : styles.statusActive,
                ]}
              >
                {item.status?.toUpperCase() || 'DISPATCHED'}
              </Text>
            </View>
            <View style={styles.historyLocRow}>
              <MaterialIcons name="place" size={14} color={colors.textSecondary || '#546E7A'} />
              <Text style={styles.historyLocation}>
                {item.location?.address || `${item.location?.lat?.toFixed?.(3)}, ${item.location?.lng?.toFixed?.(3)}`}
              </Text>
            </View>
            <Text style={styles.historyTime}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
            </Text>
          </View>
        ))
      )}

      {/* Countdown and Fall Modals */}
      <CountdownModal
        visible={countdownVisible}
        seconds={5}
        triggerType={countdownTriggerType}
        onCancel={handleCancelCountdown}
      />

      <FallDetectionModal
        visible={fallModalVisible}
        onDismiss={handleDismissFall}
        onTriggerNow={handleTriggerFallSOSNow}
      />
    </ScrollView>
  </View>
  );
}

const getStyles = (colors, isDark, insets) =>
  StyleSheet.create({
    screenWrapper: { flex: 1, backgroundColor: colors.background },
    greenHeader: {
      paddingTop: (insets?.top ?? 24) + 4,
      paddingBottom: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerTitleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitleText: {
      fontSize: normalize(18),
      fontWeight: 'bold',
      color: '#FFF',
    },
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: scale(16), paddingBottom: Math.max(insets?.bottom || 0, 24) + 20 },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? (colors.surface || '#1A2420') : '#E8F5E9',
    padding: scale(16),
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isDark ? (colors.border || 'rgba(255,255,255,0.08)') : '#C8E6C9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  shieldBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(6, 117, 106, 0.25)' : '#C8E6C9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontSize: normalize(15), fontWeight: '700', color: colors.darkGreenMid || '#2E7D32' },
  statusSubtitle: { fontSize: normalize(12), color: isDark ? colors.textSecondary : '#4CAF50', marginTop: 2 },

  activeEmergencyBanner: {
    backgroundColor: isDark ? 'rgba(211, 47, 47, 0.15)' : '#FFEBEE',
    borderWidth: 2,
    borderColor: colors.dangerRed || '#E53935',
    padding: scale(16),
    borderRadius: 16,
    marginBottom: 16,
  },
  activeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  activePulseIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFCDD2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeAlertTitle: {
    fontSize: normalize(15),
    fontWeight: '900',
    color: colors.dangerRed || '#D32F2F',
    letterSpacing: 0.8,
  },
  activeAlertText: { fontSize: normalize(13), fontWeight: '700', color: colors.textPrimary || '#333', marginTop: 2 },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  activeAlertCoords: { fontSize: normalize(13), color: colors.textSecondary || '#555', flex: 1 },
  activeAlertRecipients: { fontSize: normalize(12), color: colors.textSecondary || '#777', marginTop: 6, fontStyle: 'italic' },
  resolveBtn: {
    backgroundColor: colors.darkGreenMid || '#2E7D32',
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  resolveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: normalize(13), letterSpacing: 0.5 },

  sosCard: {
    backgroundColor: colors.surface || '#FFFFFF',
    borderRadius: 20,
    padding: scale(20),
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border || 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  sosHeading: { fontSize: normalize(18), fontWeight: 'bold', color: colors.textPrimary || '#1A1A1A' },
  sosSubheading: {
    fontSize: normalize(12),
    color: colors.textSecondary || '#757575',
    textAlign: 'center',
    marginHorizontal: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  triggerBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F3F4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  triggerBadgeText: {
    fontSize: normalize(11),
    fontWeight: '600',
    color: colors.textPrimary || '#424242',
  },

  sectionHeader: {
    fontSize: normalize(15),
    fontWeight: '700',
    color: colors.textPrimary || '#37474F',
    marginTop: 8,
    marginBottom: 10,
  },

  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface || '#FFFFFF',
    padding: scale(14),
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border || 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.2 : 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  triggerIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F4F6F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  triggerInfo: { flex: 1, marginRight: 12 },
  triggerName: { fontSize: normalize(14), fontWeight: '700', color: colors.textPrimary || '#263238' },
  triggerDesc: { fontSize: normalize(12), color: colors.textSecondary || '#78909C', marginTop: 2 },

  speedDialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  dialCard: {
    width: '48%',
    backgroundColor: colors.surface || '#FFFFFF',
    borderRadius: 14,
    padding: scale(12),
    borderLeftWidth: 4,
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border || 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.2 : 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dialIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dialName: { fontSize: normalize(13), fontWeight: '700', color: colors.textPrimary || '#263238' },
  dialNumber: { fontSize: normalize(15), fontWeight: '900', color: '#1E88E5', marginTop: 2 },

  emptyHistoryCard: {
    backgroundColor: colors.surface || '#FFFFFF',
    padding: scale(20),
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border || 'transparent',
  },
  emptyHistoryText: { fontSize: normalize(12), color: colors.textSecondary || '#90A4AE', fontStyle: 'italic' },

  historyCard: {
    backgroundColor: colors.surface || '#FFFFFF',
    borderRadius: 14,
    padding: scale(14),
    marginBottom: 10,
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border || 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.15 : 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyType: { fontSize: normalize(12), fontWeight: '800', color: colors.textPrimary || '#37474F' },
  historyStatus: { fontSize: normalize(10), fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  statusActive: { backgroundColor: '#FFEBEE', color: '#D32F2F' },
  statusResolved: { backgroundColor: '#E8F5E9', color: '#2E7D32' },
  statusCancelled: { backgroundColor: '#ECEFF1', color: '#78909C' },
  historyLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  historyLocation: { fontSize: normalize(12), color: colors.textSecondary || '#546E7A', flex: 1 },
  historyTime: { fontSize: normalize(10), color: colors.textSecondary || '#90A4AE', marginTop: 4 },
});