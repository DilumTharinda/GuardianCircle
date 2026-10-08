export const ARRIVAL_THRESHOLD_METERS = 50;
export const MAX_ARRIVAL_ACCURACY_METERS = 25;
export const ARRIVAL_CONFIRMATION_MS = 3000;

export function isCoordinate(value) {
  return Number.isFinite(value?.latitude) && Math.abs(value.latitude) <= 90
    && Number.isFinite(value?.longitude) && Math.abs(value.longitude) <= 180;
}

export function distanceMeters(from, to) {
  if (!isCoordinate(from) || !isCoordinate(to)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude))
    * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

export function isFreshJourneyFix(fix, now) {
  return isCoordinate(fix) && fix.mocked !== true && Number.isFinite(fix.timestamp)
    && now - fix.timestamp <= 15000 && fix.timestamp <= now + 5000;
}

export function isArrivalFix(fix, destination, now) {
  const distance = distanceMeters(fix, destination);
  return Number.isFinite(distance) && isFreshJourneyFix(fix, now) && Number.isFinite(fix.accuracy)
    && fix.accuracy >= 0 && fix.accuracy <= MAX_ARRIVAL_ACCURACY_METERS
    && distance + fix.accuracy <= ARRIVAL_THRESHOLD_METERS;
}

export function formatElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds / 60 % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
