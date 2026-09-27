// src/hooks/useOfflineSync.js
//
// FR-3.4 — Offline-First Data Access (auto-sync trigger)
//
// The project doesn't currently have a network-status library installed
// (e.g. @react-native-community/netinfo or expo-network) — check with
// Member 1 before adding one, per the team's dependency rule. Until then,
// this hook uses a simple, dependency-free approach: it retries the queue
// whenever the app comes back to the foreground, plus on a periodic
// timer. A real "came back online" event would be more precise, but this
// covers the common case (user was offline, reopens/returns to the app)
// without adding a new package.
//
// Usage in a screen or root component:
//
//   const { pendingCount, syncNow } = useOfflineSync({
//     lost_found_report: (payload) => lostFoundService.submitReport(payload),
//   });
 
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { syncPendingReports, getPendingReports } from '../services/offlineStorageService';
 
const RETRY_INTERVAL_MS = 60 * 1000; // retry once a minute while app is open
 
export function useOfflineSync(uploadHandlers) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const handlersRef = useRef(uploadHandlers);
  handlersRef.current = uploadHandlers;
 
  const refreshPendingCount = useCallback(async () => {
    const items = await getPendingReports();
    setPendingCount(items.length);
  }, []);
 
  const syncNow = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncPendingReports(handlersRef.current);
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [isSyncing, refreshPendingCount]);
 
  useEffect(() => {
    refreshPendingCount();
    syncNow();
 
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncNow();
      }
    });
 
    const interval = setInterval(syncNow, RETRY_INTERVAL_MS);
 
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
 
  return { pendingCount, isSyncing, syncNow };
}
 