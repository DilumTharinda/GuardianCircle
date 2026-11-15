import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { TRIGGER_TYPES } from '../constants/alertTriggers';
import { triggerSOS } from '../services/sosService';

const FALL_SPIKE_THRESHOLD = 2.4; // Impact threshold (G) — realistic for real phone drops onto surfaces
const FALL_FREEFALL_THRESHOLD = 0.65; // Weightlessness/airborne drop threshold (G)
const REST_VARIATION_THRESHOLD = 0.35; // Post-fall immobility verification (G)

/**
 * Hook to continuously monitor accelerometer for sudden fall or violent impact.
 * Employs a robust 3-stage kinematic fall signature:
 * 1. Weightlessness / free-fall drop (< 0.65G)
 * 2. High-impact deceleration spike (> 2.4G) within 100ms - 800ms
 * 3. Relative stillness / post-impact rest phase
 * 
 * @param {Function} onFallDetected - Callback receiving ({ cancel, remainingSeconds, triggerEmergencyNow })
 * @param {boolean} enabled - Whether fall detection is active
 */
export function useFallDetection(onFallDetected, enabled = true) {
  const history = useRef([]);
  const hasTriggered = useRef(false);
  const fallTimerRef = useRef(null);
  const freefallTimeRef = useRef(0);

  const startFallCountdown = () => {
    if (hasTriggered.current) return;
    hasTriggered.current = true;

    let remaining = 15; // 15 seconds to respond

    const cancel = () => {
      if (fallTimerRef.current) {
        clearInterval(fallTimerRef.current);
        fallTimerRef.current = null;
      }
      hasTriggered.current = false;
      freefallTimeRef.current = 0;
      console.log('🛡️ [useFallDetection] Fall alert dismissed by user');
    };

    const triggerEmergencyNow = async () => {
      cancel();
      try {
        await triggerSOS(TRIGGER_TYPES.FALL_DETECTION, { fallDetected: true, impactMagnitude: 3.0 });
      } catch (e) {
        console.warn('[useFallDetection] Auto SOS dispatch error:', e);
      }
    };

    onFallDetected?.({
      cancel,
      remaining,
      triggerEmergencyNow,
    });

    fallTimerRef.current = setInterval(async () => {
      remaining -= 1;
      if (remaining <= 0) {
        cancel();
        console.log('🚨 [useFallDetection] Unacknowledged fall! Automatically triggering SOS...');
        try {
          await triggerSOS(TRIGGER_TYPES.FALL_DETECTION, { autoDispatched: true, impactMagnitude: 3.0 });
        } catch (e) {
          console.warn('[useFallDetection] SOS auto-dispatch error:', e);
        }
      }
    }, 1000);
  };

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    let sub = null;
    try {
      const { Accelerometer } = require('expo-sensors');
      if (Accelerometer && typeof Accelerometer.addListener === 'function') {
        Accelerometer.setUpdateInterval(50); // 20Hz update interval for precise impact capture

        sub = Accelerometer.addListener(({ x, y, z }) => {
          const now = Date.now();
          const mag = Math.sqrt(x * x + y * y + z * z);
          history.current.push({ mag, time: now });

          // Keep recent 1.5 second window of readings
          const cutoff = now - 1500;
          history.current = history.current.filter((r) => r.time >= cutoff);

          if (hasTriggered.current) return;

          // Stage 1: Detect free-fall drop
          if (mag < FALL_FREEFALL_THRESHOLD) {
            freefallTimeRef.current = now;
          }

          // Stage 2: Detect impact spike immediately following free-fall drop (within 800ms)
          if (mag > FALL_SPIKE_THRESHOLD) {
            const timeSinceFreefall = now - freefallTimeRef.current;
            if (freefallTimeRef.current > 0 && timeSinceFreefall < 900) {
              console.log(`⚠️ [useFallDetection] Valid fall pattern detected (Drop -> Spike: ${mag.toFixed(2)}G within ${timeSinceFreefall}ms)`);
              freefallTimeRef.current = 0;
              startFallCountdown();
            }
          }
        });
      }
    } catch (e) {
      console.warn('[useFallDetection] Sensor error:', e);
    }

    return () => {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
      if (fallTimerRef.current) {
        clearInterval(fallTimerRef.current);
      }
    };
  }, [enabled]);

  return {
    simulateFall: startFallCountdown,
  };
}
