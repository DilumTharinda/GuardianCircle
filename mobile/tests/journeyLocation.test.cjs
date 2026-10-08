const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function setup(overrides = {}) {
  const state = { now: 100000, timers: new Map(), nextTimer: 0, watches: [], removed: 0, requests: 0 };
  const location = {
    __esModule: true,
    Accuracy: { High: 4 },
    getForegroundPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => {
      state.requests += 1;
      return { status: 'granted', canAskAgain: true };
    },
    hasServicesEnabledAsync: async () => true,
    watchPositionAsync: async (options, next, error) => {
      state.watches.push({ options, next, error });
      return { remove: () => { state.removed += 1; } };
    },
    ...overrides,
  };
  const filename = path.resolve(__dirname, '../src/services/locationService.js');
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => {
      assert.equal(name, 'expo-location');
      return location;
    },
    Date: class extends Date { static now() { return state.now; } },
    setTimeout: (callback, delay) => {
      const id = ++state.nextTimer;
      state.timers.set(id, { callback, at: state.now + delay });
      return id;
    },
    clearTimeout: (id) => state.timers.delete(id),
  }, { filename });
  const advance = async (milliseconds) => {
    const end = state.now + milliseconds;
    while (true) {
      const next = [...state.timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      state.now = next[1].at;
      state.timers.delete(next[0]);
      next[1].callback();
      await flush();
    }
    state.now = end;
    await flush();
  };
  const received = [];
  const errors = [];
  const start = () => module.exports.watchForegroundJourneyLocation(
    (fix) => received.push(plain(fix)), (error) => errors.push(plain(error)),
  );
  const fix = (extra = {}) => ({
    coords: { latitude: 7.1, longitude: 80.1, accuracy: 12 }, timestamp: state.now, ...extra,
  });
  return { state, location, advance, received, errors, start, fix };
}

test('foreground watch emits normalized real fixes and cleanup removes it only once', async () => {
  const { state, start, fix, received, errors } = setup();
  const cleanup = start();
  assert.equal(typeof cleanup, 'function');
  await flush();
  assert.deepEqual(plain(state.watches[0].options), { accuracy: 4, timeInterval: 3000, distanceInterval: 0 });
  state.watches[0].next(fix());
  assert.deepEqual(received, [{ status: 'success', latitude: 7.1, longitude: 80.1, accuracy: 12, timestamp: 100000 }]);
  state.now += 1;
  state.watches[0].next(fix({ coords: { latitude: 7.2, longitude: 80.2, accuracy: -1 } }));
  assert.equal(received.at(-1).accuracy, null);
  cleanup();
  cleanup();
  state.watches[0].next(fix());
  state.watches[0].error('late native error');
  await flush();
  assert.equal(received.length, 2);
  assert.equal(errors.length, 0);
  assert.equal(state.removed, 1);
  assert.equal(state.timers.size, 0);
});

test('permission is requested when allowed and denial has useful settings guidance', async () => {
  const allowed = setup({ getForegroundPermissionsAsync: async () => ({ status: 'undetermined', canAskAgain: true }) });
  const cleanup = allowed.start();
  await flush();
  assert.equal(allowed.state.requests, 1);
  assert.equal(allowed.state.watches.length, 1);
  cleanup();

  for (const canAskAgain of [false, true]) {
    const denied = setup({
      getForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain }),
      requestForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain }),
    });
    denied.start();
    await flush();
    assert.equal(denied.errors[0].status, 'permission-denied');
    assert.equal(denied.errors[0].canAskAgain, canAskAgain);
    assert.equal(denied.state.watches.length, 0);
    assert.equal(denied.state.timers.size, 0);
    if (!canAskAgain) assert.match(denied.errors[0].message, /settings/);
  }
});

test('disabled location services prevent watcher creation', async () => {
  const { start, errors, state } = setup({ hasServicesEnabledAsync: async () => false });
  start();
  await flush();
  assert.equal(errors[0].status, 'services-disabled');
  assert.equal(state.watches.length, 0);
  assert.equal(state.timers.size, 0);
});

