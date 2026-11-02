const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function loadSosService({ legacyRows = [], trustedRecipientIds = [] } = {}) {
  const state = { alerts: [], storage: new Map(), storageReads: [], helperUids: [], legacyQuery: null };
  const auth = { currentUser: { uid: 'owner-1', email: 'owner@example.test', displayName: 'Account Owner' } };
  const asyncStorage = {
    getItem: async (key) => {
      state.storageReads.push(key);
      return state.storage.get(key) ?? null;
    },
    setItem: async (key, value) => state.storage.set(key, value),
    removeItem: async (key) => state.storage.delete(key),
  };
  const firestore = {
    collection: (_db, name) => ({ name }),
    query: (collection, ...constraints) => ({ ...collection, constraints }),
    where: (field, operator, value) => ({ field, operator, value }),
    getDocs: async (query) => {
      state.legacyQuery = query;
      return { forEach: (callback) => legacyRows.forEach((row) => callback({ data: () => row })) };
    },
    addDoc: async (collection, payload) => {
      state.alerts.push({ collection: collection.name, payload });
      return { id: 'alert-1' };
    },
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  };
  const filename = path.resolve(__dirname, '../src/services/sosService.js');
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  const stubRequire = (name) => {
    if (name === 'expo-haptics') return {
      notificationAsync: async () => {}, impactAsync: async () => {},
      NotificationFeedbackType: { Error: 'error' }, ImpactFeedbackStyle: { Heavy: 'heavy' },
    };
    if (name === 'firebase/firestore') return firestore;
    if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
    if (name === './firebase') return { auth, db: {} };
    if (name === './locationService') return {
      getCurrentCoordinates: async () => ({ lat: 1, lng: 2, accuracy: 3, address: 'Test location' }),
    };
    if (name === '../constants/roles') return { isChild: () => false };
    if (name === './trustedCircleService') return {
      getTrustedCircleSOSRecipientIds: async (uid) => {
        state.helperUids.push(uid);
        return trustedRecipientIds;
      },
    };
    throw new Error(`Unexpected SOS dependency: ${name}`);
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: stubRequire,
    console: { log: () => {}, warn: () => {} },
  }, { filename });
  return { service: module.exports, state };
}

test('SOS merges verified Trusted Circle UIDs with legacy linked recipients without exposing contact data', async () => {
  const { service, state } = loadSosService({
    legacyRows: [
      { targetUserId: 'legacy-parent-1', type: 'parent' },
      { targetUserId: 'verified-user-1', type: 'guardian' },
    ],
    trustedRecipientIds: ['verified-user-1', 'trusted-user-2'],
  });

  await service.triggerSOS('in_app');

  const payload = state.alerts[0].payload;
  assert.deepEqual(JSON.parse(JSON.stringify(payload.recipientIds)), [
    'legacy-parent-1', 'verified-user-1', 'trusted-user-2',
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.linkedParents)), ['legacy-parent-1', 'verified-user-1']);
  assert.deepEqual(state.helperUids, ['owner-1']);
  assert.equal(state.legacyQuery.name, 'LinkedEntities');
  assert.ok(state.legacyQuery.constraints.some((item) => item.field === 'userId'
    && item.operator === '==' && item.value === 'owner-1'));
  assert.equal(state.storageReads.includes('@guardiancircle_trusted_contacts'), false);
  assert.equal(payload.recipientIds.includes('contact-record-id'), false);
  assert.equal(payload.recipientIds.includes('+94771234567'), false);
});

test('SOS does not invent recipients when no verified or legacy recipient exists', async () => {
  const { service, state } = loadSosService();
  await service.triggerSOS('in_app');
  assert.deepEqual(JSON.parse(JSON.stringify(state.alerts[0].payload.recipientIds)), []);
});
