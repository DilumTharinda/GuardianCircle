const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const ngeohash = require('ngeohash');

const NOW = 1800000000000;
const input = {
  category: 'Poor lighting',
  description: '  Street lights are not working.  ',
  location: { latitude: 6.9271, longitude: 79.8612, timestamp: NOW - 1000, mocked: false },
};
const plain = (value) => JSON.parse(JSON.stringify(value));

// Run the real service without loading Firebase configuration or making network calls.
function setup() {
  const auth = { currentUser: { uid: 'reporter-1' } };
  const state = {
    writes: [], geohashCalls: [], transactions: 0,
    failure: null, commitFailure: null, beforeTransaction: null, afterTransaction: null,
    geohashResult: undefined,
  };
  class GeoPoint {
    constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }
  }
  class FixedDate extends Date {
    static now() { return NOW; }
  }
  const firestore = {
    GeoPoint,
    collection: (_db, name) => ({ collection: name }),
    doc: (parent) => ({ ...parent, id: 'created-report' }),
    serverTimestamp: () => ({ serverTimestamp: true }),
    runTransaction: async (_db, run) => {
      state.transactions += 1;
      if (state.beforeTransaction) await state.beforeTransaction();
      if (state.failure) throw state.failure;
      const pending = [];
      const result = await run({
        set: (ref, value) => pending.push({ operation: 'set', ...ref, value }),
        get: () => { throw new Error('Creating a report must not read a missing document.'); },
      });
      if (state.commitFailure) throw state.commitFailure;
      state.writes.push(...pending);
      if (state.afterTransaction) await state.afterTransaction();
      return result;
    },
  };
  const geohash = {
    encode: (...args) => {
      state.geohashCalls.push(args);
      return state.geohashResult === undefined ? ngeohash.encode(...args) : state.geohashResult;
    },
  };
  const filename = path.resolve(__dirname, '../src/services/unsafeLocationReportService.js');
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  const stubRequire = (name) => {
    if (name === 'firebase/firestore') return firestore;
    if (name === 'ngeohash') return geohash;
    if (name === './firebase') return { auth, db: {} };
    throw new Error(`Unexpected service dependency: ${name}`);
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: stubRequire, Date: FixedDate,
  }, { filename });
  return { service: module.exports, auth, state, GeoPoint };
}

test('create writes only the canonical unsafe report schema with authenticated identity and a precise geohash', async () => {
  const { service, state, GeoPoint } = setup();
  assert.equal(service.UNSAFE_REPORTS_COLLECTION, 'reports');
  assert.equal(service.UNSAFE_REPORT_TYPE, 'unsafe_location');
  assert.equal(service.UNSAFE_REPORT_GEOHASH_PRECISION, 9);
  const result = await service.createUnsafeLocationReport('reporter-1', {
    ...input,
    reporterUid: 'intruder', reportedBy: 'intruder', ownerUid: 'intruder',
    type: 'lost', status: 'removed', photoURL: 'private-photo', upvotes: 99,
    confidenceScore: 100, createdAt: 1, updatedAt: 2, geohash: 'spoofed',
    email: 'private@example.test', contacts: ['private-contact'], journeyId: 'private-journey',
    location: { ...input.location, accuracy: 10, speed: 2, email: 'private@example.test' },
  });
  assert.equal(state.transactions, 1);
  assert.equal(state.writes.length, 1);
  const write = state.writes[0];
  assert.equal(write.collection, 'reports');
  assert.equal(write.id, 'created-report');
  assert.equal(write.operation, 'set');
  assert.deepEqual(Object.keys(write.value).sort(), [
    'category', 'confidenceScore', 'createdAt', 'description', 'geohash', 'location',
    'photoURL', 'reporterUid', 'status', 'type', 'updatedAt', 'upvotes',
  ]);
  assert.deepEqual(plain(write.value), {
    type: 'unsafe_location', reporterUid: 'reporter-1', category: 'Poor lighting',
    description: 'Street lights are not working.', photoURL: null,
    location: { latitude: 6.9271, longitude: 79.8612 },
    geohash: ngeohash.encode(6.9271, 79.8612, 9), status: 'open',
    confidenceScore: 0, upvotes: 0,
    createdAt: { serverTimestamp: true }, updatedAt: { serverTimestamp: true },
  });
  assert.ok(write.value.location instanceof GeoPoint);
  assert.equal(write.value.geohash.length, 9);
  assert.deepEqual(state.geohashCalls, [[6.9271, 79.8612, 9]]);
  assert.deepEqual(plain(result), {
    id: 'created-report', category: 'Poor lighting', description: 'Street lights are not working.',
    location: { latitude: 6.9271, longitude: 79.8612 },
  });
});

