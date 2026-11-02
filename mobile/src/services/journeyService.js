import {
  collection,
  doc,
  GeoPoint,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';

const COLLECTION = 'journeys';
const MAX_TIMESTAMP_MS = 253402300799999;
export const JOURNEY_ARRIVAL_THRESHOLD_METERS = 50;

function journeyError(code, message) {
  const error = new Error(message);
  error.code = `journey/${code}`;
  return error;
}

function assertCurrentUser(uid) {
  if (typeof uid !== 'string' || !uid.trim() || !auth.currentUser) {
    throw journeyError('auth-required', 'Sign in to use journey tracking.');
  }
  if (auth.currentUser.uid !== uid) {
    throw journeyError('session-changed', 'Your session changed. Sign in again to continue.');
  }
}

function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP_MS;
}

function coordinates(value) {
  if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)
    || Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180
    || (value.accuracy != null && (!Number.isFinite(value.accuracy) || value.accuracy < 0))
    || (value.timestamp != null && !validTime(value.timestamp))) {
    throw journeyError('invalid-journey', 'Choose a valid destination and obtain a current GPS location.');
  }
  // Whitelist fields: location inputs must never carry ownership or other writes.
  return {
    latitude: value.latitude,
    longitude: value.longitude,
    accuracy: value.accuracy ?? null,
    timestamp: value.timestamp ?? null,
  };
}

function destinationName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 120) {
    throw journeyError('invalid-journey', 'Use a destination name of 1 to 120 characters.');
  }
  return name;
}

function point(value) {
  return new GeoPoint(value.latitude, value.longitude);
}

function journeyRef(id) {
  if (typeof id !== 'string' || !id.trim() || id.includes('/')) {
    throw journeyError('invalid-journey', 'Choose a valid journey.');
  }
  return doc(db, COLLECTION, id);
}

function timestampMillis(value) {
  const milliseconds = value instanceof Timestamp ? value.toMillis() : NaN;
  if (!validTime(milliseconds)) throw journeyError('invalid-data', 'The saved journey needs attention.');
  return milliseconds;
}

function mapJourney(id, data, uid) {
  try {
    if (data.ownerUid !== uid || !['active', 'arrived', 'cancelled'].includes(data.status)
      || !(data.destination instanceof GeoPoint) || !(data.startLocation instanceof GeoPoint)
      || !(data.currentLocation instanceof GeoPoint)) {
      throw new Error('Invalid journey record');
    }
    const startedAtMs = timestampMillis(data.startedAt);
    const endedAtMs = data.endedAt == null ? null : timestampMillis(data.endedAt);
    if ((data.status === 'active' && endedAtMs !== null)
      || (data.status !== 'arrived' && data.arrivedAt != null)
      || (data.status !== 'active' && (endedAtMs === null || endedAtMs < startedAtMs))
      || (data.status === 'arrived' && timestampMillis(data.arrivedAt) !== endedAtMs)) {
      throw new Error('Invalid journey times');
    }
    return {
      id,
      ownerUid: uid,
      destination: coordinates(data.destination),
      destinationName: destinationName(data.destinationName),
      startLocation: { ...coordinates(data.startLocation), timestamp: startedAtMs },
      currentLocation: { ...coordinates(data.currentLocation), timestamp: endedAtMs ?? startedAtMs },
      status: data.status,
      startedAtMs,
      endedAtMs,
    };
  } catch (_error) {
    throw journeyError('invalid-data', 'The saved journey could not be read. Please try again or contact support.');
  }
}

/**
 * Store only the start/end summary. GPS fixes and travelled path remain in memory.
 * An active record describes an unfinished session, not continuous/background GPS.
 * A write-only transaction needs server acknowledgement without reading a missing
 * auto-ID document, which owner-based Firestore read rules can legitimately deny.
 */
