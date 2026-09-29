import { collection, doc, GeoPoint, runTransaction, serverTimestamp } from 'firebase/firestore';
import ngeohash from 'ngeohash';
import { auth, db } from './firebase';

export const UNSAFE_REPORTS_COLLECTION = 'reports';
export const UNSAFE_REPORT_TYPE = 'unsafe_location';
export const UNSAFE_REPORT_GEOHASH_PRECISION = 9;
const MAX_LOCATION_AGE_MS = 30 * 1000;
const MAX_FUTURE_SKEW_MS = 5000;

export const UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH = 500;
export const UNSAFE_REPORT_CATEGORIES = Object.freeze([
  'Poor lighting',
  'Harassment or threat',
  'Suspicious activity',
  'Road hazard',
  'Isolated area',
  'Other',
]);

function reportError(code, message) {
  const error = new Error(message);
  error.code = `unsafe-report/${code}`;
  return error;
}

function assertCurrentUser(uid) {
  if (typeof uid !== 'string' || !uid.trim() || !auth.currentUser) {
    throw reportError('auth-required', 'Sign in to report an unsafe location.');
  }
  if (auth.currentUser.uid !== uid) {
    throw reportError('session-changed', 'Your session changed. Sign in again to continue.');
  }
}

function normalizeCategory(value) {
  if (typeof value !== 'string' || !UNSAFE_REPORT_CATEGORIES.includes(value)) {
    throw reportError('invalid-category', 'Choose an unsafe incident category.');
  }
  return value;
}

function normalizeDescription(value) {
  if (value == null) return '';
  if (typeof value !== 'string') {
    throw reportError('invalid-description', 'Enter valid optional details.');
  }
  const description = value.trim();
  if (description.length > UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH) {
    throw reportError(
      'invalid-description',
      `Keep optional details under ${UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH} characters.`,
    );
  }
  return description;
}

function normalizeCurrentLocation(value, now) {
  const latitude = value?.latitude;
  const longitude = value?.longitude;
  const timestamp = value?.timestamp;
  const age = now - timestamp;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isFinite(timestamp) || timestamp < 0
    || age > MAX_LOCATION_AGE_MS || age < -MAX_FUTURE_SKEW_MS
    || value?.mocked !== false) {
    throw reportError(
      'invalid-location',
      'Get a fresh device GPS location before submitting this report.',
    );
  }
  return { latitude, longitude };
}

/**
 * Writes the shared reports schema with a dedicated unsafe_location type.
 * Only a current, real GPS point is accepted; profile, journey, contact, and
 * device metadata are deliberately excluded. The geohash supports Phase 6
 * bounded spatial queries without scanning every report.
 */
export async function createUnsafeLocationReport(uid, input = {}) {
  assertCurrentUser(uid);
  const category = normalizeCategory(input?.category);
  const description = normalizeDescription(input?.description);
  const location = normalizeCurrentLocation(input?.location, Date.now());
  const geohash = ngeohash.encode(
    location.latitude,
    location.longitude,
    UNSAFE_REPORT_GEOHASH_PRECISION,
  );
  if (typeof geohash !== 'string' || !geohash) {
    throw reportError('invalid-location', 'Get a valid device GPS location before submitting.');
  }

  const ref = doc(collection(db, UNSAFE_REPORTS_COLLECTION));
  await runTransaction(db, async (transaction) => {
    assertCurrentUser(uid);
    transaction.set(ref, {
      type: UNSAFE_REPORT_TYPE,
      reporterUid: uid,
      category,
      description,
      photoURL: null,
      location: new GeoPoint(location.latitude, location.longitude),
      geohash,
      status: 'open',
      confidenceScore: 0,
      upvotes: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  assertCurrentUser(uid);
  return { id: ref.id, category, description, location };
}

/** Never expose Firebase messages, paths, or configuration in the UI. */
export function getUnsafeReportErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
  switch (code) {
    case 'auth-required':
    case 'unauthenticated':
      return 'Sign in to report an unsafe location.';
    case 'session-changed':
      return 'Your session changed. Sign in again before submitting.';
    case 'invalid-category':
      return 'Choose an unsafe incident category.';
    case 'invalid-description':
      return `Keep optional details under ${UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH} characters.`;
    case 'invalid-location':
    case 'invalid-argument':
      return 'Get a fresh device GPS location, then try again.';
    case 'permission-denied':
      return 'Your account cannot submit unsafe-location reports. Check your sign-in or contact support.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Could not save the report. Check your connection and retry.';
    default:
      return 'Could not save the unsafe-location report. Please try again.';
  }
}
