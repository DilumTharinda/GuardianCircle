import {
  doc,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import * as Location from 'expo-location';
import { db } from './firebase';
export { showToast } from '../components/common/Toast';

/**
 * CircleFind uses the shared 'reports' collection configured in Firestore Security Rules,
 * strictly filtered by type !== 'unsafe_location' so Map hazards never appear here.
 */
export const CIRCLE_FIND_COLLECTION = 'reports';

/**
 * In-memory cache for user account profile data (name and photoURL)
 */
const userProfileCache = new Map();

/**
 * Invalidate or update cached user profile
 */
export function invalidateUserAccountName(uid, newName = null, newPhotoURL = undefined) {
  if (!uid) return;
  if (newName !== null || newPhotoURL !== undefined) {
    const existing = userProfileCache.get(uid) || {};
    userProfileCache.set(uid, {
      name: newName !== null ? newName : existing.name,
      photoURL: newPhotoURL !== undefined ? newPhotoURL : existing.photoURL,
    });
  } else {
    userProfileCache.delete(uid);
  }
}

/**
 * Fetch original account details (displayName and photoURL) from users/{uid}
 * @param {string} uid
 * @param {boolean} forceFresh - bypass in-memory cache to get latest updated profile
 */
export async function fetchUserAccountProfile(uid, forceFresh = false) {
  if (!uid) return { name: null, photoURL: null };
  if (!forceFresh && userProfileCache.has(uid)) {
    return userProfileCache.get(uid);
  }

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      const name =
        data.displayName ||
        data.fullName ||
        data.name ||
        (data.email ? data.email.split('@')[0] : null);
      const photoURL = data.photoURL || null;

      const profile = { name, photoURL };
      userProfileCache.set(uid, profile);
      return profile;
    }
  } catch (_) {
    // If restricted by security rules or network
  }
  return { name: null, photoURL: null };
}

/**
 * Backward compatible fetchUserAccountName wrapper
 */
export async function fetchUserAccountName(uid, forceFresh = false) {
  const profile = await fetchUserAccountProfile(uid, forceFresh);
  return profile.name;
}

/**
 * Batch synchronize user's new display name and photoURL across all their published reports
 */
export async function syncUserReportsAuthorName(uid, newDisplayName, newPhotoURL = undefined) {
  if (!uid) return;
  invalidateUserAccountName(uid, newDisplayName, newPhotoURL);

  try {
    const reportsRef = collection(db, CIRCLE_FIND_COLLECTION);
    const q1 = query(reportsRef, where('reporterUid', '==', uid));
    const snap1 = await getDocs(q1);

    const q2 = query(reportsRef, where('reportedBy', '==', uid));
    const snap2 = await getDocs(q2);

    const docMap = new Map();
    snap1.forEach((d) => docMap.set(d.id, d.ref));
    snap2.forEach((d) => docMap.set(d.id, d.ref));

    if (docMap.size === 0) return;

    const batch = writeBatch(db);
    docMap.forEach((ref) => {
      const updateData = {};
      if (newDisplayName) {
        updateData.reportedByName = newDisplayName;
        updateData.reporterName = newDisplayName;
        updateData.authorName = newDisplayName;
      }
      if (newPhotoURL !== undefined) {
        updateData.reporterPhotoURL = newPhotoURL;
        updateData.authorPhotoURL = newPhotoURL;
      }
      batch.update(ref, updateData);
    });

    await batch.commit();
  } catch (err) {
    console.warn('[syncUserReportsAuthorName] batch update failed:', err?.message || err);
  }
}

/**
 * Reverse geocode coordinates to full detailed location address
 * (Includes building/place name, street, neighborhood, city/village, district, postal code)
 */
const detailedGeocodeCache = new Map();

export async function resolveFullDetailedAddress(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (detailedGeocodeCache.has(key)) return detailedGeocodeCache.get(key);

  try {
    const rev = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });
    if (rev && rev[0]) {
      const place = rev[0];
      const parts = [
        place.name,
        place.street,
        place.subregion || place.city,
        place.district,
        place.region,
        place.postalCode,
      ].filter(Boolean);

      const uniqueParts = [...new Set(parts)];
      const formatted = uniqueParts.join(', ');
      if (formatted) {
        detailedGeocodeCache.set(key, formatted);
        return formatted;
      }
    }
  } catch (err) {}
  return null;
}

/**
 * Reverse geocode coordinates to clean city/village and district
 * Omits street numbers and house addresses.
 */
const geocodeCache = new Map();

export async function resolveReadableAddress(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  try {
    const rev = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });
    if (rev && rev[0]) {
      const place = rev[0];
      // Prefer village, neighborhood, subregion, city, and district
      const locality = place.city || place.subregion || place.name || '';
      const district = place.district || place.region || '';

      const parts = [locality, district].filter(Boolean);
      const uniqueParts = [...new Set(parts)];
      const formatted = uniqueParts.join(', ');
      if (formatted) {
        geocodeCache.set(key, formatted);
        return formatted;
      }
    }
  } catch (err) {
    // Return null on failure/offline
  }
  return null;
}

