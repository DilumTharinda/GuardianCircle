import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { startCancellableSOS } from '../services/countdownService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

const DEFAULT_SHAKE_THRESHOLD = 2.6; // G-force threshold

/**
 * Hook to detect vigorous device shaking and initiate an emergency countdown.
 * 
 * @param {Function} onCountdownStart - Callback when countdown initiates, passes (cancelFn, triggerType, seconds)
 * @param {boolean} enabled - Whether shake detection is actively enabled
 * @param {number} sensitivity - Accelerometer threshold (lower = more sensitive, default 2.6)
 */
export function useShakeSOS(onCountdownStart, enabled = true, sensitivity = DEFAULT_SHAKE_THRESHOLD) {
  const lastShakeTime = useRef(0);
  const activeCancelRef = useRef(null);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    let subscription = null;
    try {
      const { Accelerometer } = require('expo-sensors');
      if (Accelerometer && typeof Accelerometer.addListener === 'function') {
        Accelerometer.setUpdateInterval(100);

        subscription = Accelerometer.addListener(({ x, y, z }) => {
          // Total acceleration magnitude
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          const now = Date.now();

          // Check if magnitude exceeds threshold and at least 3 seconds have passed since last trigger
          if (magnitude > sensitivity && now - lastShakeTime.current > 3500) {
            lastShakeTime.current = now;
            console.log(`📳 [useShakeSOS] Vigorous shake detected (mag: ${magnitude.toFixed(2)}G)`);

            // Start 5 second cancellable countdown
            const cancel = startCancellableSOS(
              TRIGGER_TYPES.SHAKE,
              5,
              (remaining) => {
                // tick callback
              },
              (alertId) => {
                activeCancelRef.current = null;
              }
            );

            activeCancelRef.current = cancel;
            onCountdownStart?.(cancel, TRIGGER_TYPES.SHAKE, 5);
          }
        });
      }
    } catch (err) {
      console.warn('[useShakeSOS] Accelerometer setup error:', err);
    }

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
      if (activeCancelRef.current) {
        activeCancelRef.current();
        activeCancelRef.current = null;
      }
    };
  }, [enabled, sensitivity]);
}