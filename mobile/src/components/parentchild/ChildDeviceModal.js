import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Vibration,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';
import {
  triggerChildSOS,
  resolveChildSOS,
  childSendCheckIn,
  updateChildLocation,
} from '../../services/parentChildService';

export default function ChildDeviceModal({ visible, child, onClose, onStateChange }) {
  const [countdown, setCountdown] = useState(null);
  const [sosActive, setSosActive] = useState(child?.sosActive || false);
  const [loading, setLoading] = useState(false);
  const [simulatingMove, setSimulatingMove] = useState(false);
  const timerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (child) {
      setSosActive(child.sosActive || false);
    }
  }, [child]);

  // Pulsing animation when SOS is active
  useEffect(() => {
    if (sosActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [sosActive, pulseAnim]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!child) return null;

  // Handle Child SOS Initiation with 5-Second Abort Countdown
  function handleStartSOSCountdown() {
    Vibration.vibrate(200);
    setCountdown(5);

    let current = 5;
    timerRef.current = setInterval(async () => {
      current -= 1;
      if (current > 0) {
        setCountdown(current);
        Vibration.vibrate(100);
      } else {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setCountdown(null);
        await executeChildSOS();
      }
    }, 1000);
  }

  function handleCancelCountdown() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(null);
    Vibration.vibrate([0, 50, 50, 50]);
  }

  async function executeChildSOS() {
    setLoading(true);
    try {
      await triggerChildSOS(child.id, 'Child Device Emergency Button');
      setSosActive(true);
      Vibration.vibrate([0, 500, 200, 500]);
      if (onStateChange) onStateChange();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to dispatch SOS alert.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResolveSOS() {
    setLoading(true);
    try {
      await resolveChildSOS(child.id);
      setSosActive(false);
      Vibration.vibrate(100);
      Alert.alert('🛡️ SOS Marked Safe', 'Emergency alert has been resolved and your parent was notified.');
      if (onStateChange) onStateChange();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to resolve SOS.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendSafeCheckIn() {
    setLoading(true);
    try {
      await childSendCheckIn(child.id, "I'm safe and at my designated area!");
      setSosActive(false);
      Vibration.vibrate(100);
      Alert.alert('✅ Check-in Sent', 'Your check-in confirmation was sent to your Parent Guardian.');
      if (onStateChange) onStateChange();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send check-in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulateWalk() {
    setSimulatingMove(true);
    try {
      // Offset coords to move outside or inside current zone
      const latOffset = (Math.random() > 0.5 ? 1 : -1) * 0.004;
      const lonOffset = (Math.random() > 0.5 ? 1 : -1) * 0.004;
      const newCoords = {
        latitude: (child.lastLocation?.latitude || 6.9147) + latOffset,
        longitude: (child.lastLocation?.longitude || 79.8732) + lonOffset,
      };

      const result = await updateChildLocation(
        child.id,
        newCoords,
        `Sector Road near Colombo (${Math.floor(Math.random() * 50 + 1)})`
      );

      const transitions = result?.transitionSummary;
      let transitionMsg = `Child coordinates updated. Status: "${result?.currentZoneName}".`;
      if (transitions?.entered?.length > 0) {
        transitionMsg += `\n\n🟢 ENTERED: ${transitions.entered.join(', ')}`;
      }
      if (transitions?.exited?.length > 0) {
        transitionMsg += `\n\n🟡 EXITED: ${transitions.exited.join(', ')}`;
      }

      Alert.alert('🚶 Boundary Movement Simulated', transitionMsg);
      if (onStateChange) onStateChange();
    } catch (err) {
      Alert.alert('Error', 'Failed to simulate movement.');
    } finally {
      setSimulatingMove(false);
    }
  }

  const battery = child.batteryLevel ?? 85;
  const isInside = (child.currentZoneName || '').toLowerCase().includes('in transit') === false;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.deviceFrame}>
          {/* Top Phone Speaker / Notch Simulation */}
          <View style={styles.deviceNotch}>
            <View style={styles.speakerBar} />
            <View style={styles.cameraDot} />
          </View>

          {/* Child Device Header Bar */}
          <View style={styles.deviceHeader}>
            <View>
              <View style={styles.childHeaderTitleRow}>
                <Text style={styles.childHeaderEmoji}>{child.avatarEmoji || '🧒'}</Text>
                <Text style={styles.childHeaderName}>{child.targetName}</Text>
              </View>
              <Text style={styles.childHeaderSub}>
                Child Dependent Mode • Linked to Guardian
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Pairing Code Banner */}
            <View style={styles.pairingCodeBox}>
              <Text style={styles.pairingCodeLabel}>DEVICE LINKING CODE</Text>
              <Text style={styles.pairingCodeVal}>{child.targetUid ? child.targetUid.replace('uid_', 'GC-') : 'GC-849201'}</Text>
              <Text style={styles.pairingCodeSub}>Parents can pair with this 6-digit code</Text>
            </View>

            {/* Active SOS Alert Screen State */}
            {sosActive ? (
              <Animated.View style={[styles.sosActiveCard, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.sosActiveIcon}>🚨</Text>
                <Text style={styles.sosActiveTitle}>EMERGENCY SOS ACTIVE</Text>
                <Text style={styles.sosActiveDesc}>
                  Live GPS broadcast and emergency sirens sent to Parent Guardian! Help is on the way.
                </Text>
                <Text style={styles.sosActiveLocation}>
                  📍 {child.lastLocation?.address || 'Current Coordinates Broadcasted'}
                </Text>

                <TouchableOpacity
                  style={styles.resolveSosBtn}
                  onPress={handleResolveSOS}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.resolveSosBtnText}>🛡️ I am Safe — Cancel SOS</Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            ) : countdown !== null ? (
              /* Countdown In Progress Buffer */
              <View style={styles.countdownCard}>
                <Text style={styles.countdownWarning}>⚠️ SENDING EMERGENCY ALERT IN</Text>
                <Text style={styles.countdownNum}>{countdown}</Text>
                <Text style={styles.countdownSub}>Tap Cancel below if triggered by mistake</Text>
                <TouchableOpacity
                  style={styles.cancelCountdownBtn}
                  onPress={handleCancelCountdown}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelCountdownText}>✕ Cancel SOS Alert</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Normal Child Mode SOS Big Button */
              <View style={styles.sosTriggerSection}>
                <TouchableOpacity
                  style={styles.bigSosButton}
                  onPress={handleStartSOSCountdown}
                  activeOpacity={0.85}
                >
                  <Text style={styles.bigSosIcon}>🆘</Text>
                  <Text style={styles.bigSosTitle}>EMERGENCY SOS</Text>
                  <Text style={styles.bigSosSubtitle}>Tap to alert Parent instantly</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Child Status Indicators */}
            <View style={styles.statusGrid}>
              <View style={styles.statusBox}>
                <Text style={styles.statusLabel}>GEOFENCE STATUS</Text>
                <View style={[styles.statusPill, isInside ? styles.pillSafe : styles.pillTransit]}>
                  <Text style={[styles.statusPillText, isInside ? styles.textSafe : styles.textTransit]}>
                    {isInside ? '🟢 Inside Safe Zone' : '🟡 In Transit'}
                  </Text>
                </View>
                <Text style={styles.statusVal} numberOfLines={2}>
                  {child.currentZoneName || 'Location Active'}
                </Text>
              </View>

              <View style={styles.statusBox}>
                <Text style={styles.statusLabel}>DEVICE BATTERY</Text>
                <View style={[styles.statusPill, styles.pillSafe]}>
                  <Text style={[styles.statusPillText, styles.textSafe]}>🔋 {battery}% Charged</Text>
                </View>
                <Text style={styles.statusVal}>{child.speed || 'Stationary'}</Text>
              </View>
            </View>

            {/* Child Actions */}
            <Text style={styles.sectionHeader}>Child Actions & Simulation</Text>

            <TouchableOpacity
              style={styles.checkInBtn}
              onPress={handleSendSafeCheckIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.checkInBtnText}>📍 Send "I am Safe" Check-In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.walkBtn}
              onPress={handleSimulateWalk}
              disabled={simulatingMove}
              activeOpacity={0.8}
            >
              {simulatingMove ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Text style={styles.walkBtnText}>🚶 Walk / Cross Geofence Perimeter</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
  },
  deviceFrame: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '92%',
    backgroundColor: '#0F172A',
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#334155',
    overflow: 'hidden',
    ...SHADOWS.large,
  },
  deviceNotch: {
    height: 24,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  speakerBar: {
    width: 50,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
  },
  cameraDot: {
    width: 6,
    height: 6,
    backgroundColor: '#1E293B',
    borderRadius: 3,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  childHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childHeaderEmoji: {
    fontSize: 20,
  },
  childHeaderName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  childHeaderSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  pairingCodeBox: {
    backgroundColor: '#1E293B',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pairingCodeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 4,
  },
  pairingCodeVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 3,
  },
  pairingCodeSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  sosTriggerSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  bigSosButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 6,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    ...SHADOWS.large,
  },
  bigSosIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  bigSosTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1,
  },
  bigSosSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  countdownCard: {
    backgroundColor: '#7F1D1D',
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  countdownWarning: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FCA5A5',
    letterSpacing: 1,
  },
  countdownNum: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFF',
    marginVertical: SPACING.sm,
  },
  countdownSub: {
    fontSize: 12,
    color: '#FECACA',
    marginBottom: SPACING.lg,
  },
  cancelCountdownBtn: {
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: RADIUS.full,
  },
  cancelCountdownText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 14,
  },
  sosActiveCard: {
    backgroundColor: '#991B1B',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  sosActiveIcon: {
    fontSize: 40,
    marginBottom: 6,
  },
  sosActiveTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1,
  },
  sosActiveDesc: {
    fontSize: 12,
    color: '#FEE2E2',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  sosActiveLocation: {
    fontSize: 11,
    color: '#FCA5A5',
    marginTop: 8,
    fontWeight: '600',
  },
  resolveSosBtn: {
    backgroundColor: '#22C55E',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: RADIUS.full,
    marginTop: SPACING.lg,
  },
  resolveSosBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13,
  },
  statusGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  statusBox: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginBottom: 6,
  },
  pillSafe: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  pillTransit: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textSafe: {
    color: '#4ADE80',
  },
  textTransit: {
    color: '#FDE047',
  },
  statusVal: {
    fontSize: 12,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  checkInBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  checkInBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  walkBtn: {
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  walkBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 13,
  },
});
