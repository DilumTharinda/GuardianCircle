const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm'); const babel = require('@babel/core');
function setup() {
  const records = new Map(); const reads = []; const writes = [];
  const auth = { currentUser: { uid: 'parent', emailVerified: true } }; let role = 'parent_guardian';
  const snap = ref => ({ id: ref.id.split('/').at(-1), exists: () => records.has(ref.id), data: () => records.get(ref.id), ref });
  const firestore = { doc: (_, ...parts) => ({ id: parts.join('/') || 'generated' }), collection: (_, ...parts) => ({ id: parts.join('/') }),
    query: (ref, ...filters) => ({ ...ref, filters }), where: (field, op, value) => ({ field, value }),
    getDoc: async ref => { reads.push(ref.id); return snap(ref); },
    getDocs: async ref => ({ docs: [...records.keys()].filter(id => id.startsWith(ref.id + '/') && id.split('/').length === ref.id.split('/').length + 1)
      .filter(id => (ref.filters || []).every(f => records.get(id)[f.field] === f.value)).map(id => snap({ id })) }),
    writeBatch: () => ({ set: (ref, data) => writes.push({ ref, data }), commit: async () => {} }),
    serverTimestamp: () => 'server-time', updateDoc: async (ref, data) => writes.push({ ref, data }), setDoc: async (ref, data) => writes.push({ ref, data }),
  };
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(require('node:path').resolve(__dirname, '../src/services/parentChildService.js'),'utf8'), { babelrc:false, configFile:false, plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { module, exports: module.exports, console, Date, require: name => {
    if (name === './firebase') return { auth, db: {} };
    if (name === 'firebase/firestore') return firestore;
    if (name === 'expo-location') return {};
    if (name === './parentChildAccounts') return { requireTrackingRole: async required => { if (required !== role) throw Error('role denied'); return { uid: auth.currentUser.uid }; } };
    if (name === '../constants/roles') return { ROLES: { PARENT_GUARDIAN:'parent_guardian', CHILD_DEPENDENT:'child_dependent' } };
    throw Error(name);
  } });
  return { api:module.exports, records, reads, writes, auth, asChild: () => { role = 'child_dependent'; auth.currentUser.uid = 'child'; } };
}
test('parents receive only their accepted records and no invented location', async () => {
  const app = setup();
  app.records.set('m5Links/parent_child', { ownerUid:'parent', targetUid:'child', status:'active' });
  app.records.set('m5Links/parent_pending', { ownerUid:'parent', targetUid:'pending', status:'pending' });
  app.records.set('m5Links/other_child', { ownerUid:'other', targetUid:'otherChild', status:'active' });
  const children = await app.api.getChildren(); assert.equal(children.length,1); assert.equal(children[0].lastLocation,null); assert.equal(children[0].batteryLevel,null);
  assert.deepEqual(app.reads, ['m5Locations/child']);
});
test('missing or unrelated IDs never fall back to the first child', async () => {
  const app=setup(); app.records.set('m5Links/other_child',{ownerUid:'other',status:'active'});
  await assert.rejects(app.api.getChildById('missing'), /not linked/); await assert.rejects(app.api.getChildById('other_child'), /not linked/);
});
test('zero coordinates remain valid; invalid coordinates cannot be inside a zone', () => {
  const {api}=setup(); assert.equal(api.validCoordinates({latitude:0,longitude:0}),true);
  assert.equal(api.isInsideZone(null,{latitude:0,longitude:0,radius:250}),false);
  assert.equal(api.isInsideZone({latitude:0,longitude:0},{latitude:0,longitude:0,radius:250}),true);
  assert.equal(api.validCoordinates({latitude:91,longitude:0}),false);
});
test('parent device cannot publish a child position', async () => {
  const app=setup(); await assert.rejects(app.api.broadcastChildLiveLocation('child',{latitude:0,longitude:0}), /role/); assert.equal(app.writes.length,0);
});
test('child publishes only its own valid GPS fix', async () => {
  const app=setup(); app.asChild();
  await assert.rejects(app.api.broadcastChildLiveLocation('other',{latitude:0,longitude:0}));
  await assert.rejects(app.api.broadcastChildLiveLocation('child',{latitude:NaN,longitude:0}));
  await app.api.broadcastChildLiveLocation('child',{latitude:0,longitude:0,accuracy:10});
  assert.equal(app.writes[0].ref.id,'m5Locations/child'); assert.equal(app.writes[0].data.latitude,0);
});
test('history filters actual timestamps by day and category', async () => {
  const app=setup(); app.records.set('m5Links/parent_child',{ownerUid:'parent',targetUid:'child',status:'active'});
  const today=new Date(); const yesterday=new Date(); yesterday.setDate(yesterday.getDate()-1);
  app.records.set('m5Links/parent_child/events/today',{title:'Today',category:'checkin',createdAt:{toDate:()=>today}});
  app.records.set('m5Links/parent_child/events/yesterday',{title:'Yesterday',category:'alert',createdAt:{toDate:()=>yesterday}});
  assert.equal((await app.api.getChildHistory('parent_child','today','checkin'))[0].title,'Today');
  assert.equal((await app.api.getChildHistory('parent_child','yesterday'))[0].title,'Yesterday');
  assert.equal((await app.api.getChildHistory('parent_child','today','alert')).length,0);
});

test('real child fixes log zone transitions for active links only', async () => {
  const app=setup(); app.asChild();
  app.records.set('m5Locations/child',{latitude:1,longitude:1});
  app.records.set('m5Links/parent_child',{ownerUid:'parent',targetUid:'child',status:'active',safeZones:[{name:'Home',latitude:0,longitude:0,radius:250}]});
  app.records.set('m5Links/other_child',{ownerUid:'other',targetUid:'child',status:'revoked',safeZones:[{name:'Other',latitude:0,longitude:0,radius:250}]});
  await app.api.broadcastChildLiveLocation('child',{latitude:0,longitude:0});
  assert.equal(app.writes.length,2); assert.equal(app.writes[1].data.title,'Entered safe zone: Home');
  assert.equal(app.writes[1].data.actorUid,'child');
});
