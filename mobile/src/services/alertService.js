import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  limit,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';

const LOCAL_ALERTS_KEY = '@guardiancircle_local_alerts';

/**
 * Fetch all alerts for a specific user (or triggered by / sent to them)
 */
export async function getAlertHistory(userId) {
  const localList = await getLocalAlerts();

  try {
    // Query by userId without requiring a composite index in Firestore
    // Client-side sorting avoids FirebaseError: The query requires an index
    const q = query(
      collection(db, 'Alerts'),
      where('userId', '==', userId),
      limit(50)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const serverAlerts = snap.docs.map((d) => {
        const data = d.data();
        let timestampIso = data.timestamp;
        let timeMillis = 0;

        if (data.timestamp?.toDate) {
          const date = data.timestamp.toDate();
          timestampIso = date.toISOString();
          timeMillis = date.getTime();
        } else if (data.timestamp) {
          const date = new Date(data.timestamp);
          timestampIso = isNaN(date.getTime()) ? data.timestamp : date.toISOString();
          timeMillis = isNaN(date.getTime()) ? 0 : date.getTime();
        }

        return {
          id: d.id,
          ...data,
          timestamp: timestampIso,
          _sortTime: timeMillis,
        };
      });

      // Sort client-side descending (newest alerts first)
      serverAlerts.sort((a, b) => b._sortTime - a._sortTime);

      return serverAlerts.slice(0, 20).map(({ _sortTime, ...alert }) => alert);
    }
  } catch (err) {
    console.warn('[alertService] getAlertHistory Firestore query error, returning local cache:', err);
  }

  return localList
    .filter((a) => a.userId === userId)
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
}

/**
 * Real-time subscription to any active SOS alert for a user
 */
export function subscribeToUserActiveAlert(userId, onUpdate) {
  try {
    const q = query(
      collection(db, 'Alerts'),
      where('userId', '==', userId),
      where('status', '==', 'active'),
      limit(1)
    );

    return onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          onUpdate({
            id: snap.docs[0].id,
            ...docData,
            timestamp: docData.timestamp?.toDate?.()?.toISOString() || docData.timestamp,
          });
        } else {
          onUpdate(null);
        }
      },
      async (_error) => {
        // Fallback gracefully to local storage if Firestore permissions restrict unauthenticated live snapshot
        try {
          const localAlerts = await getLocalAlerts();
          const activeLocal = localAlerts.find((a) => a.userId === userId && a.status === 'active');
          onUpdate(activeLocal || null);
        } catch (e) {}
      }
    );
  } catch (e) {
    return () => {};
  }
}

/**
 * Resolve an active SOS alert
 */
export async function resolveAlert(alertId, resolutionNote = 'User confirmed safe') {
  try {
    const alertRef = doc(db, 'Alerts', alertId);
    await updateDoc(alertRef, {
      status: 'resolved',
      resolvedAt: serverTimestamp(),
      resolutionNote,
    });
  } catch (err) {
    console.warn('[alertService] Firestore updateDoc failed, updating local state:', err);
  }

  // Update in local AsyncStorage cache
  try {
    const localAlerts = await getLocalAlerts();
    const updated = localAlerts.map((a) =>
      a.id === alertId
        ? {
            ...a,
            status: 'resolved',
            resolvedAt: new Date().toISOString(),
            resolutionNote,
          }
        : a
    );
    await AsyncStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[alertService] Local alert resolve save error:', e);
  }

  return true;
}

/**
 * Cancel an active SOS alert (e.g. false alarm)
 */
export async function cancelAlert(alertId, cancelReason = 'False trigger cancelled by user') {
  try {
    const alertRef = doc(db, 'Alerts', alertId);
    await updateDoc(alertRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelReason,
    });
  } catch (err) {
    console.warn('[alertService] Firestore cancel failed, updating local state:', err);
  }

  try {
    const localAlerts = await getLocalAlerts();
    const updated = localAlerts.map((a) =>
      a.id === alertId
        ? {
            ...a,
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelReason,
          }
        : a
    );
    await AsyncStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[alertService] Local alert cancel save error:', e);
  }

  return true;
}

export async function getLocalAlerts() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_ALERTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
