import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { startCancellableSOS } from '../services/countdownService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

const DEFAULT_SHAKE_DELTA_THRESHOLD = 1.35; // Sensitive acceleration delta between cycles
const REQUIRED_SHAKE_EVENTS = 3; // Number of alternating shakes required within time window
const SHAKE_WINDOW_MS = 1200; // Time window to register alternating shakes

/**
 * Hook to detect vigorous device shaking and initiate an emergency countdown.
 * Uses high-pass acceleration delta (removes steady 1G gravity bias) and multiple
 * reversals to prevent false positives from walking while ensuring genuine shakes trigger reliably.
 * 
 * @param {Function} onCountdownStart - Callback when countdown initiates, passes (cancelFn, triggerType, seconds)
 * @param {boolean} enabled - Whether shake detection is actively enabled
 */
export function useShakeSOS(onCountdownStart, enabled = true) {
  const lastShakeTime = useRef(0);
  const activeCancelRef = useRef(null);
  const prevAccel = useRef({ x: 0, y: 0, z: 0 });
  const shakeTimestamps = useRef([]);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    let subscription = null;
    try {
      const { Accelerometer } = require('expo-sensors');
      if (Accelerometer && typeof Accelerometer.addListener === 'function') {
        Accelerometer.setUpdateInterval(50); // 20Hz sampling for accurate peak capture

        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const now = Date.now();

          // Calculate acceleration change relative to previous sample (gravity-invariant)
          const deltaX = Math.abs(x - prevAccel.current.x);
          const deltaY = Math.abs(y - prevAccel.current.y);
          const deltaZ = Math.abs(z - prevAccel.current.z);
          const totalDelta = Math.max(deltaX, deltaY, deltaZ);

          prevAccel.current = { x, y, z };

          // Also check overall magnitude
          const magnitude = Math.sqrt(x * x + y * y + z * z);

          // If a sharp reversal/acceleration spike occurred
          if (totalDelta > DEFAULT_SHAKE_DELTA_THRESHOLD || magnitude > 2.5) {
            // Keep spikes within SHAKE_WINDOW_MS
            shakeTimestamps.current = shakeTimestamps.current.filter((t) => now - t < SHAKE_WINDOW_MS);
            shakeTimestamps.current.push(now);

            // Trigger when multiple shake peaks occur in rapid succession and cooldown has passed
            if (
              shakeTimestamps.current.length >= REQUIRED_SHAKE_EVENTS &&
              now - lastShakeTime.current > 4000
            ) {
              lastShakeTime.current = now;
              shakeTimestamps.current = [];
              console.log(`📳 [useShakeSOS] Multi-peak shake detected (delta: ${totalDelta.toFixed(2)}, mag: ${magnitude.toFixed(2)}G)`);

              // Start 5 second cancellable countdown
              const cancel = startCancellableSOS(
                TRIGGER_TYPES.SHAKE,
                5,
                null,
                () => {
                  activeCancelRef.current = null;
                }
              );

              activeCancelRef.current = cancel;
              onCountdownStart?.(cancel, TRIGGER_TYPES.SHAKE, 5);
            }
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
  }, [enabled]);
}