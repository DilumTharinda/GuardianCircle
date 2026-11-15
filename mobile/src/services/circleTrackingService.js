import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  documentId,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Updates the user's online status and live location heartbeat in Firestore.
 *
 * @param {string} uid
 * @param {object} coords { latitude, longitude, speed, isMoving }
 */
export async function updateUserLocationHeartbeat(uid, coords = {}) {
  if (!uid || uid === 'parent_user_default') return;
  try {
    const payload = {
      isOnline: true,
      lastActiveAt: serverTimestamp(),
    };
    if (typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
      payload.lastLocation = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        speed: coords.speed ?? null,
        isMoving: coords.isMoving === true,
        updatedAt: serverTimestamp(),
      };
    }
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    // Non-blocking background heartbeat
  }
}

/**
 * Subscribes in real-time to the live locations and movement states
 * of all members belonging to a specific trusted circle.
 *
 * @param {Array<string>} memberUids - List of user UIDs in the circle
 * @param {Function} onUpdate - callback(membersLocationsArray)
 * @returns {Function} unsubscribe function
 */
export function subscribeCircleMembersLocations(memberUids, onUpdate) {
  if (!Array.isArray(memberUids) || memberUids.length === 0) {
    onUpdate([]);
    return () => {};
  }

  // Firestore where in filter supports up to 30 items
  const safeUids = memberUids.slice(0, 30);
  const q = query(
    collection(db, 'users'),
    where(documentId(), 'in', safeUids)
  );

  let cachedDocs = [];

  const evaluateAndEmit = () => {
    const locations = [];
    const now = Date.now();
    cachedDocs.forEach((docSnap) => {
      const data = docSnap.data();
      const lastLoc = data.lastLocation;
      if (
        lastLoc &&
        typeof lastLoc.latitude === 'number' &&
        typeof lastLoc.longitude === 'number'
      ) {
        // Online criteria:
        // 1. Explicit data.isOnline must NOT be false
        // 2. Must have a recent heartbeat within the last 45 seconds (45,000 ms)
        // If user logged out (isOnline: false), closed app, lost internet connection,
        // or stopped broadcasting heartbeat > 45s, user is automatically offline.
        const updatedDate =
          lastLoc.updatedAt?.toDate?.() ||
          (lastLoc.updatedAt ? new Date(lastLoc.updatedAt) : null) ||
          data.lastActiveAt?.toDate?.() ||
          (data.lastActiveAt ? new Date(data.lastActiveAt) : null);
        const timeSinceUpdate = updatedDate ? now - updatedDate.getTime() : Infinity;

        const isOnline = data.isOnline !== false && timeSinceUpdate < 45000;

        locations.push({
          uid: docSnap.id,
          displayName: data.displayName || 'Member',
          username: data.username || '',
          photoURL: data.photoURL || null,
          latitude: lastLoc.latitude,
          longitude: lastLoc.longitude,
          speed: lastLoc.speed ?? null,
          heading: lastLoc.heading ?? null,
          isMoving: lastLoc.isMoving === true,
          isOnline,
          updatedAt: updatedDate?.toISOString() || null,
        });
      }
    });
    onUpdate(locations);
  };

  const unsubSnapshot = onSnapshot(
    q,
    (snapshot) => {
      cachedDocs = [];
      snapshot.forEach((docSnap) => {
        cachedDocs.push(docSnap);
      });
      evaluateAndEmit();
    },
    (err) => {
      console.warn('[circleTrackingService] subscribeCircleMembersLocations error:', err?.message || err);
      onUpdate([]);
    }
  );

  // Periodic heartbeat freshness evaluator:
  // Runs every 5 seconds so when an online user loses internet or stops broadcasting,
  // they transition from online to offline automatically WITHOUT needing a page refresh.
  const intervalId = setInterval(() => {
    if (cachedDocs.length > 0) {
      evaluateAndEmit();
    }
  }, 5000);

  return () => {
    clearInterval(intervalId);
    unsubSnapshot();
  };
}

