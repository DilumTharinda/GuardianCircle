const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const filename = path.resolve(__dirname, '../src/services/saferRouteService.js');
const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false,
  plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
});
const vmModule = { exports: {} };
vm.runInNewContext(code, {
  module: vmModule, exports: vmModule.exports,
  require: (name) => {
    assert.equal(name, '../utils/journeyMath');
    return { isCoordinate: (point) => Number.isFinite(point?.latitude)
      && Math.abs(point.latitude) <= 90 && Number.isFinite(point?.longitude)
      && Math.abs(point.longitude) <= 180 };
  },
}, { filename });
const service = vmModule.exports;

const closeRoute = {
  id: 'near-zone', distanceMeters: 4000, durationSeconds: 500,
  coordinates: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.02 }],
};
const farRoute = {
  id: 'far-zone', distanceMeters: 5000, durationSeconds: 600,
  coordinates: [{ latitude: 0.01, longitude: 0 }, { latitude: 0.01, longitude: 0.02 }],
};

test('risk score uses nearest route geometry distance and documented proximity falloff', () => {
  const score = service.scoreRouteRisk(closeRoute.coordinates, [
    { latitude: 0.001, longitude: 0.01, weight: 10 },
  ]);
  assert.equal(score.status, 'scored');
  assert.equal(score.consideredZones, 1);
  assert.ok(score.score > 0 && score.score < 10);
  assert.equal(service.UNSAFE_ZONE_PROXIMITY_METERS, 250);
});

test('routes outside the report buffer score zero and malformed zones are ignored', () => {
  const score = service.scoreRouteRisk(closeRoute.coordinates, [
    { latitude: 1, longitude: 1, weight: 100 },
    { latitude: NaN, longitude: 0, weight: 50 },
    { latitude: 0, longitude: 0, weight: -1 },
  ]);
  assert.equal(score.status, 'scored');
  assert.equal(score.score, 0);
  assert.equal(score.consideredZones, 1);
});

test('missing reports never produce a zero-risk claim', () => {
  const score = service.scoreRouteRisk(closeRoute.coordinates, []);
  assert.deepEqual(JSON.parse(JSON.stringify(score)), {
    status: 'no-reports', score: null, consideredZones: 0,
  });
  const ranked = service.rankRouteCandidates([closeRoute], []);
  assert.equal(ranked.status, 'ranked');
  assert.equal(ranked.hasReportData, false);
  assert.equal(ranked.suggestedRouteId, null);
  assert.equal(ranked.routes[0].riskScore, null);
});

test('invalid geometry, zones, and scoring parameters return an explicit invalid state', () => {
  for (const args of [
    [[], []], [[{ latitude: 0, longitude: 0 }, { latitude: 91, longitude: 0 }], []],
    [closeRoute.coordinates, null], [closeRoute.coordinates, [], 0],
  ]) {
    assert.equal(service.scoreRouteRisk(...args).status, 'invalid');
  }
});

test('valid route alternatives rank lower reported exposure first with deterministic ties', () => {
  const result = service.rankRouteCandidates([closeRoute, farRoute], [
    { latitude: 0.001, longitude: 0.01, weight: 10 },
  ]);
  assert.equal(result.status, 'ranked');
  assert.equal(result.hasReportData, true);
  assert.equal(result.suggestedRouteId, 'far-zone');
  assert.equal(result.routes[0].riskScore, 0);
  assert.ok(result.routes[1].riskScore > result.routes[0].riskScore);

  const tied = service.rankRouteCandidates([
    { ...closeRoute, id: 'longer', distanceMeters: 4200 },
    { ...closeRoute, id: 'shorter', distanceMeters: 4100 },
  ], [{ latitude: 5, longitude: 5, weight: 1 }]);
  assert.deepEqual(Array.from(tied.routes, (route) => route.id), ['shorter', 'longer']);
});

test('malformed route candidates are skipped and no valid alternatives is reported', () => {
  const result = service.rankRouteCandidates([
    null, { ...closeRoute, coordinates: [{ latitude: 0, longitude: 0 }] },
    { ...closeRoute, durationSeconds: -1 },
    { ...closeRoute, coordinates: [{ latitude: 100, longitude: 0 }, { latitude: 0, longitude: 0 }] },
  ], []);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    status: 'no-routes', routes: [], suggestedRouteId: null, hasReportData: false,
  });
});

test('route alternatives contain only whitelisted geometry and travel fields', () => {
  const candidate = {
    ...closeRoute, reporterUid: 'private', description: 'private', apiKey: 'secret',
    coordinates: closeRoute.coordinates.map((point) => ({ ...point, private: 'drop' })),
  };
  const ranked = service.rankRouteCandidates([candidate], [{ latitude: 1, longitude: 1, weight: 1 }]);
  assert.deepEqual(Object.keys(ranked.routes[0]).sort(), [
    'coordinates', 'distanceMeters', 'durationSeconds', 'id', 'riskScore',
  ]);
  assert.deepEqual(Object.keys(ranked.routes[0].coordinates[0]).sort(), ['latitude', 'longitude']);
});

test('routing remains explicitly unavailable when only native map tiles are configured', async () => {
  await assert.rejects(() => service.getRouteCandidates(null, { latitude: 6, longitude: 79 }), {
    code: 'safer-route/missing-location',
  });
  await assert.rejects(() => service.getRouteCandidates({ latitude: 6, longitude: 79 }, null), {
    code: 'safer-route/missing-destination',
  });
  await assert.rejects(() => service.getRouteCandidates(
    { latitude: 6, longitude: 79 }, { latitude: 7, longitude: 80 },
  ), { code: 'safer-route/routing-not-configured' });
  assert.match(service.getSaferRouteErrorMessage({ code: 'routing-not-configured' }), /Directions or Routes API/);
  assert.match(service.getSaferRouteErrorMessage({ code: 'network-request-failed' }), /connection/);
  assert.doesNotMatch(service.getSaferRouteErrorMessage({ code: 'routing-not-configured' }), /secret|apiKey/);
});
