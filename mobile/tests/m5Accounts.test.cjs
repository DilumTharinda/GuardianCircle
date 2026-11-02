const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
function setup(role = 'parent_guardian', uid = 'parent') {
  const records = new Map(); const writes = [];
  records.set(`users/${uid}`, { role, displayName: uid });
  const auth = { currentUser: { uid, emailVerified: true } };
  const snapshot = ref => ({ exists: () => records.has(ref.id), data: () => records.get(ref.id) });
  const firestore = {
    doc: (_, ...parts) => ({ id: parts.join('/') }), collection: (_, id) => ({ id }),
    getDoc: async ref => snapshot(ref), serverTimestamp: () => 'server-time',
    query: (...args) => args, where: (...args) => args,
    getDocs: async () => ({ docs: [] }),
    runTransaction: async (_, callback) => callback({ get: async ref => snapshot(ref),
      set: (ref, value) => { writes.push(value); records.set(ref.id, value); },
      update: (ref, value) => { writes.push(value); records.set(ref.id, { ...records.get(ref.id), ...value }); } }),
  };
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync('src/services/parentChildAccounts.js','utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === './firebase') return { auth, db: {} };
    if (name === 'firebase/firestore') return firestore;
    if (name === '../constants/roles') return { ROLES: { PARENT_GUARDIAN: 'parent_guardian', CHILD_DEPENDENT: 'child_dependent' } };
    throw Error(name);
  } });
  return { api: module.exports, records, writes, auth };
}
test('request derives parent identity from authentication and starts pending', async () => {
  const app = setup(); await app.api.sendLinkRequest({ uid: 'forged' }, { id: 'child' });
  assert.equal(app.writes[0].ownerUid, 'parent'); assert.equal(app.writes[0].status, 'pending');
  await assert.rejects(app.api.sendLinkRequest(null, { id: 'child' }), /already exists/);
});
test('child cannot request links or accept another child request', async () => {
  const app = setup('child_dependent','child');
  await assert.rejects(app.api.sendLinkRequest(null, { id: 'other' }), /role/);
  app.records.set('m5Links/parent_other', { targetUid: 'other', status: 'pending' });
  await assert.rejects(app.api.acceptLinkRequest('parent_other'), /unavailable/);
  assert.equal(app.writes.length, 0);
});
test('intended child accepts or rejects pending requests only', async () => {
  const app = setup('child_dependent','child');
  app.records.set('m5Links/parent_child', { targetUid: 'child', status: 'pending' });
  await app.api.acceptLinkRequest('parent_child'); assert.equal(app.writes[0].status, 'active');
  await assert.rejects(app.api.acceptLinkRequest('parent_child'), /unavailable/);
  app.records.set('m5Links/other_child', { targetUid: 'child', status: 'pending' });
  await app.api.rejectLinkRequest('other_child'); assert.equal(app.writes[1].status, 'rejected');
});
test('self links, malformed IDs and unverified sessions are rejected', async () => {
  const app = setup();
  for (const id of ['parent', 'bad/id', '']) await assert.rejects(app.api.sendLinkRequest(null, { id }));
  app.auth.currentUser.emailVerified = false;
  await assert.rejects(app.api.sendLinkRequest(null, { id: 'child' }), /verified/);
});
test('child revocation is limited to its own active links', async () => {
  const app = setup('child_dependent', 'child');
  app.records.set('m5Links/parent_child', { targetUid: 'child', status: 'active' });
  app.records.set('m5Links/parent_other', { targetUid: 'other', status: 'active' });
  await app.api.revokeChildLink('parent_child'); assert.equal(app.writes[0].status, 'revoked');
  await assert.rejects(app.api.revokeChildLink('parent_other'), /unavailable/);
  await assert.rejects(app.api.revokeChildLink('parent_child'), /unavailable/);
});
