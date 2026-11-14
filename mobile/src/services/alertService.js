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
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import { logActivity, AUDIT_ACTIONS } from './auditLogService';

const LOCAL_ALERTS_KEY = '@guardiancircle_local_alerts';
const MAX_EMERGENCY_ALERT_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Checks whether an alert is within the 2-hour active TTL window.
 */
function isAlertWithinTwoHours(alert) {
  if (!alert) return false;
  let timeMillis = 0;
  if (alert.timestamp?.toDate) {
    timeMillis = alert.timestamp.toDate().getTime();
  } else if (alert.timestamp?.toMillis) {
    timeMillis = alert.timestamp.toMillis();
  } else if (typeof alert.timestamp === 'number') {
    timeMillis = alert.timestamp;
  } else if (typeof alert.createdAt === 'number') {
    timeMillis = alert.createdAt;
  } else if (typeof alert.timestamp === 'string') {
    const parsed = new Date(alert.timestamp).getTime();
    if (!isNaN(parsed)) timeMillis = parsed;
  }
  if (!timeMillis) return true; // If timestamp not yet populated, keep until server stamp resolves
  return (Date.now() - timeMillis) <= MAX_EMERGENCY_ALERT_AGE_MS;
}

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
    DeviceEventEmitter.emit('EMERGENCY_ALERT_UPDATED', { alertId, status: 'resolved' });
  } catch (e) {
    console.warn('[alertService] Local alert resolve save error:', e);
  }

  // Record in Audit Log
  logActivity({
    action: AUDIT_ACTIONS.SOS_RESOLVE,
    targetUid: alertId,
    note: resolutionNote,
    metadata: { alertId, resolutionNote },
  }).catch(() => {});

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
    DeviceEventEmitter.emit('EMERGENCY_ALERT_UPDATED', { alertId, status: 'resolved' });
  } catch (e) {
    console.warn('[alertService] Local alert cancel save error:', e);
  }

  // Record in Audit Log
  logActivity({
    action: AUDIT_ACTIONS.SOS_CANCEL,
    targetUid: alertId,
    note: cancelReason,
    metadata: { alertId, cancelReason },
  }).catch(() => {});

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

/**
 * Real-time subscription to all active emergency SOS alerts across the community.
 * Also merges active local alerts and listens for local dispatch events.
 *
 * @param {Function} onUpdate - callback(activeAlertsArray)
 * @returns {Function} unsubscribe function
 */
export function subscribeToActiveEmergencyAlerts(onUpdate) {
  let firestoreAlerts = [];

  const broadcastCombined = async () => {
    let localActive = [];
    try {
      const localList = await getLocalAlerts();
      localActive = (Array.isArray(localList) ? localList : []).filter(
        (a) => a && a.status === 'active'
      );
    } catch (_) {}

    const map = new Map();
    // 1. Add Firestore alerts (must be active and within 2 hours)
    firestoreAlerts.forEach((a) => {
      if (a && a.id && a.status === 'active' && isAlertWithinTwoHours(a)) {
        map.set(a.id, a);
      }
    });
    // 2. Add local alerts (must be active and within 2 hours)
    localActive.forEach((a) => {
      const id = a.id || 'local_active_sos';
      if (!map.has(id) && a.status === 'active' && isAlertWithinTwoHours(a)) {
        map.set(id, { ...a, id });
      }
    });

    onUpdate(Array.from(map.values()));
  };

  // Listen to Firestore active alerts
  let unsubFirestore = () => {};
  try {
    const q = query(
      collection(db, 'Alerts'),
      where('status', '==', 'active'),
      limit(20)
    );
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        firestoreAlerts = [];
        snap.forEach((d) => {
          const data = d.data();
          firestoreAlerts.push({
            id: d.id,
            ...data,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
          });
        });
        broadcastCombined();
      },
      (err) => {
        console.warn('[alertService] subscribeToActiveEmergencyAlerts firestore error:', err?.message || err);
        broadcastCombined();
      }
    );
  } catch (e) {
    broadcastCombined();
  }

  // Initial emit
  broadcastCombined();

  // Also listen for local dispatch and cancellation events
  const sub = DeviceEventEmitter.addListener('EMERGENCY_ALERT_UPDATED', () => {
    broadcastCombined();
  });

  // Periodic pruning ticker every 60 seconds to auto-remove alerts passing the 2-hour threshold
  const pruneInterval = setInterval(() => {
    broadcastCombined();
  }, 60000);

  return () => {
    unsubFirestore();
    sub?.remove?.();
    clearInterval(pruneInterval);
  };
}
