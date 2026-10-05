import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, GeoPoint, limit, onSnapshot, query, Timestamp, where,
} from 'firebase/firestore';
import ngeohash from 'ngeohash';
import { auth, db } from './firebase';
import {
  UNSAFE_REPORT_CATEGORIES,
  UNSAFE_REPORT_GEOHASH_PRECISION,
  UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH,
  UNSAFE_REPORT_OPEN_STATUS,
  UNSAFE_REPORT_TYPE,
  UNSAFE_REPORTS_COLLECTION,
} from './unsafeLocationReportService';

export const MAX_UNSAFE_ZONE_REPORTS = 1000;
export const MAX_UNSAFE_ZONE_POINTS = 500;
export const UNSAFE_ZONE_CELL_PRECISION = 7;
const MAX_HEATMAP_WEIGHT = 100;
const QUERY_LIMIT = MAX_UNSAFE_ZONE_REPORTS + 1;
const MAX_TIMESTAMP_MS = 253402300799999;

function zoneError(code, message) {
  const error = new Error(message);
  error.code = `unsafe-zone/${code}`;
  return error;
}

function assertCurrentUser(uid) {
  if (typeof uid !== 'string' || !uid.trim() || !auth.currentUser) {
    throw zoneError('auth-required', 'Sign in to view user-submitted safety reports.');
  }
  if (auth.currentUser.uid !== uid) {
    throw zoneError('session-changed', 'Your session changed. Sign in again to continue.');
  }
}

function validTimestamp(value) {
  if (!(value instanceof Timestamp)) return false;
  const milliseconds = value.toMillis();
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= MAX_TIMESTAMP_MS;
}

function reportCell(document) {
  if (document?.metadata?.hasPendingWrites === true) return null;
  const data = document?.data?.();
  if (!data || data.type !== UNSAFE_REPORT_TYPE || data.status !== UNSAFE_REPORT_OPEN_STATUS
    || typeof data.reporterUid !== 'string' || !data.reporterUid.trim()
    || !UNSAFE_REPORT_CATEGORIES.includes(data.category)
    || typeof data.description !== 'string'
    || data.description.length > UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH
    || data.photoURL !== null
    || !(data.location instanceof GeoPoint)
    || typeof data.geohash !== 'string'
    || data.geohash.length !== UNSAFE_REPORT_GEOHASH_PRECISION
    || !validTimestamp(data.createdAt) || !validTimestamp(data.updatedAt)) {
    return null;
  }

  const { latitude, longitude } = data.location;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    return null;
  }

  try {
    const expected = ngeohash.encode(latitude, longitude, UNSAFE_REPORT_GEOHASH_PRECISION);
    if (data.geohash !== expected) return null;
    return data.geohash.slice(0, UNSAFE_ZONE_CELL_PRECISION);
  } catch (_) {
    return null;
  }
}

/**
 * Convert canonical reports into coarse density cells. Exact report locations,
 * identities, descriptions, and document ids never leave this mapper.
 */
export function buildUnsafeZoneSummary(snapshot) {
  const documents = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
  const groups = new Map();
  let reportCount = 0;
  let ignoredCount = 0;

  for (const document of documents.slice(0, MAX_UNSAFE_ZONE_REPORTS)) {
    let cell;
    try {
      cell = reportCell(document);
    } catch (_) {
      cell = null;
    }
    if (!cell) {
      ignoredCount += 1;
      continue;
    }
    reportCount += 1;
    groups.set(cell, (groups.get(cell) || 0) + 1);
  }

  const ranked = [...groups.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const points = [];
  for (const [cell, count] of ranked.slice(0, MAX_UNSAFE_ZONE_POINTS)) {
    try {
      const center = ngeohash.decode(cell);
      if (!Number.isFinite(center?.latitude) || Math.abs(center.latitude) > 90
        || !Number.isFinite(center?.longitude) || Math.abs(center.longitude) > 180) continue;
      points.push({
        latitude: center.latitude,
        longitude: center.longitude,
        weight: Math.max(1, Math.min(count, MAX_HEATMAP_WEIGHT)),
      });
    } catch (_) {
      ignoredCount += count;
      reportCount -= count;
    }
  }

  return {
    points,
    reportCount,
    ignoredCount,
    truncated: documents.length > MAX_UNSAFE_ZONE_REPORTS
      || groups.size > MAX_UNSAFE_ZONE_POINTS,
    fromCache: snapshot?.metadata?.fromCache === true,
    updatedAtMs: Date.now(),
  };
}

function unsafeReportsQuery() {
  return query(
    collection(db, UNSAFE_REPORTS_COLLECTION),
    where('type', '==', UNSAFE_REPORT_TYPE),
    where('status', '==', UNSAFE_REPORT_OPEN_STATUS),
    limit(QUERY_LIMIT),
  );
}

/** Bounded realtime community report source; caller must unsubscribe on blur. */
export function subscribeUnsafeZones(uid, onZones, onError) {
  let stopped = false;
  let stopSnapshot = () => {};
  let stopAuth = () => {};

  const unsubscribe = () => {
    if (stopped) return;
    stopped = true;
    stopSnapshot();
    stopAuth();
  };

  const fail = (error) => {
    if (stopped) return;
    unsubscribe();
    onError(error);
  };

  try {
    assertCurrentUser(uid);
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== uid || auth.currentUser?.uid !== uid) {
        fail(zoneError('session-changed', 'Your session changed. Sign in again to continue.'));
      }
    }, fail);
    if (stopped) {
      authUnsubscribe();
      return unsubscribe;
    }
    stopAuth = authUnsubscribe;

    const snapshotUnsubscribe = onSnapshot(unsafeReportsQuery(), { includeMetadataChanges: true }, (snapshot) => {
      if (stopped) return;
      try {
        assertCurrentUser(uid);
        onZones(buildUnsafeZoneSummary(snapshot));
      } catch (error) {
        fail(error);
      }
    }, fail);
    if (stopped) snapshotUnsubscribe();
    else stopSnapshot = snapshotUnsubscribe;
  } catch (error) {
    fail(error);
  }

  return unsubscribe;
}

export function getUnsafeZoneErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
  switch (code) {
    case 'auth-required':
    case 'unauthenticated':
      return 'Sign in to view user-submitted safety reports.';
    case 'session-changed':
      return 'Your session changed. Sign in again to reload the report layer.';
    case 'permission-denied':
      return 'Your account cannot access the report layer. Check your sign-in or contact support.';
    case 'failed-precondition':
      return 'The report layer is temporarily unavailable. Please try again later.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Could not update the report layer. Check your connection and retry.';
    default:
      return 'Could not load user-submitted safety reports. Please try again.';
  }
}
