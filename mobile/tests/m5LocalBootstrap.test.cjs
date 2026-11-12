const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
function load({ local = true, development = true, host = '192.168.1.10', platform = 'android' } = {}) {
  const calls = []; const auth = {}; const db = {};
  const code = babel.transformSync(fs.readFileSync(path.resolve(__dirname, '../src/services/firebase.js'), 'utf8'), {
    babelrc: false, configFile: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, __DEV__: development,
    process: { env: { EXPO_PUBLIC_USE_FIREBASE_EMULATORS: String(local), EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: host } },
    require: name => {
      if (name === 'firebase/app') return { getApps: () => [], initializeApp: config => { calls.push(['config', config]); return {}; } };
      if (name === 'firebase/auth') return { initializeAuth: () => auth, getReactNativePersistence: () => 'native', browserLocalPersistence: 'web', connectAuthEmulator: (_, url) => calls.push(['auth', url]) };
      if (name === 'firebase/firestore') return { getFirestore: () => db, connectFirestoreEmulator: (_, address, port) => calls.push(['firestore', address, port]) };
      if (name === 'firebase/storage') return { getStorage: () => ({}) };
      if (name === 'react-native') return { Platform: { OS: platform } };
      if (name.includes('async-storage')) return {};
      throw Error(name);
    },
  });
  return calls;
}
test('local development uses a demo project and explicit Auth/Firestore hosts', () => {
  const calls = load();
  assert.equal(calls[0][1].projectId, 'demo-guardiancircle-m5');
  assert.equal(calls[1][1], 'http://192.168.1.10:9099');
  assert.equal(calls[2][1], '192.168.1.10'); assert.equal(calls[2][2], 8080);
});
test('local emulators are rejected in release builds', () => { assert.throws(() => load({ development: false }), /only in development/); });
test('invalid or absent emulator hosts fail before initializing Firebase', () => {
  for (const host of ['', 'http://localhost', 'localhost:9099', 'bad host']) assert.throws(() => load({ host }), /computer hostname/);
});
test('regular configuration does not connect to local emulators', () => {
  assert.equal(load({ local: false }).filter(call => ['auth', 'firestore'].includes(call[0])).length, 0);
});
test('Maps configuration remains required outside explicit local test mode', () => {
  const configure = require('../app.config.js');
  const previousLocal = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS;
  const previousKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  try {
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY; process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS = 'false';
    assert.throws(() => configure({ config: {} }), /must be set/);
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS = 'true';
    assert.deepEqual(configure({ config: { plugins: ['expo-font'] } }).plugins, ['expo-font']);
  } finally {
    if (previousLocal === undefined) delete process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS; else process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS = previousLocal;
    if (previousKey === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY; else process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = previousKey;
  }
});
