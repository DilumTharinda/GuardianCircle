import { useCallback, useEffect, useState } from 'react';
import { getUnsafeZoneErrorMessage, subscribeUnsafeZones } from '../services/unsafeZoneService';

const emptyState = (uid, status) => ({
  uid,
  status,
  points: [],
  reportCount: 0,
  ignoredCount: 0,
  truncated: false,
  fromCache: false,
  updatedAtMs: null,
  error: null,
});

export function useUnsafeZones(uid, enabled) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(() => emptyState(uid, enabled ? 'loading' : 'idle'));
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState(emptyState(uid, 'idle'));
      return undefined;
    }

    let active = true;
    setState(emptyState(uid, 'loading'));
    const unsubscribe = subscribeUnsafeZones(
      uid,
      (summary) => {
        if (!active) return;
        setState({
          uid,
          status: summary.reportCount > 0 ? 'ready' : 'empty',
          ...summary,
          error: null,
        });
      },
      (error) => {
        if (!active) return;
        setState({
          ...emptyState(uid, 'error'),
          error: getUnsafeZoneErrorMessage(error),
        });
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, enabled, attempt]);

  if (!enabled) return { ...emptyState(uid, 'idle'), retry };
  let current = state.uid === uid ? state : emptyState(uid, 'loading');
  if (enabled && current.status === 'idle') current = emptyState(uid, 'loading');
  return { ...current, retry };
}
