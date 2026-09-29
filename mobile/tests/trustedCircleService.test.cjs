const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const validForm = {
  targetName: '  Nimal Perera  ',
  targetPhone: '+94 (77) 123-4567',
  relationship: '  Friend  ',
};
const contact = (overrides = {}) => ({
  ownerUid: 'owner-1',
  type: 'trusted_contact',
  targetName: 'Nimal Perera',
  targetPhone: '+94771234567',
  relationship: 'Friend',
  status: 'active',
  ...overrides,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

// Load only the service and its local helpers, with Firebase completely stubbed.
// No Firebase initialization, environment configuration, or network is involved.
function setup() {
  const auth = { currentUser: { uid: 'owner-1' } };
  const state = {
    documents: new Map(), reads: [], writes: [], snapshots: [], authListeners: [],
    queryRows: [], failure: null, beforeRead: null, beforeTransaction: null,
  };
  const snapshot = (id, data) => ({ id, exists: () => data !== undefined, data: () => data });
  const querySnapshot = () => {
    const docs = state.queryRows.map(([id, data]) => snapshot(id, data));
    return { docs, forEach: (fn) => docs.forEach(fn) };
  };
  const checkRead = async () => {
    if (state.beforeRead) await state.beforeRead();
    if (state.failure) throw state.failure;
  };
  const firestore = {
    collection: (_db, name) => ({ collection: name }),
    doc: (parent, name, id) => name === undefined
      ? { ...parent, id: 'created-contact' }
      : { collection: name, id },
    where: (field, operator, value) => ({ field, operator, value }),
    query: (collection, ...constraints) => ({ ...collection, constraints }),
    serverTimestamp: () => ({ serverTimestamp: true }),
    getDocs: async (query) => {
      state.reads.push(query);
      await checkRead();
      return querySnapshot();
    },
    onSnapshot: (query, next, error) => {
      const listener = { query, next, error, unsubscribed: false };
      state.snapshots.push(listener);
      return () => { listener.unsubscribed = true; };
    },
    runTransaction: async (_db, run) => {
      if (state.beforeTransaction) await state.beforeTransaction();
      if (state.failure) throw state.failure;
      const pendingWrites = [];
      const result = await run({
        get: async (ref) => {
          state.reads.push(ref);
          await checkRead();
          return snapshot(ref.id, state.documents.get(ref.id));
        },
        set: (ref, value) => pendingWrites.push({ operation: 'set', ...ref, value }),
        update: (ref, value) => pendingWrites.push({ operation: 'update', ...ref, value }),
        delete: (ref) => pendingWrites.push({ operation: 'delete', ...ref }),
      });
      state.writes.push(...pendingWrites);
      return result;
    },
  };
  const authApi = {
    onAuthStateChanged: (_auth, next) => {
      const listener = { next, unsubscribed: false };
      state.authListeners.push(listener);
      return () => { listener.unsubscribed = true; };
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
      if (name === './firebase') return { auth, db: {} };
      if (name.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), name);
        return load(path.extname(resolved) ? resolved : `${resolved}.js`);
      }
      throw new Error(`Unexpected service dependency: ${name}`);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: stubRequire }, { filename });
    return module.exports;
  }
  return {
    service: load(path.resolve(__dirname, '../src/services/trustedCircleService.js')),
    auth, state, querySnapshot,
  };
}

test('validation trims fields, normalizes phone formatting, and allows optional relationship', () => {
  const { service } = setup();
  assert.deepEqual(plain(service.validateTrustedContact(validForm)), {
    values: { targetName: 'Nimal Perera', targetPhone: '+94771234567', relationship: 'Friend' },
    errors: {},
  });
  assert.deepEqual(plain(service.validateTrustedContact({
    targetName: 'Nimal', targetPhone: '077.123.4567',
  }).errors), {});
});

test('validation rejects missing fields, malformed phones, and field length violations', () => {
  const { service } = setup();
  const missing = service.validateTrustedContact({}).errors;
  assert.ok(missing.targetName);
  assert.ok(missing.targetPhone);
  for (const targetPhone of ['123456', '1234567890123456', '077abc1234', '++94771234567', '077+1234567']) {
    assert.ok(service.validateTrustedContact({ ...validForm, targetPhone }).errors.targetPhone, targetPhone);
  }
  for (const targetPhone of ['1234567', '+123456789012345']) {
    assert.equal(service.validateTrustedContact({ ...validForm, targetPhone }).errors.targetPhone, undefined);
  }
  assert.ok(service.validateTrustedContact({ ...validForm, targetName: 'n'.repeat(81) }).errors.targetName);
  assert.ok(service.validateTrustedContact({ ...validForm, relationship: 'r'.repeat(41) }).errors.relationship);
});

