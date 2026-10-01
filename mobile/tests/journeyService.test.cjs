const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const start = {
  destination: { latitude: 12, longitude: 14 },
  destinationName: '  Selected destination  ',
  startLocation: { latitude: 11, longitude: 13, accuracy: 10, timestamp: 1000 },
  startedAtMs: 2000,
};
const finish = {
  status: 'arrived', endedAtMs: 10000,
  currentLocation: { latitude: 12, longitude: 14, accuracy: 8, timestamp: 9900 },
  distanceToDestinationMeters: 0,
};
const plain = (value) => JSON.parse(JSON.stringify(value));

// Exercise the actual service with an isolated SDK, never loading Firebase config.
function setup() {
  const auth = { currentUser: { uid: 'owner-1' } };
  const state = {
    documents: new Map(), reads: [], writes: [], queryRows: [], failure: null,
    beforeRead: null, beforeTransaction: null, afterTransaction: null,
  };
  class GeoPoint {
    constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }
  }
  class Timestamp {
    constructor(milliseconds) { this.milliseconds = milliseconds; }
    static fromMillis(milliseconds) { return new Timestamp(milliseconds); }
    toMillis() { return this.milliseconds; }
  }
  const snapshot = (id, data) => ({ id, exists: () => data !== undefined, data: () => data });
  const checkRead = async () => {
    if (state.beforeRead) await state.beforeRead();
    if (state.failure) throw state.failure;
  };
  const firestore = {
    GeoPoint, Timestamp,
    collection: (_db, name) => ({ collection: name }),
    doc: (parent, name, id) => name === undefined
      ? { ...parent, id: 'created-journey' } : { collection: name, id },
    where: (field, operator, value) => ({ field, operator, value }),
    query: (collection, ...constraints) => ({ ...collection, constraints }),
    serverTimestamp: () => ({ serverTimestamp: true }),
    getDocsFromServer: async (query) => {
      state.reads.push({ ...query, source: 'server' });
      await checkRead();
      return { docs: state.queryRows.map(([id, data]) => snapshot(id, data)) };
    },
    runTransaction: async (_db, run) => {
      if (state.beforeTransaction) await state.beforeTransaction();
      if (state.failure) throw state.failure;
      const writes = [];
      const result = await run({
        get: async (ref) => {
          state.reads.push(ref);
          await checkRead();
          return snapshot(ref.id, state.documents.get(ref.id));
        },
        set: (ref, value) => writes.push({ operation: 'set', ...ref, value }),
        update: (ref, value) => writes.push({ operation: 'update', ...ref, value }),
      });
      for (const write of writes) {
        state.documents.set(write.id, write.operation === 'set'
          ? write.value : { ...state.documents.get(write.id), ...write.value });
      }
      state.writes.push(...writes);
      if (state.afterTransaction) await state.afterTransaction();
      return result;
    },
  };
  const filename = path.resolve(__dirname, '../src/services/journeyService.js');
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  const stubRequire = (name) => {
    if (name === 'firebase/firestore') return firestore;
    if (name === './firebase') return { auth, db: {} };
    throw new Error(`Unexpected service dependency: ${name}`);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: stubRequire }, { filename });
  const record = (overrides = {}) => ({
    ownerUid: 'owner-1', destination: new GeoPoint(12, 14),
    destinationName: 'Selected destination', startLocation: new GeoPoint(11, 13),
    currentLocation: new GeoPoint(11, 13), status: 'active',
    startedAt: Timestamp.fromMillis(2000), endedAt: null, arrivedAt: null,
    trackingMode: 'foreground', arrivalThresholdMeters: 50, ...overrides,
  });
  return { service: module.exports, auth, state, GeoPoint, Timestamp, record };
}

