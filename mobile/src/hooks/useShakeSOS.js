import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { startCancellableSOS } from '../services/countdownService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

const SHAKE_THRESHOLD = 2.5;

export function useShakeSOS(onCountdownStart) {
  const lastShake = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') return; // Accelerometer not supported on web desktop

    try {
      const { Accelerometer } = require('expo-sensors');
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
    } catch (e) {
      console.warn('[useShakeSOS] Sensor unavailable:', e);
    }
  }, []);
}