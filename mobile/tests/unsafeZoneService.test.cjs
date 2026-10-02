const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const ngeohash = require('ngeohash');

const NOW = 1800000000000;
const plain = (value) => JSON.parse(JSON.stringify(value));

// Isolated SDK callbacks exercise the actual modules without Firebase configuration.
function setup() {
  const auth = { currentUser: { uid: 'viewer-1' } };
  const state = {
    snapshots: [], authListeners: [], now: NOW,
    initialAuthError: null, initialSnapshotError: null, setupFailure: null,
    decodeFailure: null,
  };
  class GeoPoint {
    constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }
  }
  class Timestamp {
    constructor(milliseconds) { this.milliseconds = milliseconds; }
    toMillis() { return this.milliseconds; }
  }
  class FixedDate extends Date {
    static now() { return state.now; }
  }
  const firestore = {
    GeoPoint, Timestamp,
    collection: (_db, name) => ({ collection: name }),
    where: (field, operator, value) => ({ kind: 'where', field, operator, value }),
    limit: (value) => ({ kind: 'limit', value }),
    query: (parent, ...constraints) => ({ ...parent, constraints }),
    onSnapshot: (query, ...args) => {
      if (state.setupFailure) throw state.setupFailure;
      const hasOptions = typeof args[0] === 'object';
      const listener = {
        query, options: hasOptions ? args[0] : {},
        next: args[hasOptions ? 1 : 0], error: args[hasOptions ? 2 : 1], unsubscribeCount: 0,
      };
      state.snapshots.push(listener);
      if (state.initialSnapshotError) listener.error(state.initialSnapshotError);
      return () => { listener.unsubscribeCount += 1; };
    },
  };
  const authApi = {
    onAuthStateChanged: (_auth, next, error) => {
      const listener = { next, error, unsubscribeCount: 0 };
      state.authListeners.push(listener);
      if (state.initialAuthError) error(state.initialAuthError);
      return () => { listener.unsubscribeCount += 1; };
    },
  };
  const geohash = {
    encode: (...args) => ngeohash.encode(...args),
    decode: (cell) => {
      if (state.decodeFailure === cell) throw new Error('Malformed cell');
      return ngeohash.decode(cell);
    },
  };
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, babelrc: false, configFile: false,
      plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    });
    const stubRequire = (name) => {
      if (name === 'firebase/firestore') return firestore;
      if (name === 'firebase/auth') return authApi;
      if (name === 'ngeohash') return geohash;
      if (name === './firebase') return { auth, db: {} };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.js`));
      throw new Error(`Unexpected service dependency: ${name}`);
    };
    vm.runInNewContext(code, {
      module, exports: module.exports, require: stubRequire, Date: FixedDate,
    }, { filename });
    return module.exports;
  }
  const service = load(path.resolve(__dirname, '../src/services/unsafeZoneService.js'));
  const record = (overrides = {}) => ({
    type: 'unsafe_location', reporterUid: 'community-reporter', category: 'Poor lighting',
    description: '', photoURL: null, location: new GeoPoint(6.9271, 79.8612),
    geohash: ngeohash.encode(6.9271, 79.8612, 9), status: 'open',
    confidenceScore: 0, upvotes: 0, createdAt: new Timestamp(NOW - 10000),
    updatedAt: new Timestamp(NOW - 5000), ...overrides,
  });
  const document = (id, data = record(), metadata = {}) => ({
    id, data: () => data, metadata: { hasPendingWrites: false, ...metadata },
  });
  const snapshot = (docs = [], fromCache = false) => ({ docs, metadata: { fromCache } });
  const listen = (uid = 'viewer-1') => {
    const received = [];
    const errors = [];
    const unsubscribe = service.subscribeUnsafeZones(uid, (value) => received.push(value), (error) => errors.push(error));
    return { received, errors, unsubscribe };
  };
  return { service, auth, state, GeoPoint, Timestamp, record, document, snapshot, listen };
}

test('subscription requests a bounded canonical community query and metadata changes', () => {
  const { service, state, listen, document, snapshot } = setup();
  const { received, errors, unsubscribe } = listen();
  assert.equal(state.snapshots.length, 1);
  const listener = state.snapshots[0];
  assert.deepEqual(plain(listener.query), {
    collection: 'reports',
    constraints: [
      { kind: 'where', field: 'type', operator: '==', value: 'unsafe_location' },
      { kind: 'where', field: 'status', operator: '==', value: 'open' },
      { kind: 'limit', value: service.MAX_UNSAFE_ZONE_REPORTS + 1 },
    ],
  });
  assert.equal(listener.options.includeMetadataChanges, true);
  listener.next(snapshot([document('first')], true));
  assert.equal(received[0].reportCount, 1);
  assert.equal(received[0].fromCache, true);
  state.now += 1000;
  listener.next(snapshot([document('first')], false));
  assert.equal(received[1].fromCache, false);
  assert.equal(received[1].updatedAtMs, NOW + 1000);
  listener.next(snapshot());
  assert.equal(received[2].reportCount, 0);
  assert.equal(received[2].points.length, 0);
  assert.equal(errors.length, 0);
  unsubscribe();
});

test('canonical reports map to coarse cell centers and retain no report identity or details', () => {
  const { service, record, document, snapshot } = setup();
  const data = record({
    description: 'Private freeform details', reporterUid: 'private-reporter',
    email: 'private@example.test', contacts: ['private-contact'], id: 'injected-id',
  });
  const summary = service.buildUnsafeZoneSummary(snapshot([document('private-document', data)]));
  const cell = data.geohash.slice(0, service.UNSAFE_ZONE_CELL_PRECISION);
  const center = ngeohash.decode(cell);
  assert.equal(service.UNSAFE_ZONE_CELL_PRECISION, 7);
  assert.deepEqual(plain(summary.points), [{
    latitude: center.latitude, longitude: center.longitude, weight: 1,
  }]);
  assert.deepEqual(Object.keys(summary.points[0]).sort(), ['latitude', 'longitude', 'weight']);
  assert.notEqual(summary.points[0].latitude, data.location.latitude);
  assert.doesNotMatch(JSON.stringify(summary), /private|injected|reporterUid|description|photoURL|geohash|contacts/);
  assert.equal(summary.reportCount, 1);
  assert.equal(summary.ignoredCount, 0);
  assert.equal(summary.truncated, false);
});

test('same-cell reports aggregate and weights remain finite, positive, and capped', () => {
  const { service, record, document, snapshot, GeoPoint } = setup();
  const sameCell = Array.from({ length: 130 }, (_, index) => document(`same-${index}`, record({
    reporterUid: `community-member-${index}`,
  })));
  const other = record({
    location: new GeoPoint(7, 80), geohash: ngeohash.encode(7, 80, 9),
  });
  const summary = service.buildUnsafeZoneSummary(snapshot([...sameCell, document('other', other)]));
  assert.equal(summary.reportCount, 131);
  assert.equal(summary.points.length, 2);
  assert.equal(summary.points[0].weight, 100);
  assert.equal(summary.points[1].weight, 1);
  for (const point of summary.points) {
    assert.ok(Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90);
    assert.ok(Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
    assert.ok(Number.isFinite(point.weight) && point.weight >= 1 && point.weight <= 100);
  }
});

test('equal-density output is deterministic regardless of snapshot order', () => {
  const { service, record, document, snapshot, GeoPoint } = setup();
  const docs = [0, 1, 2].map((offset) => document(`report-${offset}`, record({
    location: new GeoPoint(6 + offset, 79), geohash: ngeohash.encode(6 + offset, 79, 9),
  })));
  const first = service.buildUnsafeZoneSummary(snapshot(docs));
  const second = service.buildUnsafeZoneSummary(snapshot([...docs].reverse()));
  assert.deepEqual(plain(first.points), plain(second.points));
});

test('report cap bounds processing and explicitly signals truncated input', () => {
  const { service, document, snapshot } = setup();
  assert.equal(service.MAX_UNSAFE_ZONE_REPORTS, 1000);
  const docs = Array.from({ length: service.MAX_UNSAFE_ZONE_REPORTS + 1 }, (_, index) => document(`report-${index}`));
  const summary = service.buildUnsafeZoneSummary(snapshot(docs));
  assert.equal(summary.reportCount, service.MAX_UNSAFE_ZONE_REPORTS);
  assert.equal(summary.ignoredCount, 0);
  assert.equal(summary.points.length, 1);
  assert.equal(summary.truncated, true);
  assert.equal(service.buildUnsafeZoneSummary(snapshot(docs.slice(0, -1))).truncated, false);
});

test('point cap bounds rendered cells and retains the densest cells first', () => {
  const { service, record, document, snapshot, GeoPoint } = setup();
  assert.equal(service.MAX_UNSAFE_ZONE_POINTS, 500);
  const docs = Array.from({ length: service.MAX_UNSAFE_ZONE_POINTS + 1 }, (_, index) => {
    const latitude = -60 + index * 0.1;
    return document(`report-${index}`, record({
      location: new GeoPoint(latitude, 10), geohash: ngeohash.encode(latitude, 10, 9),
    }));
  });
  docs.push(document('dense-cell', docs[500].data()));
  const summary = service.buildUnsafeZoneSummary(snapshot(docs));
  assert.equal(summary.reportCount, 502);
  assert.equal(summary.points.length, 500);
  assert.equal(summary.points[0].weight, 2);
  const densest = ngeohash.decode(docs[500].data().geohash.slice(0, 7));
  assert.equal(summary.points[0].latitude, densest.latitude);
  assert.equal(summary.points[0].longitude, densest.longitude);
  assert.equal(summary.truncated, true);
});

test('empty or absent snapshots produce an empty summary without artificial points', () => {
  const { service, snapshot } = setup();
  for (const value of [undefined, null, {}, { docs: {} }, snapshot()]) {
    assert.deepEqual(plain(service.buildUnsafeZoneSummary(value)), {
      points: [], reportCount: 0, ignoredCount: 0, truncated: false, fromCache: false, updatedAtMs: NOW,
    });
  }
  assert.equal(service.buildUnsafeZoneSummary(snapshot([], true)).fromCache, true);
});

test('malformed, unrelated, removed, pending, and mismatched-geohash records are skipped individually', () => {
  const { service, record, document, snapshot, GeoPoint, Timestamp } = setup();
  const badFields = [
    { type: 'lost' }, { type: 'found' }, { status: 'removed' }, { status: 'pending' },
    { reporterUid: '' }, { reporterUid: ' ' }, { reporterUid: null },
    { category: 'unknown' }, { description: null }, { description: 'x'.repeat(501) },
    { photoURL: undefined }, { photoURL: 'private-photo' },
    { location: null }, { location: { latitude: 6.9271, longitude: 79.8612 } },
    ...[NaN, Infinity, '6.9271', 90.1, -90.1].map((latitude) => ({ location: new GeoPoint(latitude, 79) })),
    ...[NaN, Infinity, '79', 180.1, -180.1].map((longitude) => ({ location: new GeoPoint(6, longitude) })),
    { geohash: null }, { geohash: 'short' }, { geohash: '!!!!!!!!!' },
    { geohash: ngeohash.encode(0, 0, 9) },
    { createdAt: null }, { updatedAt: 1234 },
    { createdAt: new Timestamp(NaN) }, { createdAt: new Timestamp(-1) },
    { updatedAt: new Timestamp(253402300800000) }, { updatedAt: new Timestamp(NOW + 0.5) },
    { createdAt: { toMillis: () => NOW } },
  ];
  const bad = badFields.map((fields, index) => document(`bad-${index}`, record(fields)));
  bad.push(document('pending-write', record(), { hasPendingWrites: true }));
  bad.push(document('missing-data', undefined));
  bad[bad.length - 1] = { data: () => undefined };
  bad.push({ data: () => { throw new Error('Bad snapshot data'); } });
  bad.push(null);
  const summary = service.buildUnsafeZoneSummary(snapshot([
    document('valid-first'), ...bad, document('valid-last', record({ reporterUid: 'another-user' })),
  ]));
  assert.equal(summary.reportCount, 2);
  assert.equal(summary.ignoredCount, bad.length);
  assert.equal(summary.points.length, 1);
  assert.equal(summary.points[0].weight, 2);
  assert.equal(summary.truncated, false);
});

test('canonical zero and coordinate-edge locations remain valid', () => {
  const { service, record, document, snapshot, GeoPoint, Timestamp } = setup();
  const docs = [[0, 0], [-90, -180], [90, 180]].map(([latitude, longitude], index) => document(`edge-${index}`, record({
    location: new GeoPoint(latitude, longitude), geohash: ngeohash.encode(latitude, longitude, 9),
    createdAt: new Timestamp(0), updatedAt: new Timestamp(253402300799999),
  })));
  const summary = service.buildUnsafeZoneSummary(snapshot(docs));
  assert.equal(summary.reportCount, 3);
  assert.equal(summary.ignoredCount, 0);
  assert.equal(summary.points.length, 3);
});

test('one cell decoding error does not prevent other cells from rendering', () => {
  const { service, state, record, document, snapshot, GeoPoint } = setup();
  state.decodeFailure = record().geohash.slice(0, 7);
  const good = record({ location: new GeoPoint(10, 20), geohash: ngeohash.encode(10, 20, 9) });
  const summary = service.buildUnsafeZoneSummary(snapshot([document('broken-cell'), document('valid-cell', good)]));
  assert.equal(summary.points.length, 1);
  assert.equal(summary.points[0].weight, 1);
  assert.equal(summary.ignoredCount, 1);
});

test('missing authentication, demo-only identity, and mismatched UID never register listeners', () => {
  for (const uid of [null, '', ' ', 123]) {
    const { state, listen } = setup();
    const { received, errors, unsubscribe } = listen(uid);
    assert.equal(errors[0].code, 'unsafe-zone/auth-required');
    assert.equal(received.length, 0);
    assert.equal(state.snapshots.length, 0);
    assert.equal(state.authListeners.length, 0);
    unsubscribe();
  }
  const { service, state, auth, listen } = setup();
  const missing = [];
  service.subscribeUnsafeZones(undefined, () => {}, (error) => missing.push(error));
  assert.equal(missing[0].code, 'unsafe-zone/auth-required');
  assert.equal(listen('other-user').errors[0].code, 'unsafe-zone/session-changed');
  auth.currentUser = null;
  assert.equal(listen('parent_user_default').errors[0].code, 'unsafe-zone/auth-required');
  assert.equal(state.snapshots.length, 0);
  assert.equal(state.authListeners.length, 0);
});

test('auth sign-out or account switch unsubscribes once and blocks later snapshot callbacks', () => {
  for (const currentUser of [null, { uid: 'other-user' }]) {
    const { state, auth, listen, snapshot, document } = setup();
    const { received, errors, unsubscribe } = listen();
    state.snapshots[0].next(snapshot([document('first')]));
    auth.currentUser = currentUser;
    state.authListeners[0].next(currentUser);
    assert.equal(errors[0].code, 'unsafe-zone/session-changed');
    state.snapshots[0].next(snapshot([document('late')]));
    state.snapshots[0].error(new Error('Late error'));
    state.authListeners[0].next(currentUser);
    unsubscribe();
    assert.equal(received.length, 1);
    assert.equal(errors.length, 1);
    assert.equal(state.snapshots[0].unsubscribeCount, 1);
    assert.equal(state.authListeners[0].unsubscribeCount, 1);
  }
});

test('snapshot callback rechecks the current user before mapping even before auth notification', () => {
  const { state, auth, listen, snapshot, document } = setup();
  const { received, errors } = listen();
  auth.currentUser = { uid: 'other-user' };
  state.snapshots[0].next(snapshot([document('must-not-emit')]));
  assert.equal(received.length, 0);
  assert.equal(errors[0].code, 'unsafe-zone/session-changed');
  assert.equal(state.snapshots[0].unsubscribeCount, 1);
  assert.equal(state.authListeners[0].unsubscribeCount, 1);
});

test('explicit unsubscribe is idempotent and suppresses all late callbacks', () => {
  const { state, listen, snapshot, document } = setup();
  const { received, errors, unsubscribe } = listen();
  unsubscribe();
  unsubscribe();
  state.snapshots[0].next(snapshot([document('late')]));
  state.snapshots[0].error(new Error('Late snapshot failure'));
  state.authListeners[0].next(null);
  state.authListeners[0].error(new Error('Late auth failure'));
  assert.equal(received.length, 0);
  assert.equal(errors.length, 0);
  assert.equal(state.snapshots[0].unsubscribeCount, 1);
  assert.equal(state.authListeners[0].unsubscribeCount, 1);
});

test('Firestore and auth errors terminate subscriptions and forward the original error once', () => {
  for (const source of ['snapshots', 'authListeners']) {
    const { state, listen, snapshot } = setup();
    const { received, errors, unsubscribe } = listen();
    const failure = Object.assign(new Error('Private backend details'), { code: 'permission-denied' });
    state[source][0].error(failure);
    state[source][0].error(failure);
    state.snapshots[0].next(snapshot());
    unsubscribe();
    assert.equal(errors.length, 1);
    assert.equal(errors[0], failure);
    assert.equal(received.length, 0);
    assert.equal(state.snapshots[0].unsubscribeCount, 1);
    assert.equal(state.authListeners[0].unsubscribeCount, 1);
  }
});

test('synchronous listener setup failures clean up registrations without leaking subscriptions', () => {
  for (const stage of ['initialAuthError', 'initialSnapshotError', 'setupFailure']) {
    const { state, listen } = setup();
    const failure = Object.assign(new Error('Setup failed'), { code: 'unavailable' });
    state[stage] = failure;
    const { received, errors, unsubscribe } = listen();
    unsubscribe();
    assert.equal(errors.length, 1);
    assert.equal(errors[0], failure);
    assert.equal(received.length, 0);
    assert.equal(state.authListeners[0].unsubscribeCount, 1);
    if (stage === 'initialSnapshotError') assert.equal(state.snapshots[0].unsubscribeCount, 1);
    else assert.equal(state.snapshots.length, 0);
  }
});

test('safe error mapping never exposes backend messages, paths, or index links', () => {
  const { service } = setup();
  const expectations = [
    ['unsafe-zone/auth-required', /Sign in/], ['auth/unauthenticated', /Sign in/],
    ['unsafe-zone/session-changed', /session changed/], ['firestore/permission-denied', /cannot access/],
    ['failed-precondition', /temporarily unavailable/],
    ['unavailable', /connection/], ['deadline-exceeded', /connection/],
    ['auth/network-request-failed', /connection/], ['unknown', /Please try again/],
  ];
  for (const [code, pattern] of expectations) {
    const result = service.getUnsafeZoneErrorMessage({ code, message: 'private /reports/uid https://console.firebase.google.com/index' });
    assert.match(result, pattern);
    assert.doesNotMatch(result, /private|\/reports|https:|firebase/);
  }
  for (const error of [undefined, null, {}, { code: 42 }, new Error('private path')]) {
    assert.equal(service.getUnsafeZoneErrorMessage(error), 'Could not load user-submitted safety reports. Please try again.');
  }
});