test('invalid, old, future, mocked, and duplicate fixes cannot update or keep tracking alive', async () => {
  const { start, errors, state, received, fix, advance } = setup();
  start();
  await flush();
  const send = state.watches[0].next;
  for (const position of [
    undefined, {}, fix({ coords: { latitude: 100, longitude: 80 } }),
    fix({ coords: { latitude: 7, longitude: -181 } }),
    fix({ coords: { latitude: NaN, longitude: 80 } }),
    fix({ timestamp: NaN }), fix({ timestamp: state.now - 15001 }),
    fix({ timestamp: state.now + 5001 }), fix({ mocked: true }),
  ]) send(position);
  assert.equal(received.length, 0);
  const first = fix();
  send(first);
  await advance(20000);
  send(first);
  send(fix({ timestamp: first.timestamp - 1 }));
  assert.equal(received.length, 1);
  await advance(10000);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /30 seconds/);
  assert.equal(state.removed, 1);
  assert.equal(state.timers.size, 0);
});

test('each new valid GPS fix renews the watchdog', async () => {
  const { start, errors, state, fix, advance } = setup();
  const cleanup = start();
  await flush();
  await advance(25000);
  state.watches[0].next(fix());
  await advance(25000);
  assert.equal(errors.length, 0);
  state.watches[0].next(fix());
  await advance(29999);
  assert.equal(errors.length, 0);
  cleanup();
  assert.equal(state.timers.size, 0);
});

test('pending permission setup times out and cannot start a late watcher', async () => {
  const permission = deferred();
  const { start, state, errors, advance } = setup({ getForegroundPermissionsAsync: () => permission.promise });
  start();
  await advance(30000);
  assert.equal(errors[0].status, 'location-error');
  permission.resolve({ status: 'granted' });
  await flush();
  assert.equal(state.watches.length, 0);
  assert.equal(state.timers.size, 0);
});

test('cleanup during permission or services checks prevents native watcher creation', async () => {
  for (const method of ['getForegroundPermissionsAsync', 'hasServicesEnabledAsync']) {
    const pending = deferred();
    const { start, state, errors } = setup({ [method]: () => pending.promise });
    const cleanup = start();
    await flush();
    cleanup();
    pending.resolve(method === 'getForegroundPermissionsAsync' ? { status: 'granted' } : true);
    await flush();
    assert.equal(state.watches.length, 0);
    assert.equal(state.timers.size, 0);
    assert.equal(errors.length, 0);
  }
});

test('a late native subscription is removed after cancellation or setup timeout', async () => {
  for (const terminate of ['cleanup', 'timeout']) {
    const pending = deferred();
    let callbacks;
    const { start, state, errors, received, advance, fix } = setup({
      watchPositionAsync: (_options, next, error) => { callbacks = { next, error }; return pending.promise; },
    });
    const cleanup = start();
    await flush();
    if (terminate === 'cleanup') cleanup();
    else await advance(30000);
    pending.resolve({ remove: () => { state.removed += 1; } });
    await flush();
    callbacks.next(fix());
    callbacks.error('late error');
    cleanup();
    await flush();
    assert.equal(state.removed, 1);
    assert.equal(received.length, 0);
    assert.equal(errors.length, terminate === 'timeout' ? 1 : 0);
    assert.equal(state.timers.size, 0);
  }
});

test('native watch errors stop updates, classify disabled services, and report once', async () => {
  const { start, state, location, errors, received, fix } = setup();
  start();
  await flush();
  location.hasServicesEnabledAsync = async () => false;
  state.watches[0].error('native internal details');
  state.watches[0].next(fix());
  state.watches[0].error('duplicate');
  await flush();
  assert.deepEqual(errors.map((error) => error.status), ['services-disabled']);
  assert.equal(received.length, 0);
  assert.equal(state.removed, 1);
  assert.equal(state.timers.size, 0);
});

test('native setup rejection reports a safe error and ignores later cancellation', async () => {
  const { start, errors, state } = setup({ watchPositionAsync: async () => { throw new Error('native internals'); } });
  const cleanup = start();
  await flush();
  assert.equal(errors[0].status, 'location-error');
  assert.ok(!errors[0].message.includes('native internals'));
  cleanup();
  assert.equal(state.timers.size, 0);
});

test('error classification is bounded and cleanup suppresses a pending error', async () => {
  for (const cancel of [false, true]) {
    const { start, state, location, errors, advance } = setup();
    const cleanup = start();
    await flush();
    const services = deferred();
    location.hasServicesEnabledAsync = () => services.promise;
    state.watches[0].error('failure');
    await flush();
    if (cancel) cleanup();
    await advance(1500);
    assert.equal(errors.length, cancel ? 0 : 1);
    services.resolve(false);
    await flush();
    assert.equal(errors.length, cancel ? 0 : 1);
    assert.equal(state.removed, 1);
    assert.equal(state.timers.size, 0);
  }
});
