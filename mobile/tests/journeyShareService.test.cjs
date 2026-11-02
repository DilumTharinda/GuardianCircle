const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const plain = (value) => JSON.parse(JSON.stringify(value));

function setup(overrides = {}) {
  const auth = { currentUser: { uid: 'owner-1' } };
  const state = {
    now: 1700000005000,
    calls: [],
    result: { action: 'sharedAction', activityType: 'test.target' },
    failure: null,
  };
  const Share = {
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
    share: async (...args) => {
      state.calls.push(plain(args));
      if (state.failure) throw state.failure;
      return state.result;
    },
  };
  Object.assign(state, overrides.state);
  if (Object.prototype.hasOwnProperty.call(overrides, 'currentUser')) {
    auth.currentUser = overrides.currentUser;
  }

  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    });
    const localRequire = (name) => {
      if (name === 'react-native') return { Share };
      if (name === './firebase') return { auth };
      if (!name.startsWith('.')) throw new Error(`Unexpected dependency: ${name}`);
      const resolved = path.resolve(path.dirname(filename), name);
      return load(path.extname(resolved) ? resolved : `${resolved}.js`);
    };
    const NativeDate = Date;
    class TestDate extends NativeDate {
      static now() { return state.now; }
    }
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      require: localRequire,
      Date: TestDate,
    }, { filename });
    return module.exports;
  }

  const service = load(path.resolve(__dirname, '../src/services/journeyShareService.js'));
  return { service, auth, state, Share };
}

function input(overrides = {}) {
  const value = {
    uid: 'owner-1',
    phase: 'active',
    journey: {
      id: 'PRIVATE_JOURNEY_ID',
      ownerUid: 'owner-1',
      status: 'active',
      destination: { latitude: 6.927079, longitude: 79.861244 },
      destinationName: 'Safe Library',
      startLocation: { latitude: -45.12345, longitude: 12.54321 },
      path: [{ latitude: 55.55555, longitude: 44.44444, note: 'PRIVATE_PATH_HISTORY' }],
    },
    currentLocation: {
      latitude: 6.914321,
      longitude: 79.875678,
      timestamp: 1700000000000,
      accuracy: 8,
      internalToken: 'PRIVATE_GPS_METADATA',
    },
    elapsedMs: 3661000,
    distanceMeters: 1250.4,
    tracking: 'watching',
    selectedContacts: [{
      id: 'PRIVATE_CONTACT_ID',
      ownerUid: 'owner-1',
      type: 'trusted_contact',
      status: 'active',
      targetName: 'Alice Private',
      targetPhone: '+94770000000',
      targetUid: 'PRIVATE_TARGET_UID',
      permissions: { receiveJourney: true },
    }],
    sharedAtMs: 1700000005000,
    apiKey: 'PRIVATE_API_KEY',
    history: ['PRIVATE_LOCATION_HISTORY'],
    ...overrides,
  };
  return value;
}

test('builds a useful one-time active snapshot and omits private route and recipient data', () => {
  const { service } = setup();
  const request = input({
    journey: {
      ...input().journey,
      destinationName: '  Safe\nLibrary\tMain gate  ',
    },
  });
  const before = plain(request);
  const message = service.buildJourneyShareMessage(request);

  assert.match(message, /^GuardianCircle journey update/m);
  assert.match(message, /Status: Active journey/);
  assert.match(message, /Tracking: Foreground GPS active/);
  assert.match(message, /Destination: Safe Library Main gate/);
  assert.match(message, /Destination map: .*6\.92708.*79\.86124/);
  assert.match(message, /Elapsed: 01:01:01/);
  assert.match(message, /Distance to destination: 1\.25 km/);
  assert.match(message, /Latest recorded location .*6\.91432.*79\.87568/);
  assert.match(message, /one-time location snapshot, not a live tracking link/);
  assert.equal((message.match(/Status:/g) || []).length, 1);

  for (const privateValue of [
    'PRIVATE_JOURNEY_ID', 'owner-1', '-45.12345', '12.54321', '55.55555',
    '44.44444', 'PRIVATE_PATH_HISTORY', 'PRIVATE_GPS_METADATA', 'PRIVATE_CONTACT_ID',
    'Alice Private', '+94770000000', 'PRIVATE_TARGET_UID', 'PRIVATE_API_KEY',
    'PRIVATE_LOCATION_HISTORY',
  ]) {
    assert.ok(!message.includes(privateValue), `share text exposed ${privateValue}`);
  }
  assert.deepEqual(plain(request), before);
});

test('accepts multiple selected active owned contacts without adding their identities to the message', () => {
  const { service } = setup();
  const request = input({
    distanceMeters: 49.6,
    selectedContacts: [
      input().selectedContacts[0],
      {
        id: 'contact-2', ownerUid: 'owner-1', type: 'trusted_contact',
        status: 'active', targetName: 'Bob\nPrivate', targetPhone: '+94771111111',
      },
    ],
  });
  const message = service.buildJourneyShareMessage(request);
  assert.match(message, /Distance to destination: 50 m/);
  assert.ok(!message.includes('Alice Private'));
  assert.ok(!message.includes('Bob'));
  assert.ok(!message.includes('+9477'));
});

test('rejects inactive journeys and missing contact selections', () => {
  const { service } = setup();
  for (const request of [
    input({ phase: 'idle' }),
    input({ phase: 'arrived' }),
    input({ journey: { ...input().journey, status: 'cancelled' } }),
    input({ journey: null }),
  ]) {
    assert.throws(() => service.buildJourneyShareMessage(request), { code: 'journey-share/not-active' });
  }
  for (const selectedContacts of [undefined, [], null]) {
    assert.throws(() => service.buildJourneyShareMessage(input({ selectedContacts })), {
      code: 'journey-share/no-contacts',
    });
  }
});

