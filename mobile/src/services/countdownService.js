import { triggerSOS } from './sosService';

export function startCancellableSOS(triggerType, seconds = 5, onTick) {
  let remaining = seconds;
  onTick?.(remaining);

  const timer = setInterval(async () => {
    remaining -= 1;
    onTick?.(remaining);
    if (remaining <= 0) {
      clearInterval(timer);
      try {
        const alertId = await triggerSOS(triggerType);
        console.log('SOS document created with ID:', alertId);
      } catch (e) {
        console.log('SOS trigger failed:', e.message);
      }
    }
  }, 1000);

  return function cancel() {
    clearInterval(timer);
    console.log('SOS countdown cancelled');
  };
}