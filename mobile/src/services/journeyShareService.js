import { Share } from 'react-native';
import { formatElapsed, isCoordinate } from '../utils/journeyMath';
import { auth } from './firebase';

const MAX_TIMESTAMP_MS = 253402300799999;

const TRACKING_LABELS = {
  watching: 'Foreground GPS active',
  acquiring: 'Acquiring foreground GPS',
  paused: 'Foreground GPS paused',
  error: 'Foreground GPS needs attention',
};

function shareError(code, message) {
  const error = new Error(message);
  error.code = `journey-share/${code}`;
  return error;
}

function cleanLabel(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function coordinateUrl(location) {
  const latitude = location.latitude.toFixed(5);
  const longitude = location.longitude.toFixed(5);
  return `https://www.google.com/maps/search/?api=1&query=${latitude}%2C${longitude}`;
}

function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP_MS;
}

function assertCurrentUser(uid) {
  if (typeof uid !== 'string' || !uid.trim() || !auth.currentUser) {
    throw shareError('auth-required', 'Sign in before sharing a journey.');
  }
  if (auth.currentUser.uid !== uid) {
    throw shareError('session-changed', 'Your session changed. Sign in again before sharing.');
  }
}

function validateInput(input = {}) {
  const { journey, currentLocation, selectedContacts } = input;
  if (!journey || input.phase !== 'active' || journey.status !== 'active') {
    throw shareError('not-active', 'Start or resume an active journey before sharing.');
  }
  if (typeof input.uid !== 'string' || !input.uid.trim() || journey.ownerUid !== input.uid) {
    throw shareError('session-changed', 'Your session changed. Sign in again before sharing.');
  }
  const destinationName = cleanLabel(journey.destinationName);
  if (!destinationName || destinationName.length > 120
    || !isCoordinate(journey.destination) || !isCoordinate(currentLocation)) {
    throw shareError('invalid-journey', 'The active journey does not have valid share information.');
  }
  if (!validTime(currentLocation.timestamp) || !validTime(input.sharedAtMs)
    || currentLocation.timestamp > input.sharedAtMs + 5000
    || !Number.isFinite(input.elapsedMs) || input.elapsedMs < 0
    || !Number.isFinite(input.distanceMeters) || input.distanceMeters < 0
    || !Object.prototype.hasOwnProperty.call(TRACKING_LABELS, input.tracking)) {
    throw shareError('invalid-journey', 'The active journey does not have valid share information.');
  }
  if (!Array.isArray(selectedContacts) || selectedContacts.length === 0) {
    throw shareError('no-contacts', 'Select at least one active trusted contact.');
  }
  const ids = new Set();
  for (const contact of selectedContacts) {
    const name = cleanLabel(contact?.targetName);
    if (contact?.type !== 'trusted_contact' || contact?.status !== 'active'
      || contact?.ownerUid !== input.uid
      || typeof contact?.id !== 'string' || !contact.id || ids.has(contact.id)
      || !name || name.length > 80) {
      throw shareError('invalid-contact', 'Select valid active contacts from your Trusted Circle.');
    }
    ids.add(contact.id);
  }
  return { destinationName };
}

function distanceLabel(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

/** Builds a one-time snapshot. It intentionally omits identity, contact data,
 * journey IDs, start location, travelled path, and location history. */
export function buildJourneyShareMessage(input = {}) {
  const { destinationName } = validateInput(input);
  const capturedAt = new Date(input.currentLocation.timestamp).toISOString();
  const sharedAt = new Date(input.sharedAtMs).toISOString();
  return [
    'GuardianCircle journey update',
    '',
    'Status: Active journey',
    `Tracking: ${TRACKING_LABELS[input.tracking]}`,
    `Destination: ${destinationName}`,
    `Destination map: ${coordinateUrl(input.journey.destination)}`,
    `Elapsed: ${formatElapsed(input.elapsedMs)}`,
    `Distance to destination: ${distanceLabel(input.distanceMeters)}`,
    `Latest recorded location (${capturedAt}): ${coordinateUrl(input.currentLocation)}`,
    `Shared at: ${sharedAt}`,
    '',
    'This is a one-time location snapshot, not a live tracking link.',
  ].join('\n');
}

export async function shareActiveJourney(input = {}) {
  assertCurrentUser(input.uid);
  const message = buildJourneyShareMessage({ ...input, sharedAtMs: input.sharedAtMs ?? Date.now() });
  try {
    // Check again immediately before handing exact locations to the OS chooser.
    assertCurrentUser(input.uid);
    const result = await Share.share(
      { title: 'GuardianCircle journey update', message },
      { dialogTitle: 'Share journey update', subject: 'GuardianCircle journey update' },
    );
    if (result?.action === Share.dismissedAction) return { status: 'cancelled' };
    if (result?.action === Share.sharedAction) return { status: 'shared' };
    throw shareError('platform-failed', 'The device share sheet returned an unknown result.');
  } catch (_error) {
    if (typeof _error?.code === 'string' && _error.code.startsWith('journey-share/')) throw _error;
    throw shareError('platform-failed', 'The device share sheet could not share this journey update.');
  }
}

export function getJourneyShareErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
  switch (code) {
    case 'not-active':
      return 'This journey is no longer active. Start another journey before sharing.';
    case 'no-contacts':
      return 'Select at least one active trusted contact.';
    case 'invalid-contact':
      return 'Refresh your Trusted Circle and select active contacts again.';
    case 'invalid-journey':
      return 'The current journey information is unavailable. Resume GPS and try again.';
    case 'auth-required':
    case 'session-changed':
      return 'Your session changed. Sign in again before sharing.';
    case 'platform-failed':
      return 'The device share sheet could not open. Please try again.';
    default:
      return 'The journey update could not be shared. Please try again.';
  }
}