test('reads use the canonical UID query and exclude other owners, types, and revoked contacts', async () => {
  const { service, state } = setup();
  state.queryRows = [
    ['z', contact({ targetName: 'Zara' })],
    ['a', contact({ targetName: 'Amal', status: 'pending', id: 'spoofed' })],
    ['other-owner', contact({ ownerUid: 'owner-2' })],
    ['child', contact({ type: 'child' })],
    ['revoked', contact({ status: 'revoked' })],
  ];
  const contacts = await service.getTrustedContacts('owner-1');
  assert.deepEqual(Array.from(contacts, (item) => item.id), ['a', 'z']);
  assert.equal(state.reads[0].collection, 'linkedEntities');
  assert.ok(state.reads[0].constraints.some((item) => (
    item.field === 'ownerUid' && item.operator === '==' && item.value === 'owner-1'
  )));
});

test('add persists a normalized owned contact and ignores injected identity/linkage fields', async () => {
  const { service, state } = setup();
  const id = await service.addTrustedContact('owner-1', {
    ...validForm, ownerUid: 'owner-2', type: 'child', targetUid: 'injected', status: 'revoked',
  });
  assert.equal(id, 'created-contact');
  assert.equal(state.writes.length, 1);
  const write = state.writes[0];
  assert.equal(write.operation, 'set');
  assert.equal(write.collection, 'linkedEntities');
  assert.equal(write.value.ownerUid, 'owner-1');
  assert.equal(write.value.type, 'trusted_contact');
  assert.equal(write.value.targetUid, null);
  assert.equal(write.value.status, 'active');
  assert.equal(write.value.targetName, 'Nimal Perera');
  assert.equal(write.value.targetPhone, '+94771234567');
  assert.ok(write.value.linkedAt);
  assert.ok(write.value.updatedAt);
});

test('add rejects an offline transaction without persisting a contact', async () => {
  const { service, state } = setup();
  state.failure = Object.assign(new Error('offline'), { code: 'unavailable' });
  await assert.rejects(() => service.addTrustedContact('owner-1', validForm), (error) => error === state.failure);
  assert.equal(state.reads.length, 0);
  assert.equal(state.writes.length, 0);
});

test('update changes only editable fields and preserves linkage, status, and permissions', async () => {
  const { service, state } = setup();
  state.documents.set('contact-1', contact({
    targetUid: 'linked-user', status: 'pending', permissions: { receiveSOS: false },
  }));
  await service.updateTrustedContact('owner-1', 'contact-1', {
    ...validForm, ownerUid: 'owner-2', targetUid: 'injected',
    permissions: { receiveSOS: true }, status: 'active',
  });
  assert.equal(state.writes.length, 1);
  const write = state.writes[0];
  assert.equal(write.operation, 'update');
  assert.equal(write.collection, 'linkedEntities');
  assert.equal(write.id, 'contact-1');
  assert.deepEqual(Object.keys(write.value).sort(), ['relationship', 'targetName', 'targetPhone', 'updatedAt']);
  assert.equal(write.value.targetName, 'Nimal Perera');
});

test('delete removes only the selected owned trusted contact', async () => {
  const { service, state } = setup();
  state.documents.set('contact-1', contact());
  await service.deleteTrustedContact('owner-1', 'contact-1');
  assert.deepEqual(plain(state.writes), [{ operation: 'delete', collection: 'linkedEntities', id: 'contact-1' }]);
});

test('all read/write entry points reject missing or mismatched authentication before accessing Firestore', async () => {
  for (const user of [null, { uid: 'owner-2' }]) {
    const { service, auth, state } = setup();
    auth.currentUser = user;
    await assert.rejects(() => service.getTrustedContacts('owner-1'));
    await assert.rejects(() => service.addTrustedContact('owner-1', validForm));
    await assert.rejects(() => service.updateTrustedContact('owner-1', 'contact-1', validForm));
    await assert.rejects(() => service.deleteTrustedContact('owner-1', 'contact-1'));
    const errors = [];
    const unsubscribe = service.subscribeTrustedContacts('owner-1', () => {}, (error) => errors.push(error));
    assert.equal(typeof unsubscribe, 'function');
    unsubscribe();
    assert.equal(errors.length, 1);
    assert.equal(state.reads.length + state.writes.length + state.snapshots.length, 0);
  }
});

test('invalid forms and missing, revoked, foreign-owned, or non-contact IDs never mutate documents', async () => {
  const { service, state } = setup();
  await assert.rejects(() => service.addTrustedContact('owner-1', {}));
  state.documents.set('contact-1', contact());
  await assert.rejects(() => service.updateTrustedContact('owner-1', 'contact-1', {}));
  for (const record of [undefined, contact({ ownerUid: 'owner-2' }), contact({ type: 'child' }), contact({ status: 'revoked' })]) {
    state.documents.set('contact-1', record);
    await assert.rejects(() => service.updateTrustedContact('owner-1', 'contact-1', validForm));
    await assert.rejects(() => service.deleteTrustedContact('owner-1', 'contact-1'));
  }
  assert.equal(state.writes.length, 0);
});