export async function createJourney(uid, input = {}) {
  assertCurrentUser(uid);
  const destination = coordinates(input?.destination);
  const startLocation = coordinates(input?.startLocation);
  const name = destinationName(input.destinationName);
  if (!validTime(input.startedAtMs)) {
    throw journeyError('invalid-journey', 'The journey start time is invalid. Try starting again.');
  }
  const ref = doc(collection(db, COLLECTION));
  await runTransaction(db, async (transaction) => {
    assertCurrentUser(uid);
    transaction.set(ref, {
      ownerUid: uid,
      destination: point(destination),
      destinationName: name,
      startLocation: point(startLocation),
      currentLocation: point(startLocation),
      status: 'active',
      startedAt: Timestamp.fromMillis(input.startedAtMs),
      endedAt: null,
      arrivedAt: null,
      trackingMode: 'foreground',
      arrivalThresholdMeters: JOURNEY_ARRIVAL_THRESHOLD_METERS,
      updatedAt: serverTimestamp(),
    });
  });
  assertCurrentUser(uid);
  return {
    id: ref.id,
    ownerUid: uid,
    destination,
    destinationName: name,
    startLocation,
    currentLocation: startLocation,
    status: 'active',
    startedAtMs: input.startedAtMs,
    endedAtMs: null,
  };
}

/** Server-only read: do not resume a stale cached active journey while offline. */
export async function getActiveJourney(uid) {
  assertCurrentUser(uid);
  // One owner filter matches the existing collection convention and needs no
  // composite index. Filter status and sort locally for the latest active record.
  const snapshot = await getDocsFromServer(query(collection(db, COLLECTION), where('ownerUid', '==', uid)));
  assertCurrentUser(uid);
  const active = snapshot.docs
    .filter((item) => item.data().ownerUid === uid && item.data().status === 'active')
    .map((item) => mapJourney(item.id, item.data(), uid));
  active.sort((left, right) => right.startedAtMs - left.startedAtMs);
  return active[0] ?? null;
}

/** Retry-safe completion: the first terminal outcome wins, with owner checks. */
export async function finishJourney(uid, id, input = {}) {
  assertCurrentUser(uid);
  const ref = journeyRef(id);
  const currentLocation = coordinates(input?.currentLocation);
  const { status, endedAtMs, distanceToDestinationMeters } = input;
  if (!['arrived', 'cancelled'].includes(status) || !validTime(endedAtMs)
    || !Number.isFinite(distanceToDestinationMeters) || distanceToDestinationMeters < 0
    || (status === 'arrived' && distanceToDestinationMeters > JOURNEY_ARRIVAL_THRESHOLD_METERS)) {
    throw journeyError('invalid-journey', 'The journey completion details are invalid.');
  }
  const result = await runTransaction(db, async (transaction) => {
    assertCurrentUser(uid);
    const snapshot = await transaction.get(ref);
    assertCurrentUser(uid);
    if (!snapshot.exists()) throw journeyError('not-found', 'This journey no longer exists.');
    const data = snapshot.data();
    if (data.ownerUid !== uid) throw journeyError('permission-denied', 'You cannot change this journey.');
    const journey = mapJourney(snapshot.id, data, uid);
    if (journey.status === status) return journey;
    if (journey.status !== 'active') {
      throw journeyError('already-ended', 'This journey has already ended. Reload its saved status.');
    }
    if (endedAtMs < journey.startedAtMs) {
      throw journeyError('invalid-journey', 'The journey end time cannot precede its start time.');
    }
    transaction.update(ref, {
      status,
      currentLocation: point(currentLocation),
      endedAt: Timestamp.fromMillis(endedAtMs),
      arrivedAt: status === 'arrived' ? Timestamp.fromMillis(endedAtMs) : null,
      distanceToDestinationMeters,
      updatedAt: serverTimestamp(),
    });
    return { ...journey, status, currentLocation, endedAtMs };
  });
  assertCurrentUser(uid);
  return result;
}

/** Never show raw SDK messages, document paths, or configuration to the user. */
export function getJourneyErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
  switch (code) {
    case 'auth-required':
    case 'unauthenticated':
      return 'Sign in to use journey tracking.';
    case 'session-changed':
      return 'Your session changed. Sign in again to continue.';
    case 'permission-denied':
      return 'Your account cannot access journeys. Check your sign-in or contact support.';
    case 'invalid-journey':
    case 'invalid-argument':
      return 'Check the destination and GPS location, then try again.';
    case 'invalid-data':
      return 'The saved journey could not be read. Please try again or contact support.';
    case 'not-found':
      return 'This journey is no longer available. Reload your journey.';
    case 'already-ended':
      return 'This journey has already ended. Reload its saved status.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Could not save or load your journey. Check your connection and retry.';
    default:
      return 'Could not save or load your journey. Please try again.';
  }
}
