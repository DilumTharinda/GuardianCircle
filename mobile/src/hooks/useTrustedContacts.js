import { useCallback, useEffect, useState } from 'react';
import {
  getTrustedCircleErrorMessage,
  subscribeTrustedContacts,
} from '../services/trustedCircleService';

export function useTrustedContacts(uid) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ uid, contacts: [], loading: true, error: null });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setState({ uid, contacts: [], loading: true, error: null });
    const unsubscribe = subscribeTrustedContacts(
      uid,
      (contacts) => {
        if (active) setState({ uid, contacts, loading: false, error: null });
      },
      (error) => {
        if (active) {
          setState({ uid, contacts: [], loading: false, error: getTrustedCircleErrorMessage(error) });
        }
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, attempt]);

  // Never render the previous account's contacts while the effect catches up.
  const current = state.uid === uid ? state : { contacts: [], loading: true, error: null };
  return { ...current, retry };
}