test('create persists an owned foreground summary with typed coordinates/times and no missing-document read', async () => {
  const { service, state, GeoPoint, Timestamp } = setup();
  const result = await service.createJourney('owner-1', {
    ...start, ownerUid: 'owner-2', status: 'arrived', sharedWith: ['other-user'], path: [start.startLocation],
  });
  assert.equal(result.id, 'created-journey');
  assert.equal(result.ownerUid, 'owner-1');
  assert.equal(result.destinationName, 'Selected destination');
  assert.equal(result.status, 'active');
  assert.equal(result.startedAtMs, 2000);
  assert.equal(result.endedAtMs, null);
  assert.deepEqual(plain(result.currentLocation), start.startLocation);
  assert.equal(state.reads.length, 0);
  assert.equal(state.writes.length, 1);
  const write = state.writes[0];
  assert.equal(write.collection, 'journeys');
  assert.equal(write.operation, 'set');
  assert.equal(write.value.ownerUid, 'owner-1');
  assert.equal(write.value.trackingMode, 'foreground');
  assert.equal(write.value.arrivalThresholdMeters, 50);
  assert.ok(write.value.destination instanceof GeoPoint);
  assert.ok(write.value.startLocation instanceof GeoPoint);
  assert.ok(write.value.currentLocation instanceof GeoPoint);
  assert.ok(write.value.startedAt instanceof Timestamp);
  assert.equal(write.value.startedAt.toMillis(), 2000);
  assert.deepEqual(Object.keys(write.value).sort(), [
    'arrivalThresholdMeters', 'arrivedAt', 'currentLocation', 'destination', 'destinationName',
    'endedAt', 'ownerUid', 'startLocation', 'startedAt', 'status', 'trackingMode', 'updatedAt',
  ]);
});

test('create rejects malformed coordinates, names, GPS metadata, and times before writing', async () => {
  const { service, state } = setup();
  const invalid = [null, {}, { ...start, destinationName: ' ' }, { ...start, destinationName: 'x'.repeat(121) },
    { ...start, destination: { latitude: '12', longitude: 14 } },
    { ...start, destination: { latitude: 91, longitude: 14 } },
    { ...start, destination: { latitude: 12, longitude: -181 } },
    { ...start, startLocation: { latitude: NaN, longitude: 13 } },
    { ...start, startLocation: { ...start.startLocation, accuracy: -1 } },
    { ...start, startLocation: { ...start.startLocation, timestamp: Infinity } },
    ...[-1, NaN, Infinity, 0.5, '2000', 253402300800000].map((startedAtMs) => ({ ...start, startedAtMs }))];
  for (const input of invalid) {
    await assert.rejects(() => service.createJourney('owner-1', input), { code: 'journey/invalid-journey' });
  }
  assert.equal(state.writes.length, 0);
});

test('read queries authenticated owner on the server and selects the latest valid active journey', async () => {
  const { service, state, record, Timestamp } = setup();
  state.queryRows = [
    ['old', record()], ['new', record({ startedAt: Timestamp.fromMillis(3000), id: 'spoofed' })],
    ['foreign', record({ ownerUid: 'owner-2', startedAt: Timestamp.fromMillis(9000) })],
    ['terminal', record({ status: 'cancelled', startedAt: Timestamp.fromMillis(10000) })],
  ];
  const result = await service.getActiveJourney('owner-1');
  assert.equal(result.id, 'new');
  assert.equal(result.startedAtMs, 3000);
  assert.equal(result.currentLocation.accuracy, null);
  assert.deepEqual(plain(result.destination), { latitude: 12, longitude: 14, accuracy: null, timestamp: null });
  assert.deepEqual(plain(state.reads), [{
    collection: 'journeys', source: 'server',
    constraints: [{ field: 'ownerUid', operator: '==', value: 'owner-1' }],
  }]);
});

test('read returns null when there are no owned active journeys', async () => {
  const { service, state, record } = setup();
  assert.equal(await service.getActiveJourney('owner-1'), null);
  state.queryRows = [['terminal', record({ status: 'arrived' })], ['foreign', record({ ownerUid: 'owner-2' })]];
  assert.equal(await service.getActiveJourney('owner-1'), null);
});