test('rejects pending, foreign, malformed, and duplicate trusted contacts', () => {
  const { service } = setup();
  const good = input().selectedContacts[0];
  const invalidSelections = [
    [{ ...good, status: 'pending' }],
    [{ ...good, status: 'deleted' }],
    [{ ...good, ownerUid: 'owner-2' }],
    [{ ...good, type: 'emergency_contact' }],
    [{ ...good, id: '' }],
    [{ ...good, targetName: ' \n\t ' }],
    [{ ...good, targetName: 'x'.repeat(81) }],
    [good, { ...good }],
  ];
  for (const selectedContacts of invalidSelections) {
    assert.throws(() => service.buildJourneyShareMessage(input({ selectedContacts })), {
      code: 'journey-share/invalid-contact',
    });
  }
});

test('rejects wrong owners and malformed snapshot details', () => {
  const { service } = setup();
  for (const request of [
    input({ uid: '' }),
    input({ journey: { ...input().journey, ownerUid: 'owner-2' } }),
  ]) {
    assert.throws(() => service.buildJourneyShareMessage(request), { code: 'journey-share/session-changed' });
  }

  const invalid = [
    input({ journey: { ...input().journey, destinationName: ' ' } }),
    input({ journey: { ...input().journey, destinationName: 'x'.repeat(121) } }),
    input({ journey: { ...input().journey, destination: { latitude: 91, longitude: 10 } } }),
    input({ currentLocation: { ...input().currentLocation, longitude: -181 } }),
    input({ currentLocation: { ...input().currentLocation, timestamp: NaN } }),
    input({ currentLocation: { ...input().currentLocation, timestamp: 1700000011000 } }),
    input({ sharedAtMs: 0.5 }),
    input({ sharedAtMs: 1700000005000.5 }),
    input({ elapsedMs: -1 }),
    input({ elapsedMs: Infinity }),
    input({ distanceMeters: -1 }),
    input({ distanceMeters: NaN }),
    input({ tracking: 'background' }),
  ];
  for (const request of invalid) {
    assert.throws(() => service.buildJourneyShareMessage(request), {
      code: 'journey-share/invalid-journey',
    });
  }
});

test('shares the exact built snapshot once and supplies a default capture time without mutation', async () => {
  const { service, state } = setup();
  const request = input({ sharedAtMs: undefined });
  const before = plain(request);
  const result = await service.shareActiveJourney(request);

  assert.deepEqual(plain(result), { status: 'shared' });
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0][0].title, 'GuardianCircle journey update');
  assert.equal(state.calls[0][0].message, service.buildJourneyShareMessage({
    ...request,
    sharedAtMs: state.now,
  }));
  assert.deepEqual(state.calls[0][1], {
    dialogTitle: 'Share journey update',
    subject: 'GuardianCircle journey update',
  });
  assert.deepEqual(plain(request), before);
});

test('maps a dismissed share sheet to cancellation without reporting success', async () => {
  const { service, state } = setup();
  state.result = { action: 'dismissedAction' };
  assert.deepEqual(plain(await service.shareActiveJourney(input())), { status: 'cancelled' });
  assert.equal(state.calls.length, 1);
});

test('rejects unknown share results and native failures with bounded platform errors', async () => {
  for (const mode of ['unknown-result', 'native-failure']) {
    const { service, state } = setup();
    if (mode === 'unknown-result') state.result = { action: 'unexpected', privateValue: 'SECRET_RESULT' };
    else state.failure = Object.assign(new Error('SECRET_NATIVE_PATH?key=private'), { code: 'native/private' });
    await assert.rejects(() => service.shareActiveJourney(input()), (error) => {
      assert.equal(error.code, 'journey-share/platform-failed');
      assert.ok(!error.message.includes('SECRET'));
      return true;
    });
    assert.equal(state.calls.length, 1);
  }
});

test('requires the current authenticated owner before exposing a location to the share sheet', async () => {
  for (const currentUser of [null, { uid: 'owner-2' }]) {
    const { service, state } = setup({ currentUser });
    await assert.rejects(() => service.shareActiveJourney(input()), (error) => {
      assert.ok(['journey-share/auth-required', 'journey-share/session-changed'].includes(error.code));
      return true;
    });
    assert.equal(state.calls.length, 0);
  }
});

test('rechecks the authenticated owner immediately before invoking the native share sheet', async () => {
  const { service, auth, state } = setup();
  let reads = 0;
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    get() {
      reads += 1;
      return reads <= 2 ? { uid: 'owner-1' } : { uid: 'owner-2' };
    },
  });
  await assert.rejects(() => service.shareActiveJourney(input()), {
    code: 'journey-share/session-changed',
  });
  assert.equal(state.calls.length, 0);
});

test('maps all validation, session, platform, and unknown errors without leaking details', () => {
  const { service } = setup();
  for (const code of [
    'journey-share/not-active', 'journey-share/no-contacts', 'journey-share/invalid-contact',
    'journey-share/invalid-journey', 'journey-share/auth-required',
    'journey-share/session-changed', 'journey-share/platform-failed', 'unknown',
  ]) {
    const message = service.getJourneyShareErrorMessage({
      code,
      message: 'SECRET_DOCUMENT_PATH?apiKey=private',
    });
    assert.ok(message.length > 20);
    assert.ok(!message.includes('SECRET'));
    assert.ok(!message.includes('apiKey'));
  }
});
