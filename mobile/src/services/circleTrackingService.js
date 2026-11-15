import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  documentId,
} from 'firebase/firestore';
import { db } from './firebase';

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

  return onSnapshot(
    q,
    (snapshot) => {
      const locations = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const lastLoc = data.lastLocation;
        if (
          lastLoc &&
          typeof lastLoc.latitude === 'number' &&
          typeof lastLoc.longitude === 'number'
        ) {
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
            updatedAt: lastLoc.updatedAt?.toDate?.()?.toISOString() || lastLoc.updatedAt || null,
          });
        }
      });
      onUpdate(locations);
    },
    (err) => {
      console.warn('[circleTrackingService] subscribeCircleMembersLocations error:', err?.message || err);
      onUpdate([]);
    }
  );
}

