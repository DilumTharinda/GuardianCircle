import React, { useState, useEffect, useRef } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Animated,
  Vibration,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { triggerSOS } from '../services/sosService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

export default function SosButton({ size = 'large', onAlertTriggered, customTriggerType = TRIGGER_TYPES.IN_APP }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const radarAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    // Continuous subtle pulsing animation
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // Radar ring wave
    const radarLoop = Animated.loop(
      Animated.parallel([
        Animated.timing(radarAnim, {
          toValue: 1.45,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    radarLoop.start();

    return () => {
      pulseLoop.stop();
      radarLoop.stop();
    };
  }, []);

  const handlePress = async () => {
    if (status === 'sending') return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      Vibration.vibrate([0, 80, 50, 120]);
    } catch (e) {}

    setStatus('sending');
    try {
      const alertId = await triggerSOS(customTriggerType);
      setStatus('sent');
      onAlertTriggered?.(alertId);
      setTimeout(() => setStatus('idle'), 4000);
    } catch (e) {
      console.warn('[SosButton] Trigger failed:', e.message);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3500);
    }
  };

  const isSmall = size === 'small';
  const buttonDimension = isSmall ? 110 : 170;

  return (
    <View style={styles.wrapper}>
      {/* Outer Radar Pulse Ring */}
      <Animated.View
        style={[
          styles.radarRing,
          {
            width: buttonDimension + 50,
            height: buttonDimension + 50,
            borderRadius: (buttonDimension + 50) / 2,
            transform: [{ scale: radarAnim }],
            opacity: opacityAnim,
          },
        ]}
      />

      <Animated.View
        style={{
          transform: [{ scale: pulseAnim }],
        }}
      >
        <Pressable
          style={[
            styles.button,
            {
              width: buttonDimension,
              height: buttonDimension,
              borderRadius: buttonDimension / 2,
              backgroundColor: status === 'error' ? '#C62828' : '#E53935',
            },
          ]}
          onPress={handlePress}
          disabled={status === 'sending'}
          accessibilityRole="button"
          accessibilityLabel="Emergency SOS Button"
        >
          {status === 'sending' ? (
            <View style={styles.statusContent}>
              <ActivityIndicator color="#FFF" size="large" />
              <Text style={styles.sendingText}>DISPATCHING...</Text>
            </View>
          ) : status === 'sent' ? (
            <View style={styles.statusContent}>
              <Text style={styles.sentCheck}>✓</Text>
              <Text style={styles.sentText}>ALERT SENT</Text>
            </View>
          ) : status === 'error' ? (
            <View style={styles.statusContent}>
              <Text style={styles.sentCheck}>⚠️</Text>
              <Text style={styles.sentText}>RETRY SOS</Text>
            </View>
          ) : (
            <View style={styles.idleContent}>
              <Text style={[styles.mainLabel, isSmall && { fontSize: 24 }]}>SOS</Text>
              <Text style={[styles.subLabel, isSmall && { fontSize: 9 }]}>
                EMERGENCY
              </Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 12,
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#E53935',
    backgroundColor: 'rgba(229, 57, 53, 0.12)',
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 4,
    borderColor: '#FFCDD2',
  },
  idleContent: {
    alignItems: 'center',
  },
  mainLabel: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 2,
  },
  subLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  statusContent: {
    alignItems: 'center',
  },
  sendingText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: 1,
  },
  sentCheck: {
    fontSize: 28,
    color: '#FFF',
    fontWeight: 'bold',
  },
  sentText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.5,
  },
});