test('description is optional, trimmed, and accepts exactly the documented maximum length', async () => {
  const { service, state } = setup();
  assert.equal(service.UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH, 500);
  for (const description of [undefined, null, '', '   ', 'x'.repeat(500), ` ${'x'.repeat(500)} `]) {
    const result = await service.createUnsafeLocationReport('reporter-1', { ...input, description });
    assert.equal(result.description, description?.trim() || '');
    assert.equal(state.writes.at(-1).value.description, description?.trim() || '');
  }
});

test('all exported categories are accepted while missing, unknown, and non-string categories fail before writes', async () => {
  const { service, state } = setup();
  assert.ok(Object.isFrozen(service.UNSAFE_REPORT_CATEGORIES));
  for (const category of service.UNSAFE_REPORT_CATEGORIES) {
    await service.createUnsafeLocationReport('reporter-1', { ...input, category });
  }
  const writes = state.writes.length;
  const transactions = state.transactions;
  for (const badInput of [undefined, null, {}, false, 'invalid',
    ...['', ' ', 'unknown', ' Poor lighting ', 1, [], {}].map((category) => ({ ...input, category }))]) {
    await assert.rejects(() => service.createUnsafeLocationReport('reporter-1', badInput), {
      code: 'unsafe-report/invalid-category',
    });
  }
  assert.equal(state.writes.length, writes);
  assert.equal(state.transactions, transactions);
});

test('invalid description types and excessive trimmed length fail before writing', async () => {
  const { service, state } = setup();
  for (const description of [false, 100, [], {}, 'x'.repeat(501), `  ${'x'.repeat(501)}  `]) {
    await assert.rejects(() => service.createUnsafeLocationReport('reporter-1', { ...input, description }), {
      code: 'unsafe-report/invalid-description',
    });
  }
  assert.equal(state.transactions, 0);
  assert.equal(state.writes.length, 0);
});

test('missing, nonnumeric, nonfinite, and out-of-bounds GPS coordinates fail before writing', async () => {
  const { service, state } = setup();
  const invalid = [undefined, null, {},
    ...['6.9271', NaN, Infinity, -Infinity, 90.001, -90.001, null].map((latitude) => ({ ...input.location, latitude })),
    ...['79.8612', NaN, Infinity, -Infinity, 180.001, -180.001, null].map((longitude) => ({ ...input.location, longitude }))];
  for (const location of invalid) {
    await assert.rejects(() => service.createUnsafeLocationReport('reporter-1', { ...input, location }), {
      code: 'unsafe-report/invalid-location',
    });
  }
  assert.equal(state.transactions, 0);
  assert.equal(state.writes.length, 0);
});

test('GPS must have a valid recent timestamp and explicitly be non-mocked', async () => {
  const { service, state } = setup();
  const invalid = [
    ...[undefined, null, '1800000000000', NaN, Infinity, -1, NOW - 30001, NOW + 5001]
      .map((timestamp) => ({ ...input.location, timestamp })),
    ...[undefined, null, true, 0, 'false'].map((mocked) => ({ ...input.location, mocked })),
  ];
  for (const location of invalid) {
    await assert.rejects(() => service.createUnsafeLocationReport('reporter-1', { ...input, location }), {
      code: 'unsafe-report/invalid-location',
    });
  }
  assert.equal(state.transactions, 0);
  assert.equal(state.writes.length, 0);
});

test('coordinate and GPS age boundaries are accepted, including zero coordinates', async () => {
  const { service, state } = setup();
  for (const location of [
    { ...input.location, latitude: 0, longitude: 0, timestamp: NOW - 30000 },
    { ...input.location, latitude: -90, longitude: -180, timestamp: NOW + 5000 },
    { ...input.location, latitude: 90, longitude: 180, timestamp: NOW },
  ]) {
    await service.createUnsafeLocationReport('reporter-1', { ...input, location });
    assert.equal(state.writes.at(-1).value.location.latitude, location.latitude);
    assert.equal(state.writes.at(-1).value.location.longitude, location.longitude);
  }
});

