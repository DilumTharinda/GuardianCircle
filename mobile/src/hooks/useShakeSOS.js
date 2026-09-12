import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { startCancellableSOS } from '../services/countdownService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

const SHAKE_THRESHOLD = 2.5;

export function useShakeSOS(onCountdownStart) {
  const lastShake = useRef(0);

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (magnitude > SHAKE_THRESHOLD && now - lastShake.current > 3000) {
        lastShake.current = now;
        const cancel = startCancellableSOS(TRIGGER_TYPES.SHAKE, 5, (remaining) => {
          console.log('Shake countdown:', remaining);
        });
        onCountdownStart?.(cancel);
      }
    });
    return () => sub.remove();
  }, []);
}