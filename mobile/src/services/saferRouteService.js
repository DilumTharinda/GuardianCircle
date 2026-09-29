import { isCoordinate } from '../utils/journeyMath';

export const UNSAFE_ZONE_PROXIMITY_METERS = 250;
const EARTH_RADIUS_METERS = 6371000;

function toLocalMeters(point, origin) {
  const radians = Math.PI / 180;
  const longitudeDelta = ((point.longitude - origin.longitude + 540) % 360) - 180;
  return {
    x: longitudeDelta * radians * EARTH_RADIUS_METERS
      * Math.cos(origin.latitude * radians),
    y: (point.latitude - origin.latitude) * radians * EARTH_RADIUS_METERS,
  };
}

function pointToSegmentMeters(point, start, end) {
  const a = toLocalMeters(start, point);
  const b = toLocalMeters(end, point);
  const segmentX = b.x - a.x;
  const segmentY = b.y - a.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared === 0) return Math.hypot(a.x, a.y);
  const progress = Math.max(0, Math.min(1, -(a.x * segmentX + a.y * segmentY) / lengthSquared));
  return Math.hypot(a.x + progress * segmentX, a.y + progress * segmentY);
}

function routeDistanceToZone(zone, coordinates) {
  if (coordinates.length === 1) {
    return Math.hypot(...Object.values(toLocalMeters(coordinates[0], zone)));
  }
  let minimum = Infinity;
  for (let index = 1; index < coordinates.length; index += 1) {
    minimum = Math.min(minimum, pointToSegmentMeters(zone, coordinates[index - 1], coordinates[index]));
  }
  return minimum;
}

function validZone(zone) {
  return isCoordinate(zone)
    && Number.isFinite(zone.weight) && zone.weight > 0;
}

function validCandidate(candidate) {
  return candidate && Array.isArray(candidate.coordinates) && candidate.coordinates.length >= 2
    && candidate.coordinates.every(isCoordinate)
    && Number.isFinite(candidate.distanceMeters) && candidate.distanceMeters > 0
    && Number.isFinite(candidate.durationSeconds) && candidate.durationSeconds >= 0;
}

/**
 * Score a real route using the nearest distance from each coarse unsafe-report
 * cell to its route geometry. Each cell contributes weight * (1 - d / 250m)
 * inside 250m and zero outside. This is a relative indicator, not a probability
 * or proof of safety. Zones must be real Phase 6 aggregates; an empty set yields
 * null scores so callers cannot label a route zero-risk.
 */
export function scoreRouteRisk(coordinates, zones, proximityMeters = UNSAFE_ZONE_PROXIMITY_METERS) {
  if (!Array.isArray(coordinates) || coordinates.length < 2
    || !coordinates.every(isCoordinate)
    || !Array.isArray(zones)
    || !Number.isFinite(proximityMeters) || proximityMeters <= 0) {
    return { status: 'invalid', score: null, consideredZones: 0 };
  }
  const validZones = zones.filter(validZone);
  if (validZones.length === 0) return { status: 'no-reports', score: null, consideredZones: 0 };

  let score = 0;
  for (const zone of validZones) {
    const distance = routeDistanceToZone(zone, coordinates);
    if (distance < proximityMeters) score += zone.weight * (1 - distance / proximityMeters);
  }
  return {
    status: 'scored',
    score: Math.round(score * 1000) / 1000,
    consideredZones: validZones.length,
  };
}

/** Ignore malformed API candidates and select the lowest report score. */
export function rankRouteCandidates(candidates, zones) {
  if (!Array.isArray(candidates)) {
    return { status: 'no-routes', routes: [], suggestedRouteId: null, hasReportData: false };
  }
  const valid = candidates.filter(validCandidate);
  if (valid.length === 0) {
    return { status: 'no-routes', routes: [], suggestedRouteId: null, hasReportData: false };
  }
  const hasReportData = Array.isArray(zones) && zones.some(validZone);
  const routes = valid.map((candidate, index) => {
    const risk = hasReportData
      ? scoreRouteRisk(candidate.coordinates, zones)
      : { status: 'no-reports', score: null, consideredZones: 0 };
    return {
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `route-${index + 1}`,
      distanceMeters: candidate.distanceMeters,
      durationSeconds: candidate.durationSeconds,
      coordinates: candidate.coordinates.map(({ latitude, longitude }) => ({ latitude, longitude })),
      riskScore: risk.score,
    };
  });
  routes.sort((left, right) => {
    if (left.riskScore != null && right.riskScore != null && left.riskScore !== right.riskScore) {
      return left.riskScore - right.riskScore;
    }
    if (left.riskScore != null && right.riskScore == null) return -1;
    if (left.riskScore == null && right.riskScore != null) return 1;
    return left.distanceMeters - right.distanceMeters || left.durationSeconds - right.durationSeconds;
  });
  return {
    status: 'ranked',
    routes,
    suggestedRouteId: hasReportData ? routes[0].id : null,
    hasReportData,
  };
}

/**
 * This app configures a native Google Maps SDK key for map tiles only. It does
 * not configure an enabled/routed Directions or Routes API. Never substitute
 * straight lines or synthetic candidates when that external service is absent.
 */
export async function getRouteCandidates(_origin, _destination) {
  if (!isCoordinate(_origin)) {
    const error = new Error('A valid current location is required to request routes.');
    error.code = 'safer-route/missing-location';
    throw error;
  }
  if (!isCoordinate(_destination)) {
    const error = new Error('A valid destination is required to request routes.');
    error.code = 'safer-route/missing-destination';
    throw error;
  }
  const error = new Error('A Google Directions or Routes API integration is required to fetch route alternatives.');
  error.code = 'safer-route/routing-not-configured';
  throw error;
}

export function getSaferRouteErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
  switch (code) {
    case 'routing-not-configured':
      return 'Route alternatives are not configured. Enable a Google Directions or Routes API for this app to request real routes.';
    case 'no-routes':
      return 'No route alternatives were returned for this destination.';
    case 'invalid-location':
      return 'Choose a valid current location and destination, then try again.';
    case 'missing-location':
    case 'missing-destination':
      return 'Get a current GPS location and choose a destination before requesting a route.';
    case 'network-request-failed':
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Could not fetch route alternatives. Check your connection and try again.';
    default:
      return 'Could not prepare route suggestions. Please try again.';
  }
}
