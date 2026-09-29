import { isCoordinate } from '../utils/journeyMath';

export const UNSAFE_ZONE_PROXIMITY_METERS = 250;
export const OSRM_ROUTING_URL = 'https://router.project-osrm.org/route/v1/driving';
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

/** Fetch real route candidates from OSRM; never substitute synthetic geometry. */
export async function getRouteCandidates(origin, destination, fetchImpl = globalThis.fetch) {
  if (!isCoordinate(origin)) {
    const error = new Error('A valid current location is required to request routes.');
    error.code = 'safer-route/missing-location';
    throw error;
  }
  if (!isCoordinate(destination)) {
    const error = new Error('A valid destination is required to request routes.');
    error.code = 'safer-route/missing-destination';
    throw error;
  }
  if (typeof fetchImpl !== 'function') {
    const error = new Error('OSRM routing is unavailable on this device.');
    error.code = 'safer-route/unavailable';
    throw error;
  }

  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `${OSRM_ROUTING_URL}/${coordinates}?alternatives=true&overview=full&geometries=geojson&steps=false`;
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch (_error) {
    const error = new Error('Could not reach the OSRM routing service.');
    error.code = 'safer-route/network-request-failed';
    throw error;
  }
  if (!response?.ok) {
    const error = new Error('The OSRM routing service returned an error.');
    error.code = response?.status === 429 ? 'safer-route/resource-exhausted' : 'safer-route/unavailable';
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    const error = new Error('The OSRM routing response was malformed.');
    error.code = 'safer-route/malformed-response';
    throw error;
  }
  if (payload?.code === 'NoRoute' || payload?.code === 'NoSegment') return [];
  if (payload?.code !== 'Ok' || !Array.isArray(payload.routes)) {
    const error = new Error('The OSRM routing response was malformed.');
    error.code = 'safer-route/malformed-response';
    throw error;
  }

  const candidates = payload.routes.map((route, index) => ({
    id: `osrm-route-${index + 1}`,
    distanceMeters: route?.distance,
    durationSeconds: route?.duration,
    coordinates: route?.geometry?.type === 'LineString'
      && Array.isArray(route.geometry.coordinates)
      ? route.geometry.coordinates.map((point) => Array.isArray(point) && point.length >= 2
        ? { longitude: point[0], latitude: point[1] } : null)
      : null,
  }));
  if (candidates.length > 0 && !candidates.some(validCandidate)) {
    const error = new Error('The OSRM routing response contained no valid routes.');
    error.code = 'safer-route/malformed-response';
    throw error;
  }
  return candidates.filter(validCandidate);
}

export function getSaferRouteErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
  switch (code) {
    case 'no-routes':
      return 'No route alternatives were returned for this destination.';
    case 'malformed-response':
      return 'The routing service returned an invalid response. Try again later.';
    case 'invalid-location':
      return 'Choose a valid current location and destination, then try again.';
    case 'missing-location':
    case 'missing-destination':
      return 'Get a current GPS location and choose a destination before requesting a route.';
    case 'network-request-failed':
    case 'unavailable':
    case 'deadline-exceeded':
    case 'resource-exhausted':
      return 'Could not fetch route alternatives. Check your connection and try again later.';
    default:
      return 'Could not prepare route suggestions. Please try again.';
  }
}