test('malformed active records fail safely rather than pretending no journey exists', async () => {
  const { service, state, record, Timestamp } = setup();
  for (const changes of [
    { destination: { latitude: 12, longitude: 14 } }, { currentLocation: null },
    { destinationName: '' }, { startedAt: 2000 }, { startedAt: Timestamp.fromMillis(-1) },
    { endedAt: Timestamp.fromMillis(4000) }, { arrivedAt: Timestamp.fromMillis(4000) },
  ]) {
    state.queryRows = [['broken', record(changes)]];
    await assert.rejects(() => service.getActiveJourney('owner-1'), { code: 'journey/invalid-data' });
  }
});

test('arrival updates only terminal summary fields and preserves owner/start/destination', async () => {
  const { service, state, record, GeoPoint } = setup();
  state.documents.set('trip', record());
  const result = await service.finishJourney('owner-1', 'trip', {
    ...finish, ownerUid: 'owner-2', destinationName: 'spoofed', startedAtMs: 0, sharedWith: ['intruder'],
  });
  assert.equal(result.status, 'arrived');
  assert.equal(result.endedAtMs, 10000);
  const write = state.writes[0];
  assert.equal(write.collection, 'journeys');
  assert.equal(write.operation, 'update');
  assert.ok(write.value.currentLocation instanceof GeoPoint);
  assert.equal(write.value.endedAt.toMillis(), 10000);
  assert.equal(write.value.arrivedAt.toMillis(), 10000);
  assert.deepEqual(Object.keys(write.value).sort(), [
    'arrivedAt', 'currentLocation', 'distanceToDestinationMeters', 'endedAt', 'status', 'updatedAt',
  ]);
  assert.equal(state.documents.get('trip').ownerUid, 'owner-1');
  assert.equal(state.documents.get('trip').destinationName, 'Selected destination');
  assert.equal(state.documents.get('trip').startedAt.toMillis(), 2000);
});

