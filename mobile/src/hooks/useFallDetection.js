import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { TRIGGER_TYPES } from '../constants/alertTriggers';
import { triggerSOS } from '../services/sosService';

const FALL_SPIKE_THRESHOLD = 3.0; // High impact threshold (G)
const FALL_FREEFALL_THRESHOLD = 0.5; // Weightlessness/drop threshold (G)

/**
 * Hook to continuously monitor accelerometer for sudden fall or violent deceleration.
 * 
 * @param {Function} onFallDetected - Callback receiving ({ cancel, remainingSeconds, triggerEmergencyNow })
 * @param {boolean} enabled - Whether fall detection is active
 */
export function useFallDetection(onFallDetected, enabled = true) {
  const history = useRef([]);
  const hasTriggered = useRef(false);
  const fallTimerRef = useRef(null);

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
      console.log('🛡️ [useFallDetection] Fall alert dismissed by user');
    };

    const triggerEmergencyNow = async () => {
      cancel();
      try {
        await triggerSOS(TRIGGER_TYPES.FALL_DETECTION, { fallDetected: true, impactMagnitude: 3.2 });
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
          await triggerSOS(TRIGGER_TYPES.FALL_DETECTION, { autoDispatched: true, impactMagnitude: 3.2 });
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
        Accelerometer.setUpdateInterval(80);

        sub = Accelerometer.addListener(({ x, y, z }) => {
          const mag = Math.sqrt(x * x + y * y + z * z);
          history.current.push({ mag, time: Date.now() });

          // Keep recent 1 second window of readings
          const cutoff = Date.now() - 1000;
          history.current = history.current.filter((r) => r.time >= cutoff);

          if (history.current.length > 5 && !hasTriggered.current) {
            const hasSpike = history.current.some((r) => r.mag > FALL_SPIKE_THRESHOLD);
            const hasDrop = history.current.some((r) => r.mag < FALL_FREEFALL_THRESHOLD);

            // Fall signature: Freefall drop followed by sharp ground impact spike
            if (hasSpike && hasDrop) {
              console.log('⚠️ [useFallDetection] Fall pattern identified!');
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
