const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function loadModules() {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, babelrc: false, configFile: false,
      plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    });
    const localRequire = (name) => {
      if (!name.startsWith('.')) throw new Error(`Unexpected dependency: ${name}`);
      const resolved = path.resolve(path.dirname(filename), name);
      return load(path.extname(resolved) ? resolved : `${resolved}.js`);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire }, { filename });
    return module.exports;
  }
  return {
    controller: load(path.resolve(__dirname, '../src/services/journeyController.js')),
    math: load(path.resolve(__dirname, '../src/utils/journeyMath.js')),
  };
}

const { controller: controllerModule, math } = loadModules();

function setup(overrides = {}) {
  let time = 1_000_000;
  let pending = overrides.pending || null;
  const watches = [];
  const finishCalls = [];
  const createCalls = [];
  let finishFailure = overrides.finishFailure || null;
  let state;
  const active = overrides.active || null;
  const deps = {
    uid: 'owner-1',
    now: () => time,
    onChange: (next) => { state = next; },
    readPending: async () => pending,
    writePending: async (journey) => { pending = JSON.parse(JSON.stringify(journey)); },
    clearPending: async () => { pending = null; },
    getActiveJourney: async () => active,
    getSnapshot: async () => ({
      status: 'success', latitude: 10, longitude: 20, accuracy: 5, timestamp: time,
    }),
    createJourney: async (uid, input) => {
      createCalls.push({ uid, input });
      return {
        id: 'journey-1', ownerUid: uid, destination: input.destination,
        destinationName: input.destinationName, startLocation: input.startLocation,
        currentLocation: input.startLocation, status: 'active',
        startedAtMs: input.startedAtMs, endedAtMs: null,
      };
    },
    finishJourney: async (...args) => {
      finishCalls.push(args);
      if (finishFailure) throw finishFailure;
      return {};
    },
    watchLocation: (next, error) => {
      const watch = { next, error, removed: 0 };
      watches.push(watch);
      return () => { watch.removed += 1; };
    },
    errorMessage: (error) => error?.message || 'Safe journey error.',
    ...overrides.deps,
  };
  const instance = controllerModule.createJourneyController(deps);
  return {
    instance, watches, finishCalls, createCalls,
    state: () => state || instance.getState(),
    pending: () => pending,
    setTime: (value) => { time = value; },
    allowFinish: () => { finishFailure = null; },
  };
}

function activeJourney(overrides = {}) {
  return {
    id: 'journey-1', ownerUid: 'owner-1', destination: { latitude: 10, longitude: 20 },
    destinationName: 'Library', startLocation: { latitude: 9.99, longitude: 20, timestamp: 900_000 },
    currentLocation: { latitude: 9.99, longitude: 20, timestamp: 900_000 },
    status: 'active', startedAtMs: 900_000, endedAtMs: null, ...overrides,
  };
}

test('loads idle, starts with a real snapshot, and begins foreground watching', async () => {
  const run = setup();
  await run.instance.load();
  assert.equal(run.state().phase, 'idle');
  await run.instance.start({ latitude: 10.01, longitude: 20.01 }, ' Library ');
  assert.equal(run.state().phase, 'active');
  assert.equal(run.state().tracking, 'acquiring');
  assert.equal(run.createCalls[0].uid, 'owner-1');
  assert.equal(run.createCalls[0].input.destinationName, 'Library');
  assert.equal(run.watches.length, 1);
});