/**
 * Haversine distance calculator in kilometers
 */
export function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' ||
    typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lon2 !== 'number'
  ) {
    return null;
  }
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format distance in a human-friendly label
 */
export function formatDistance(distKm) {
  if (distKm === null || isNaN(distKm)) return null;
  if (distKm < 0.1) return 'Near you (< 100m)';
  if (distKm < 1) return `${Math.round(distKm * 1000)}m away`;
  return `${distKm.toFixed(1)} km away`;
}

/**
 * Format relative time (e.g. 5m ago, 2h ago, 3d ago)
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/**
 * Calculates priority score for CircleFind feed ranking
 * P = M_status * (0.50 * S_distance + 0.30 * S_recency + 0.20 * S_boost)
 *
 * @param {Object} post - The report document
 * @param {Object|null} userLocation - { latitude, longitude }
 * @returns {number} Priority Score (higher = ranks higher)
 */
export function calculateCircleFindScore(post, userLocation) {
  // 1. Status Multiplier
  const normStatus = (post.status || post.type || 'missing').toLowerCase();
  const statusMultipliers = {
    missing: 1.0,
    lost: 1.0,
    spotted: 0.95,
    sighted: 0.95,
    found: 0.5,
    returned: 0.0,
    reunited: 0.0,
  };
  const multiplier = statusMultipliers[normStatus] ?? 1.0;
  if (multiplier === 0.0) return 0;

  // 2. Proximity Score (50% weight)
  let distanceScore = 50; // Neutral default if location not active
  const postLat = post.location?.latitude ?? post.latitude;
  const postLng = post.location?.longitude ?? post.longitude;
  if (
    userLocation &&
    typeof userLocation.latitude === 'number' &&
    typeof userLocation.longitude === 'number' &&
    typeof postLat === 'number' &&
    typeof postLng === 'number'
  ) {
    const dKm = getDistanceKm(
      userLocation.latitude,
      userLocation.longitude,
      postLat,
      postLng
    );
    if (dKm !== null) {
      distanceScore = 100 / (1 + dKm);
    }
  }

  // 3. Recency Score (30% weight)
  const nowMs = Date.now();
  let createdMs = nowMs;
  if (post.createdAt) {
    if (typeof post.createdAt.toMillis === 'function') {
      createdMs = post.createdAt.toMillis();
    } else if (typeof post.createdAt.toDate === 'function') {
      createdMs = post.createdAt.toDate().getTime();
    } else if (post.createdAt.seconds) {
      createdMs = post.createdAt.seconds * 1000;
    } else {
      createdMs = new Date(post.createdAt).getTime();
    }
  }
  const hoursAgo = Math.max(0, (nowMs - createdMs) / (1000 * 60 * 60));
  const recencyScore = 100 / (1 + 0.1 * hoursAgo);

  // 4. Boost Score (20% weight)
  const boostedList = Array.isArray(post.boostedBy) ? post.boostedBy : [];
  const boostCount = post.boostCount ?? post.upvotes ?? boostedList.length;
  const boostScore = Math.min(100, 20 * Math.sqrt(Math.max(0, boostCount)));

  // 5. Total Weighted Score
  const total = (0.50 * distanceScore) + (0.30 * recencyScore) + (0.20 * boostScore);
  return multiplier * total;
}

/**
 * Toggle Amplify/Boost for a CircleFind report
 * @param {string} reportId
 * @param {string} userId
 * @returns {Promise<{ isBoosted: boolean, boostCount: number }>}
 */
export async function toggleAmplifyPost(reportId, userId) {
  if (!reportId || !userId) {
    throw new Error('Report ID and User ID are required to amplify.');
  }

  const reportRef = doc(db, CIRCLE_FIND_COLLECTION, reportId);
  const snap = await getDoc(reportRef);
  if (!snap.exists()) {
    throw new Error('Post does not exist.');
  }

  const data = snap.data();
  const boostedBy = Array.isArray(data.boostedBy) ? data.boostedBy : [];
  const alreadyBoosted = boostedBy.includes(userId);

  if (alreadyBoosted) {
    // Remove boost
    try {
      await updateDoc(reportRef, {
        boostedBy: arrayRemove(userId),
        boostCount: increment(-1),
        upvotes: increment(-1),
      });
    } catch (_) {
      await updateDoc(reportRef, {
        upvotes: increment(-1),
      });
    }
    return {
      isBoosted: false,
      boostCount: Math.max(0, (data.boostCount || data.upvotes || boostedBy.length) - 1),
    };
  } else {
    // Add boost
    try {
      await updateDoc(reportRef, {
        boostedBy: arrayUnion(userId),
        boostCount: increment(1),
        upvotes: increment(1),
      });
    } catch (_) {
      await updateDoc(reportRef, {
        upvotes: increment(1),
      });
    }
    return {
      isBoosted: true,
      boostCount: (data.boostCount || data.upvotes || boostedBy.length) + 1,
    };
  }
}
