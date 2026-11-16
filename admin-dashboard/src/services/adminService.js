import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  deleteDoc,
  addDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

/**
 * Normalize a Firestore Timestamp, Date, or epoch number into a JS Date.
 */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

/**
 * Extract latitude/longitude from Firestore GeoPoint or plain object.
 */
export function extractCoords(loc) {
  if (!loc) return null;
  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return { lat: loc.latitude, lng: loc.longitude };
  }
  if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    return { lat: loc.lat, lng: loc.lng };
  }
  if (typeof loc._lat === 'number' && typeof loc._long === 'number') {
    return { lat: loc._lat, lng: loc._long };
  }
  return null;
}

/**
 * Subscribe to active SOS / emergency alerts across both `Alerts` and `alerts` collections.
 */
export function subscribeToActiveAlerts(onData, onError) {
  const alertsMap = new Map();
  const lowerMap = new Map();

  const emit = () => {
    const merged = new Map([...lowerMap, ...alertsMap]);
    const list = Array.from(merged.values()).sort((a, b) => {
      const da = toDate(a.timestamp || a.createdAt)?.getTime() || 0;
      const dbTime = toDate(b.timestamp || b.createdAt)?.getTime() || 0;
      return dbTime - da;
    });
    onData(list);
  };

  const qPrimary = query(collection(db, 'Alerts'), where('status', '==', 'active'));
  const unsubPrimary = onSnapshot(
    qPrimary,
    (snapshot) => {
      alertsMap.clear();
      snapshot.forEach((docSnap) => {
        alertsMap.set(docSnap.id, {
          id: docSnap.id,
          _collection: 'Alerts',
          ...docSnap.data(),
        });
      });
      emit();
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  const qCompat = query(collection(db, 'alerts'), where('status', '==', 'active'));
  const unsubCompat = onSnapshot(
    qCompat,
    (snapshot) => {
      lowerMap.clear();
      snapshot.forEach((docSnap) => {
        lowerMap.set(docSnap.id, {
          id: docSnap.id,
          _collection: 'alerts',
          ...docSnap.data(),
        });
      });
      emit();
    },
    () => {
      // Ignore compatibility collection errors if rules/indexes differ
    }
  );

  return () => {
    unsubPrimary();
    unsubCompat();
  };
}

/**
 * Fetch all alerts (for analytics summary).
 */
export function subscribeToAllAlerts(onData, onError) {
  const q = query(collection(db, 'Alerts'), limit(500));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to all community reports (lost, found, sighting, unsafe_location).
 */
export function subscribeToReports(onData, onError) {
  const q = query(collection(db, 'reports'), limit(500));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const score =
            typeof data.confidenceScore === 'number' ? data.confidenceScore : 100;
          const isLowConfidence = score < 50;
          return {
            id: docSnap.id,
            ...data,
            confidenceScore: score,
            isFlagged: Boolean(data.flagged) || isLowConfidence,
          };
        })
        .sort((a, b) => {
          const da = toDate(a.createdAt)?.getTime() || 0;
          const dbTime = toDate(b.createdAt)?.getTime() || 0;
          return dbTime - da;
        });
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * Approve a flagged or pending report.
 */
export async function approveReport(reportId, adminUser) {
  const reportRef = doc(db, 'reports', reportId);
  await updateDoc(reportRef, {
    status: 'open',
    flagged: false,
    moderationStatus: 'approved',
    moderatedBy: adminUser.uid,
    moderatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'auditLog'), {
    action: 'REPORT_APPROVED',
    targetUid: reportId,
    targetEmail: '',
    performedBy: adminUser.uid,
    performedByEmail: adminUser.email || '',
    timestamp: serverTimestamp(),
    note: `Approved report ${reportId}`,
  });
}

/**
 * Remove / hide a report from public view (soft-remove via status).
 */
export async function removeReport(reportId, adminUser, reason = 'Removed by moderator') {
  const reportRef = doc(db, 'reports', reportId);
  await updateDoc(reportRef, {
    status: 'removed',
    flagged: false,
    moderationStatus: 'removed',
    moderationReason: reason,
    moderatedBy: adminUser.uid,
    moderatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'auditLog'), {
    action: 'REPORT_REMOVED',
    targetUid: reportId,
    targetEmail: '',
    performedBy: adminUser.uid,
    performedByEmail: adminUser.email || '',
    timestamp: serverTimestamp(),
    note: `Removed report ${reportId}: ${reason}`,
  });
}

/**
 * Permanently delete a report document (Admin only per Firestore rules).
 */
export async function permanentlyDeleteReport(reportId, adminUser) {
  await deleteDoc(doc(db, 'reports', reportId));

  await addDoc(collection(db, 'auditLog'), {
    action: 'REPORT_DELETED',
    targetUid: reportId,
    targetEmail: '',
    performedBy: adminUser.uid,
    performedByEmail: adminUser.email || '',
    timestamp: serverTimestamp(),
    note: `Permanently deleted report ${reportId}`,
  });
}

/**
 * Fetch a user profile by UID.
 */
export async function fetchUserProfile(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() };
}

/**
 * Search registered users for Admin promotion (FR-6.5).
 */
export async function fetchAllUsers(maxResults = 200) {
  const q = query(collection(db, 'users'), limit(maxResults));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/**
 * Promote a registered user to Admin/Moderator via protected server-side Cloud Function (FR-6.5).
 * Client-side role escalation is intentionally blocked by Firestore security rules.
 */
export async function promoteUserToAdmin(targetUser, adminUser) {
  const promoteFn = httpsCallable(functions, 'promoteToAdmin');
  const result = await promoteFn({
    targetUid: targetUser.uid,
    targetEmail: targetUser.email,
    requestedBy: adminUser.uid,
  });
  return result.data;
}

/**
 * Subscribe to the Admin audit log.
 */
export function subscribeToAuditLog(onData, onError) {
  const q = query(collection(db, 'auditLog'), orderBy('timestamp', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}