test('missing UID and malformed document IDs are rejected before Firestore access', async () => {
  const { service, state } = setup();
  for (const uid of [undefined, '', '   ']) {
    await assert.rejects(() => service.getTrustedContacts(uid));
    await assert.rejects(() => service.addTrustedContact(uid, validForm));
  }
  for (const id of [undefined, '', '   ', 'other/contact']) {
    await assert.rejects(() => service.updateTrustedContact('owner-1', id, validForm));
    await assert.rejects(() => service.deleteTrustedContact('owner-1', id));
  }
  assert.equal(state.reads.length + state.writes.length, 0);
});

test('Firestore read/write failures propagate and receive useful safe UI messages', async () => {
  const { service, state } = setup();
  const failure = Object.assign(new Error('internal details should not reach UI'), { code: 'permission-denied' });
  state.failure = failure;
  state.documents.set('contact-1', contact());
  await assert.rejects(() => service.getTrustedContacts('owner-1'), (error) => error === failure);
  await assert.rejects(() => service.addTrustedContact('owner-1', validForm), (error) => error === failure);
  await assert.rejects(() => service.updateTrustedContact('owner-1', 'contact-1', validForm), (error) => error === failure);
  await assert.rejects(() => service.deleteTrustedContact('owner-1', 'contact-1'), (error) => error === failure);
  assert.equal(typeof service.getTrustedCircleErrorMessage(failure), 'string');
  assert.ok(service.getTrustedCircleErrorMessage(failure).length > 0);
  assert.ok(!service.getTrustedCircleErrorMessage(failure).includes(failure.message));
  assert.ok(service.getTrustedCircleErrorMessage({ code: 'unavailable' }).length > 0);
});

test('a session change during asynchronous work prevents returned data and pending mutations', async () => {
  for (const operation of ['get', 'add', 'update', 'delete']) {
    const { service, auth, state } = setup();
    state.documents.set('contact-1', contact());
    state.queryRows = [['contact-1', contact()]];
    state.beforeRead = async () => { auth.currentUser = { uid: 'owner-2' }; };
    if (operation === 'add') state.beforeTransaction = state.beforeRead;
    const action = operation === 'get' ? () => service.getTrustedContacts('owner-1')
      : operation === 'add' ? () => service.addTrustedContact('owner-1', validForm)
        : operation === 'update' ? () => service.updateTrustedContact('owner-1', 'contact-1', validForm)
          : () => service.deleteTrustedContact('owner-1', 'contact-1');
    await assert.rejects(action, (error) => error.code === 'trusted-circle/session-changed');
    assert.equal(state.writes.length, 0);
  }
});

test('live subscriptions emit contact lists and stop callbacks after unsubscribe', () => {
  const { service, state, querySnapshot } = setup();
  const received = [];
  const errors = [];
  const unsubscribe = service.subscribeTrustedContacts('owner-1', (rows) => received.push(plain(rows)), (error) => errors.push(error));
  state.queryRows = [['z', contact({ targetName: 'Zara' })], ['a', contact({ targetName: 'Amal' })]];
  state.snapshots[0].next(querySnapshot());
  assert.deepEqual(received.at(-1).map((row) => row.id), ['a', 'z']);
  unsubscribe();
  const count = received.length;
  state.snapshots[0].next(querySnapshot());
  state.snapshots[0].error(new Error('late callback'));
  assert.equal(received.length, count);
  assert.equal(errors.length, 0);
  assert.equal(state.snapshots[0].unsubscribed, true);
  assert.equal(state.authListeners[0].unsubscribed, true);
});

test('live subscriptions clear private data and detach listeners when the authenticated user changes', () => {
  const { service, auth, state, querySnapshot } = setup();
  const received = [];
  const errors = [];
  service.subscribeTrustedContacts('owner-1', (rows) => received.push(plain(rows)), (error) => errors.push(error));
  state.queryRows = [['contact-1', contact()]];
  state.snapshots[0].next(querySnapshot());
  auth.currentUser = { uid: 'owner-2' };
  state.authListeners[0].next(auth.currentUser);
  assert.deepEqual(received.at(-1), []);
  assert.equal(errors.at(-1).code, 'trusted-circle/session-changed');
  assert.equal(state.snapshots[0].unsubscribed, true);
  assert.equal(state.authListeners[0].unsubscribed, true);
  const count = received.length;
  state.snapshots[0].next(querySnapshot());
  assert.equal(received.length, count);
});

test('live subscriptions forward Firestore errors', () => {
  const { service, state } = setup();
  const errors = [];
  const unsubscribe = service.subscribeTrustedContacts('owner-1', () => {}, (error) => errors.push(error));
  const failure = Object.assign(new Error('offline'), { code: 'unavailable' });
  state.snapshots[0].error(failure);
  assert.equal(errors[0], failure);
  unsubscribe();
});
