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

export default function SafetyScreen() {
  const { user, userProfile } = useAuth();
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 1. Emergency Status Bar / Active Alert Banner */}
      {activeAlert ? (
        <View style={styles.activeEmergencyBanner}>
          <View style={styles.activeHeaderRow}>
            <Text style={styles.activeBlinkDot}>🔴</Text>
            <Text style={styles.activeAlertTitle}>EMERGENCY SOS ACTIVE</Text>
          </View>
          <Text style={styles.activeAlertText}>
            Trigger: {activeAlert.triggerType?.toUpperCase() || 'IN-APP'}
          </Text>
          <Text style={styles.activeAlertCoords}>
            📍 {activeAlert.location?.address || `${activeAlert.location?.lat?.toFixed?.(4)}, ${activeAlert.location?.lng?.toFixed?.(4)}`}
          </Text>
          <Text style={styles.activeAlertRecipients}>
            Recipients notified: Trusted Circle & linked guardians.
          </Text>

          <TouchableOpacity
            style={styles.resolveBtn}
            onPress={handleResolveAlert}
            activeOpacity={0.85}
          >
            <Text style={styles.resolveBtnText}>✓ I AM SAFE (RESOLVE SOS)</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.statusCard}>
          <Text style={styles.statusDot}>🟢</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Protection Shield Active</Text>
            <Text style={styles.statusSubtitle}>
              Sensors monitoring • Ready to dispatch SOS
            </Text>
          </View>
        </View>
      )}

      {/* 2. Main SOS Button Hub */}
      <View style={styles.sosCard}>
        <Text style={styles.sosHeading}>Tap to Broadcast Emergency</Text>
        <Text style={styles.sosSubheading}>
          Sends your real-time GPS coordinates and alert to your Trusted Circle & Admin Dashboard.
        </Text>

        <SosButton
          size="large"
          onAlertTriggered={(alertId) => {
            loadHistory();
          }}
        />

        <View style={styles.triggerBadgeRow}>
          <Text style={styles.triggerBadge}>⚡ Instant Dispatch</Text>
          <Text style={styles.triggerBadge}>🛰️ GPS & Reverse Geocoding</Text>
        </View>
      </View>

      {/* 3. Emergency Trigger Methods */}
      <Text style={styles.sectionHeader}>Emergency Trigger Controls</Text>

      {/* Shake to SOS */}
      <View style={styles.triggerRow}>
        <View style={styles.triggerInfo}>
          <Text style={styles.triggerName}>📳 Shake-to-SOS</Text>
          <Text style={styles.triggerDesc}>Vigorously shake phone to trigger 5s countdown</Text>
        </View>
        <Switch
          value={shakeEnabled}
          onValueChange={setShakeEnabled}
          trackColor={{ false: '#CCC', true: '#EF5350' }}
          thumbColor={shakeEnabled ? '#D32F2F' : '#F4F3F4'}
        />
      </View>

      {/* Fall / Sudden Stop Detection */}
      <View style={styles.triggerRow}>
        <View style={styles.triggerInfo}>
          <Text style={styles.triggerName}>⚠️ Fall & Sudden Stop</Text>
          <Text style={styles.triggerDesc}>Motion sensor detects abrupt impact with prompt</Text>
        </View>
        <Switch
          value={fallDetectionEnabled}
          onValueChange={setFallDetectionEnabled}
          trackColor={{ false: '#CCC', true: '#EF5350' }}
          thumbColor={fallDetectionEnabled ? '#D32F2F' : '#F4F3F4'}
        />
      </View>

      {/* Triple Volume Button Trigger */}
      <View style={styles.triggerRow}>
        <View style={styles.triggerInfo}>
          <Text style={styles.triggerName}>🔘 Triple Volume Press</Text>
          <Text style={styles.triggerDesc}>3 quick volume presses trigger 5s countdown</Text>
        </View>
        <Switch
          value={volumeButtonEnabled}
          onValueChange={setVolumeButtonEnabled}
          trackColor={{ false: '#CCC', true: '#EF5350' }}
          thumbColor={volumeButtonEnabled ? '#D32F2F' : '#F4F3F4'}
        />
      </View>

      {/* Simulation & QA Test Tools */}
      <View style={styles.simulationCard}>
        <Text style={styles.simulationTitle}>🧪 Sensor Testing & QA Simulations</Text>
        <Text style={styles.simulationNote}>
          Test emergency triggers directly without physical strain:
        </Text>
        <View style={styles.simButtonsGrid}>
          <TouchableOpacity
            style={styles.simBtn}
            onPress={simulateTriplePress}
            activeOpacity={0.7}
          >
            <Text style={styles.simBtnText}>🔘 Test 3x Volume</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.simBtn}
            onPress={simulateFall}
            activeOpacity={0.7}
          >
            <Text style={styles.simBtnText}>⚠️ Test Fall Modal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.simBtn}
            onPress={async () => {
              const id = await triggerWidgetSOS();
              loadHistory();
              Alert.alert('Widget Triggered', `Dispatched widget emergency with ID: ${id}`);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.simBtnText}>📱 Test Widget SOS</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. Emergency Speed Dialers */}
      <Text style={styles.sectionHeader}>Emergency Contacts & Speed Dial</Text>
      <View style={styles.speedDialGrid}>
        <TouchableOpacity
          style={[styles.dialCard, { borderLeftColor: '#1976D2' }]}
          onPress={() => dialEmergency('119', 'Police Emergency')}
          activeOpacity={0.75}
        >
          <Text style={styles.dialEmoji}>🚓</Text>
          <Text style={styles.dialName}>Police</Text>
          <Text style={styles.dialNumber}>119</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dialCard, { borderLeftColor: '#E53935' }]}
          onPress={() => dialEmergency('1990', 'Suwa Seriya Ambulance')}
          activeOpacity={0.75}
        >
          <Text style={styles.dialEmoji}>🚑</Text>
          <Text style={styles.dialName}>Ambulance</Text>
          <Text style={styles.dialNumber}>1990</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dialCard, { borderLeftColor: '#FB8C00' }]}
          onPress={() => dialEmergency('110', 'Fire & Rescue')}
          activeOpacity={0.75}
        >
          <Text style={styles.dialEmoji}>🚒</Text>
          <Text style={styles.dialName}>Fire & Rescue</Text>
          <Text style={styles.dialNumber}>110</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dialCard, { borderLeftColor: '#43A047' }]}
          onPress={() => dialEmergency('0112903903', 'Campus Security')}
          activeOpacity={0.75}
        >
          <Text style={styles.dialEmoji}>🏫</Text>
          <Text style={styles.dialName}>Campus Sec</Text>
          <Text style={styles.dialNumber}>011-2903903</Text>
        </TouchableOpacity>
      </View>

      {/* 5. Recent Alerts Log */}
      <Text style={styles.sectionHeader}>Recent Emergency Alerts</Text>
      {alertHistory.length === 0 ? (
        <View style={styles.emptyHistoryCard}>
          <Text style={styles.emptyHistoryText}>No emergency alerts on record. Stay safe!</Text>
        </View>
      ) : (
        alertHistory.slice(0, 5).map((item) => (
          <View key={item.id} style={styles.historyCard}>
            <View style={styles.historyTop}>
              <Text style={styles.historyType}>
                {item.triggerType?.toUpperCase() || 'EMERGENCY'}
              </Text>
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
            <Text style={styles.historyLocation}>
              📍 {item.location?.address || `${item.location?.lat?.toFixed?.(3)}, ${item.location?.lng?.toFixed?.(3)}`}
            </Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, paddingBottom: 40 },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  statusDot: { fontSize: 20, marginRight: 10 },
  statusTitle: { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  statusSubtitle: { fontSize: 12, color: '#4CAF50', marginTop: 1 },

  activeEmergencyBanner: {
    backgroundColor: '#FFEBEE',
    borderWidth: 2,
    borderColor: '#E53935',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  activeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  activeBlinkDot: { fontSize: 16, marginRight: 6 },
  activeAlertTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#D32F2F',
    letterSpacing: 1,
  },
  activeAlertText: { fontSize: 13, fontWeight: '700', color: '#333', marginTop: 2 },
  activeAlertCoords: { fontSize: 13, color: '#555', marginTop: 4 },
  activeAlertRecipients: { fontSize: 12, color: '#777', marginTop: 4, fontStyle: 'italic' },
  resolveBtn: {
    backgroundColor: '#2E7D32',
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  resolveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },

  sosCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sosHeading: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },
  sosSubheading: {
    fontSize: 12,
    color: '#757575',
    textAlign: 'center',
    marginHorizontal: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  triggerBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  triggerBadge: {
    backgroundColor: '#F1F3F4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#424242',
  },

  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#37474F',
    marginTop: 8,
    marginBottom: 10,
  },

  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  triggerInfo: { flex: 1, marginRight: 12 },
  triggerName: { fontSize: 14, fontWeight: '700', color: '#263238' },
  triggerDesc: { fontSize: 12, color: '#78909C', marginTop: 2 },

  simulationCard: {
    backgroundColor: '#ECEFF1',
    borderRadius: 12,
    padding: 14,
    marginVertical: 10,
  },
  simulationTitle: { fontSize: 13, fontWeight: '700', color: '#455A64' },
  simulationNote: { fontSize: 11, color: '#607D8B', marginVertical: 4 },
  simButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  simBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  simBtnText: { fontSize: 12, fontWeight: '600', color: '#37474F' },

  speedDialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  dialCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dialEmoji: { fontSize: 22, marginBottom: 2 },
  dialName: { fontSize: 12, fontWeight: '700', color: '#263238' },
  dialNumber: { fontSize: 14, fontWeight: '900', color: '#1E88E5', marginTop: 2 },

  emptyHistoryCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyHistoryText: { fontSize: 12, color: '#90A4AE', fontStyle: 'italic' },

  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyType: { fontSize: 12, fontWeight: '800', color: '#37474F' },
  historyStatus: { fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusActive: { backgroundColor: '#FFEBEE', color: '#D32F2F' },
  statusResolved: { backgroundColor: '#E8F5E9', color: '#2E7D32' },
  statusCancelled: { backgroundColor: '#ECEFF1', color: '#78909C' },
  historyLocation: { fontSize: 12, color: '#546E7A', marginTop: 4 },
  historyTime: { fontSize: 10, color: '#90A4AE', marginTop: 2 },
});