test('invalid geohash output cannot be persisted', async () => {
  const { service, state } = setup();
  for (const geohash of ['', null, 123, {}]) {
    state.geohashResult = geohash;
    await assert.rejects(() => service.createUnsafeLocationReport('reporter-1', input), {
      code: 'unsafe-report/invalid-location',
    });
  }
  assert.equal(state.transactions, 0);
  assert.equal(state.writes.length, 0);
});

test('missing requested UID, signed-out/demo contexts, and mismatched accounts cannot submit', async () => {
  const { service, state, auth } = setup();
  for (const uid of [undefined, null, '', ' ', 123]) {
    await assert.rejects(() => service.createUnsafeLocationReport(uid, input), {
      code: 'unsafe-report/auth-required',
    });
  }
  await assert.rejects(() => service.createUnsafeLocationReport('other-user', input), {
    code: 'unsafe-report/session-changed',
  });
  auth.currentUser = null;
  for (const uid of ['reporter-1', 'parent_user_default']) {
    await assert.rejects(() => service.createUnsafeLocationReport(uid, input), {
      code: 'unsafe-report/auth-required',
    });
  }
  assert.equal(state.transactions, 0);
  assert.equal(state.writes.length, 0);
});

test('sign-out or account switch before the transaction callback prevents writes', async () => {
  for (const currentUser of [null, { uid: 'other-user' }]) {
    const { service, state, auth } = setup();
    state.beforeTransaction = () => { auth.currentUser = currentUser; };
    await assert.rejects(() => service.createUnsafeLocationReport('reporter-1', input), {
      code: currentUser ? 'unsafe-report/session-changed' : 'unsafe-report/auth-required',
    });
    assert.equal(state.writes.length, 0);
  }
});

test('account changes after server acknowledgement reject stale success without reassigning saved ownership', async () => {
  for (const currentUser of [null, { uid: 'other-user' }]) {
    const { service, state, auth } = setup();
    state.afterTransaction = () => { auth.currentUser = currentUser; };
    await assert.rejects(() => service.createUnsafeLocationReport('reporter-1', input), {
      code: currentUser ? 'unsafe-report/session-changed' : 'unsafe-report/auth-required',
    });
    assert.equal(state.writes.length, 1);
    assert.equal(state.writes[0].value.reporterUid, 'reporter-1');
  }
});

test('Firestore setup and commit failures propagate without reporting a saved document', async () => {
  for (const stage of ['failure', 'commitFailure']) {
    for (const code of ['unavailable', 'permission-denied', 'deadline-exceeded']) {
      const { service, state } = setup();
      const failure = Object.assign(new Error('private SDK details'), { code });
      state[stage] = failure;
      await assert.rejects(() => service.createUnsafeLocationReport('reporter-1', input), (error) => error === failure);
      assert.equal(state.writes.length, 0);
    }
  }
});

test('safe error mapping handles expected failures without exposing SDK messages or config', () => {
  const { service } = setup();
  const { getUnsafeReportErrorMessage: message } = service;
  const expectations = [
    ['unsafe-report/auth-required', /Sign in/], ['auth/unauthenticated', /Sign in/],
    ['unsafe-report/session-changed', /session changed/],
    ['unsafe-report/invalid-category', /category/],
    ['unsafe-report/invalid-description', /500/],
    ['unsafe-report/invalid-location', /GPS location/], ['firestore/invalid-argument', /GPS location/],
    ['firestore/permission-denied', /cannot submit/],
    ['unavailable', /connection/], ['deadline-exceeded', /connection/],
    ['auth/network-request-failed', /connection/], ['unexpected-code', /Please try again/],
  ];
  for (const [code, expected] of expectations) {
    const result = message({ code, message: 'secret config /reports/private-user' });
    assert.match(result, expected);
    assert.doesNotMatch(result, /secret|config|private-user|\/reports/);
  }
  for (const error of [undefined, null, {}, { code: 42 }, new Error('secret config')]) {
    assert.equal(message(error), 'Could not save the unsafe-location report. Please try again.');
  }
});