test('manual cancellation records no arrival and is not restricted to the arrival radius', async () => {
  const { service, state, record } = setup();
  state.documents.set('trip', record());
  const result = await service.finishJourney('owner-1', 'trip', {
    ...finish, status: 'cancelled', currentLocation: start.startLocation, distanceToDestinationMeters: 15000,
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(state.writes[0].value.arrivedAt, null);
  assert.equal(state.writes[0].value.distanceToDestinationMeters, 15000);
});

test('repeated completion preserves the first outcome and conflicting terminal transitions are rejected', async () => {
  for (const status of ['arrived', 'cancelled']) {
    const { service, state, record } = setup();
    state.documents.set('trip', record());
    await service.finishJourney('owner-1', 'trip', { ...finish, status });
    const result = await service.finishJourney('owner-1', 'trip', { ...finish, status, endedAtMs: 20000 });
    assert.equal(result.endedAtMs, 10000);
    assert.equal(state.writes.length, 1);
    await assert.rejects(() => service.finishJourney('owner-1', 'trip', {
      ...finish, status: status === 'arrived' ? 'cancelled' : 'arrived',
    }), { code: 'journey/already-ended' });
    assert.equal(state.writes.length, 1);
  }
});

test('finish rejects invalid terminal data and arrival outside the documented threshold', async () => {
  const { service, state, record } = setup();
  state.documents.set('trip', record());
  for (const changes of [
    { status: 'active' }, { status: 'completed' }, { endedAtMs: 1999 }, { endedAtMs: NaN },
    { currentLocation: null }, { distanceToDestinationMeters: -1 },
    { distanceToDestinationMeters: Infinity }, { distanceToDestinationMeters: '20' },
    { distanceToDestinationMeters: 50.01 },
  ]) {
    await assert.rejects(() => service.finishJourney('owner-1', 'trip', { ...finish, ...changes }), {
      code: 'journey/invalid-journey',
    });
  }
  assert.equal(state.writes.length, 0);
  await service.finishJourney('owner-1', 'trip', { ...finish, distanceToDestinationMeters: 50 });
  assert.equal(state.writes.length, 1);
});

test('finish rejects missing or foreign-owned documents without mutation', async () => {
  const { service, state, record } = setup();
  await assert.rejects(() => service.finishJourney('owner-1', 'missing', finish), { code: 'journey/not-found' });
  state.documents.set('foreign', record({ ownerUid: 'owner-2' }));
  await assert.rejects(() => service.finishJourney('owner-1', 'foreign', finish), { code: 'journey/permission-denied' });
  assert.equal(state.writes.length, 0);
});

test('missing authentication, wrong account, and malformed IDs do not access Firestore', async () => {
  for (const user of [null, { uid: 'owner-2' }]) {
    const { service, state, auth } = setup();
    auth.currentUser = user;
    await assert.rejects(() => service.createJourney('owner-1', start));
    await assert.rejects(() => service.getActiveJourney('owner-1'));
    await assert.rejects(() => service.finishJourney('owner-1', 'trip', finish));
    assert.equal(state.reads.length + state.writes.length, 0);
  }
  const { service, state } = setup();
  for (const uid of [undefined, '', ' ']) {
    await assert.rejects(() => service.createJourney(uid, start));
    await assert.rejects(() => service.getActiveJourney(uid));
    await assert.rejects(() => service.finishJourney(uid, 'trip', finish));
  }
  for (const id of [undefined, '', ' ', 'other/trip']) {
    await assert.rejects(() => service.finishJourney('owner-1', id, finish));
  }
  assert.equal(state.reads.length + state.writes.length, 0);
});

test('offline and permission failures propagate without queued writes or cached resume', async () => {
  for (const code of ['unavailable', 'permission-denied']) {
    const { service, state, record } = setup();
    state.documents.set('trip', record());
    state.queryRows = [['cached', record()]];
    const failure = Object.assign(new Error('private SDK details'), { code });
    state.failure = failure;
    await assert.rejects(() => service.createJourney('owner-1', start), (error) => error === failure);
    await assert.rejects(() => service.getActiveJourney('owner-1'), (error) => error === failure);
    await assert.rejects(() => service.finishJourney('owner-1', 'trip', finish), (error) => error === failure);
    assert.equal(state.writes.length, 0);
    assert.ok(!service.getJourneyErrorMessage(failure).includes(failure.message));
  }
});

test('UID changes during reads or before transaction callbacks prevent disclosure and mutations', async () => {
  for (const operation of ['read', 'create', 'finish']) {
    const { service, state, auth, record } = setup();
    state.documents.set('trip', record());
    state.queryRows = [['trip', record()]];
    const changeAccount = async () => { auth.currentUser = { uid: 'owner-2' }; };
    state.beforeRead = changeAccount;
    if (operation === 'create') state.beforeTransaction = changeAccount;
    const action = operation === 'read' ? () => service.getActiveJourney('owner-1')
      : operation === 'create' ? () => service.createJourney('owner-1', start)
        : () => service.finishJourney('owner-1', 'trip', finish);
    await assert.rejects(action, { code: 'journey/session-changed' });
    assert.equal(state.writes.length, 0);
  }
});

test('UID changes after an acknowledged commit never return old-account journey data', async () => {
  for (const operation of ['create', 'finish']) {
    const { service, state, auth, record } = setup();
    state.documents.set('trip', record());
    state.afterTransaction = async () => { auth.currentUser = null; };
    const action = operation === 'create' ? () => service.createJourney('owner-1', start)
      : () => service.finishJourney('owner-1', 'trip', finish);
    await assert.rejects(action, { code: 'journey/auth-required' });
    assert.equal(state.writes.length, 1);
    assert.ok(state.writes.every((write) => !write.value.ownerUid || write.value.ownerUid === 'owner-1'));
  }
});

test('error mapping is safe and useful for SDK, session, data, and unknown failures', () => {
  const { service } = setup();
  for (const code of [
    'journey/auth-required', 'journey/session-changed', 'firestore/permission-denied',
    'journey/invalid-journey', 'journey/invalid-data', 'journey/already-ended',
    'not-found', 'deadline-exceeded', 'network-request-failed', 'unknown',
  ]) {
    const message = service.getJourneyErrorMessage({ code, message: 'secret/path?key=private' });
    assert.ok(message.length > 15);
    assert.ok(!message.includes('secret'));
  }
});
