// Exercises the actual M5 services against LOCAL emulators, never production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { initializeApp, deleteApp } = require('firebase/app');
const authentication = require('firebase/auth');
const firestore = require('firebase/firestore');
const project = 'demo-guardiancircle-m5';
const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.m5-validation/local-accounts.json'), 'utf8'));
const app = initializeApp({ projectId: project, apiKey: 'demo-local-only', appId: 'local-check' }, 'm5-local-check');
const auth = authentication.getAuth(app); const db = firestore.getFirestore(app);
authentication.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
firestore.connectFirestoreEmulator(db, '127.0.0.1', 8080);
const roles = { PARENT_GUARDIAN: 'parent_guardian', CHILD_DEPENDENT: 'child_dependent' };
let accounts;
function load(name) {
  const filename = path.resolve(__dirname, '../src/services', name + '.js');
  const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const module = { exports: {} };
  // The SDK checks plain-object prototypes, so use the same realm as Firebase.
  const resolve = dependency => {
    if (dependency === './firebase') return { auth, db };
    if (dependency === 'firebase/firestore') return firestore;
    if (dependency === '../constants/roles') return { ROLES: roles };
    if (dependency === './parentChildAccounts') return accounts;
    if (dependency === 'expo-location') return {};
    throw Error(`Unexpected dependency: ${dependency}`);
  };
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports;
}
accounts = load('parentChildAccounts');
const service = load('parentChildService');
const [parent, childOne, childTwo] = fixtures;
const signIn = fixture => authentication.signInWithEmailAndPassword(auth, fixture.email, fixture.password);
const linkOne = `${parent.uid}_${childOne.uid}`; const linkTwo = `${parent.uid}_${childTwo.uid}`;
async function removeLocalFixtures() {
  // These URLs are fixed to the local emulator and only fixture-owned records.
  const root = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
  for (const id of [linkOne, linkTwo]) {
    const response = await fetch(`${root}/m5Links/${id}/events`, { headers: { Authorization: 'Bearer owner' } });
    const data = await response.json();
    for (const document of data.documents || []) await fetch(`http://127.0.0.1:8080/v1/${document.name}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    await fetch(`${root}/m5Links/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  }
  for (const child of [childOne, childTwo]) await fetch(`${root}/m5Locations/${child.uid}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}
async function main() {
  await removeLocalFixtures();
  try {
    await signIn(parent);
    await accounts.sendLinkRequest(null, { id: childOne.uid });
    await accounts.sendLinkRequest(null, { id: childTwo.uid });
    assert.equal((await service.getChildren()).length, 0);
    console.log('PASS: parent sends two pending requests; neither grants tracking access');
    await signIn(childOne); await accounts.acceptLinkRequest(linkOne);
    await service.childSendCheckIn(childOne.uid);
    await service.triggerChildSOS(childOne.uid);
    await signIn(childTwo); await accounts.acceptLinkRequest(linkTwo);
    await assert.rejects(accounts.acceptLinkRequest(linkOne));
    console.log('PASS: each child accepts only its own request');
    await signIn(parent);
    const children = await service.getChildren();
    assert.equal(children.length, 2); assert.equal(children.find(child => child.targetUid === childOne.uid).sosActive, true);
    await assert.rejects(service.broadcastChildLiveLocation(childOne.uid, { latitude: 0, longitude: 0 }));
    await service.sendCheckInRequest(linkOne);
    await service.saveSafeZone(linkOne, { name: 'Local integration test zone', latitude: 0, longitude: 0, radius: 250 });
    console.log('PASS: parent sees two accepted children and SOS, but cannot publish child GPS');
    await signIn(childOne);
    // Deliberately synthetic test fixes; fixture locations are deleted below.
    await service.broadcastChildLiveLocation(childOne.uid, { latitude: 1, longitude: 1, accuracy: 8 });
    await service.broadcastChildLiveLocation(childOne.uid, { latitude: 0, longitude: 0, accuracy: 8 });
    await service.childSendCheckIn(childOne.uid);
    await signIn(parent);
    assert.equal((await service.getChildById(linkOne)).sosActive, false);
    assert.equal((await service.getChildById(linkOne)).lastLocation.latitude, 0);
    assert.equal((await firestore.getDoc(firestore.doc(db, 'm5Links', linkOne))).data().checkInRequested, false);
    assert.ok((await service.getChildHistory(linkOne)).length >= 3);
    assert.ok((await service.getChildHistory(linkOne, 'today', 'zone')).some(event => event.title.includes('Entered')));
    await signIn(childTwo); await accounts.revokeChildLink(linkTwo);
    await signIn(parent); await assert.rejects(service.getChildById(linkTwo));
    assert.equal((await service.getChildren()).length, 1);
    console.log('PASS: safe check-in clears request/SOS, real history persists, and revocation removes access');
  } finally {
    await removeLocalFixtures();
    await authentication.signOut(auth); await firestore.terminate(db); await deleteApp(app);
  }
  console.log('Local service integration passed; fixture links reset for manual phone testing.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
