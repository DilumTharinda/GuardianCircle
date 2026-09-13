import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';

export default function CountdownModal({ visible, seconds = 5, triggerType = 'Emergency Trigger', onCancel }) {
  const [remaining, setRemaining] = useState(seconds);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (!visible) {
      setRemaining(seconds);
      return;
    }

    setRemaining(seconds);

    // Pulse animation
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      loop.stop();
    };
  }, [visible, seconds]);

  if (!visible) return null;

  const triggerLabels = {
    shake: 'Shake Gesture Detected',
    volume_button: 'Triple Volume Button Press',
    widget: 'Lockscreen Widget Tap',
    fall_detection: 'Fall Sensor Trigger',
    in_app: 'SOS Initiated',
  };

  const label = triggerLabels[triggerType] || 'Emergency Trigger';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.badge}>🚨 SOS COUNTDOWN</Text>

          <Text style={styles.triggerTitle}>{label}</Text>
          <Text style={styles.subText}>
            Emergency alert will be dispatched to your Trusted Circle & linked parents in:
          </Text>

          <Animated.View style={[styles.timerCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.timerText}>{remaining}</Text>
            <Text style={styles.secondsLabel}>SECONDS</Text>
          </Animated.View>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Cancel Emergency Alert"
          >
            <Text style={styles.cancelBtnText}>✕ CANCEL SOS</Text>
          </TouchableOpacity>

          <Text style={styles.helpText}>Tap Cancel if triggered by mistake</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E1E24',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E53935',
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  badge: {
    color: '#FF5252',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  triggerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subText: {
    fontSize: 13,
    color: '#B0BEC5',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  timerCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#D32F2F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 4,
    borderColor: '#FF8A80',
  },
  timerText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  secondsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFCDD2',
    letterSpacing: 1,
  },
  cancelBtn: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelBtnText: {
    color: '#D32F2F',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  helpText: {
    fontSize: 12,
    color: '#78909C',
  },
});
