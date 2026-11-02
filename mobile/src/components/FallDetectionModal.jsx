import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';

export default function FallDetectionModal({ visible, initialSeconds = 15, onDismiss, onTriggerNow }) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (!visible) {
      setRemaining(initialSeconds);
      return;
    }

    setRemaining(initialSeconds);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      loop.stop();
    };
  }, [visible, initialSeconds]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.iconEmoji}>⚠️</Text>
          </Animated.View>

          <Text style={styles.title}>Fall / Impact Detected</Text>
          <Text style={styles.question}>Are you OK?</Text>

          <Text style={styles.description}>
            A sudden impact or sudden stop in motion was detected. If you do not respond, an emergency SOS alert with your live GPS location will be dispatched automatically.
          </Text>

          <View style={styles.countdownContainer}>
            <Text style={styles.countdownNumber}>{remaining}</Text>
            <Text style={styles.countdownLabel}>seconds remaining to respond</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.okButton}
              onPress={onDismiss}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="I am OK"
            >
              <Text style={styles.okButtonText}>✓ I'M OK — DISMISS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emergencyButton}
              onPress={onTriggerNow}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Send Emergency SOS Now"
            >
              <Text style={styles.emergencyButtonText}>🚨 SEND SOS NOW</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E1E24',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF9800',
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  iconEmoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFA726',
    textAlign: 'center',
  },
  question: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
    marginBottom: 10,
  },
  description: {
    fontSize: 13,
    color: '#CFD8DC',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  countdownContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  countdownNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FF5252',
  },
  countdownLabel: {
    fontSize: 11,
    color: '#B0BEC5',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  okButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  okButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  emergencyButton: {
    backgroundColor: '#D32F2F',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  emergencyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
