import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { startCancellableSOS } from '../services/countdownService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

/**
 * Hook to detect 3 rapid volume/action button presses within 1.5 seconds.
 * 
 * @param {Function} onCountdownStart - Callback receiving (cancelFn, triggerType, seconds)
 * @param {boolean} enabled - Whether listener is active
 */
export function useVolumeButtonTrigger(onCountdownStart, enabled = true) {
  const pressTimestamps = useRef([]);
  const activeCancelRef = useRef(null);

  const handlePressDetected = () => {
    const now = Date.now();
    // Keep presses within the last 1500ms
    pressTimestamps.current = pressTimestamps.current.filter((t) => now - t <= 1500);
    pressTimestamps.current.push(now);

    if (pressTimestamps.current.length >= 3) {
      console.log('🔘 [useVolumeButtonTrigger] Triple volume button press pattern detected!');
      pressTimestamps.current = []; // Reset

      const cancel = startCancellableSOS(
        TRIGGER_TYPES.VOLUME_BUTTON,
        5,
        null,
        (alertId) => {
          activeCancelRef.current = null;
        }
      );

      activeCancelRef.current = cancel;
      onCountdownStart?.(cancel, TRIGGER_TYPES.VOLUME_BUTTON, 5);
    }
  };

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    return () => {
      if (activeCancelRef.current) {
        activeCancelRef.current();
        activeCancelRef.current = null;
      }
    };
  }, [enabled]);

  return {
    simulateTriplePress: handlePressDetected,
  };
}
