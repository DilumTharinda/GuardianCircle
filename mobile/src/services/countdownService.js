import * as Haptics from 'expo-haptics';
import { triggerSOS } from './sosService';

/**
 * Starts a cancellable countdown before dispatching an SOS.
 * 
 * @param {string} triggerType - Trigger identifier
 * @param {number} seconds - Number of seconds to count down (default 5)
 * @param {Function} onTick - Callback receiving remaining seconds (e.g. 5, 4, 3...)
 * @param {Function} onComplete - Callback receiving alertId once dispatched
 * @returns {Function} cancel function
 */
export function startCancellableSOS(triggerType, seconds = 5, onTick = null, onComplete = null) {
  let remaining = seconds;
  let isCancelled = false;

  // Initial tick
  onTick?.(remaining);
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch (e) {}

  const intervalId = setInterval(async () => {
    if (isCancelled) {
      clearInterval(intervalId);
      return;
    }

    remaining -= 1;
    onTick?.(remaining);

    if (remaining > 0) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (e) {}
    } else {
      clearInterval(intervalId);
      try {
        const alertId = await triggerSOS(triggerType);
        onComplete?.(alertId);
      } catch (e) {
        console.warn('[countdownService] SOS trigger error:', e.message);
      }
    }
  }, 1000);

  return function cancel() {
    isCancelled = true;
    clearInterval(intervalId);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
    console.log(`[countdownService] SOS Countdown cancelled for ${triggerType}`);
  };
}