test('two accurate fresh fixes confirm arrival and stop the watcher', async () => {
  const run = setup();
  await run.instance.load();
  await run.instance.start({ latitude: 10, longitude: 20 }, 'Home');
  run.watches[0].next({ latitude: 10, longitude: 20, accuracy: 5, timestamp: 1_001_000 });
  run.watches[0].next({ latitude: 10, longitude: 20, accuracy: 5, timestamp: 1_004_000 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.state().phase, 'arrived');
  assert.equal(run.state().pendingSave, false);
  assert.equal(run.watches[0].removed, 1);
  assert.equal(run.finishCalls[0][2].status, 'arrived');
});

test('inaccurate, stale, and out-of-order fixes cannot trigger arrival', async () => {
  const run = setup();
  await run.instance.load();
  await run.instance.start({ latitude: 10, longitude: 20 }, 'Home');
  run.watches[0].next({ latitude: 10, longitude: 20, accuracy: 40, timestamp: 1_001_000 });
  run.watches[0].next({ latitude: 10, longitude: 20, accuracy: 5, timestamp: 900_000 });
  run.watches[0].next({ latitude: 10, longitude: 20, accuracy: 5, timestamp: 1_000_000 });
  assert.equal(run.state().phase, 'active');
  assert.equal(run.finishCalls.length, 0);
});

test('pause removes the watcher and resume starts a separate path segment', async () => {
  const run = setup();
  await run.instance.load();
  await run.instance.start({ latitude: 10.1, longitude: 20 }, 'Park');
  run.watches[0].next({ latitude: 10.01, longitude: 20, accuracy: 5, timestamp: 1_001_000 });
  run.instance.pause();
  assert.equal(run.watches[0].removed, 1);
  assert.equal(run.state().tracking, 'paused');
  run.instance.resume();
  assert.equal(run.watches.length, 2);
  run.watches[0].next({ latitude: 10.02, longitude: 20, accuracy: 5, timestamp: 1_002_000 });
  run.watches[1].next({ latitude: 10.03, longitude: 20, accuracy: 5, timestamp: 1_003_000 });
  assert.equal(run.state().pathSegments.length, 2);
  assert.equal(run.state().pathSegments[0].length, 1);
  assert.equal(run.state().pathSegments[1].length, 1);
});

test('failed final persistence remains retryable and blocks reset until saved', async () => {
  const run = setup({ finishFailure: new Error('Offline') });
  await run.instance.load();
  await run.instance.start({ latitude: 10.1, longitude: 20 }, 'Park');
  await run.instance.end('cancelled');
  assert.equal(run.state().phase, 'cancelled');
  assert.equal(run.state().pendingSave, true);
  assert.ok(run.pending());
  run.instance.reset();
  assert.equal(run.state().phase, 'cancelled');
  run.allowFinish();
  await run.instance.retrySave();
  assert.equal(run.state().pendingSave, false);
  assert.equal(run.pending(), null);
  run.instance.reset();
  assert.equal(run.state().phase, 'idle');
});

test('restores server active journeys paused and UID-scoped terminal saves retryable', async () => {
  const restored = setup({ active: activeJourney() });
  await restored.instance.load();
  assert.equal(restored.state().phase, 'active');
  assert.equal(restored.state().tracking, 'paused');
  assert.equal(restored.watches.length, 0);

  const terminal = activeJourney({ status: 'cancelled', endedAtMs: 990_000 });
  const pending = setup({ pending: terminal });
  await pending.instance.load();
  assert.equal(pending.state().phase, 'cancelled');
  assert.equal(pending.state().pendingSave, true);
});

test('dispose and session invalidation remove watchers and ignore late callbacks', async () => {
  const run = setup({ active: activeJourney() });
  await run.instance.load();
  run.instance.resume();
  run.instance.invalidateSession();
  assert.equal(run.watches[0].removed, 1);
  assert.ok(run.state().loadError);
  const before = run.state();
  run.watches[0].next({ latitude: 10, longitude: 20, accuracy: 5, timestamp: 1_001_000 });
  assert.equal(run.state(), before);
  run.instance.dispose();
});

test('dispose during a late journey create prevents stale UI and watcher setup', async () => {
  let resolveCreate;
  const created = new Promise((resolve) => { resolveCreate = resolve; });
  const run = setup({ deps: { createJourney: () => created } });
  await run.instance.load();
  const starting = run.instance.start({ latitude: 10.1, longitude: 20 }, 'Park');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.state().phase, 'starting');
  run.instance.dispose();
  resolveCreate(activeJourney({ destination: { latitude: 10.1, longitude: 20 } }));
  await starting;
  assert.equal(run.watches.length, 0);
  assert.equal(run.state().phase, 'starting');
});

test('journey math handles boundaries and rejects invalid arrival destinations', () => {
  assert.equal(math.distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  const acrossDateline = math.distanceMeters(
    { latitude: 0, longitude: 179.999 }, { latitude: 0, longitude: -179.999 },
  );
  assert.ok(acrossDateline > 200 && acrossDateline < 230);
  assert.equal(math.distanceMeters(null, { latitude: 0, longitude: 0 }), null);
  assert.equal(math.isArrivalFix(
    { latitude: 0, longitude: 0, accuracy: 5, timestamp: 1_000_000 }, null, 1_000_000,
  ), false);
  assert.equal(math.formatElapsed(3_661_999), '01:01:01');
});
