const { test } = require('node:test');
const fs = require('node:fs'); const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, getDocs } = require('firebase/firestore');

test('M5 Firebase rules enforce cross-account consent and location permissions', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async t => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({ projectId: 'demo-guardiancircle-m5', firestore: {
    host, port: Number(port), rules: fs.readFileSync(path.resolve(__dirname, '../../../firebase/firestore.m5.rules'), 'utf8'),
  } });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [uid, role, displayName] of [['parent','parent_guardian','Parent'],['child','child_dependent','Child Actual'],['other','parent_guardian','Other'],['secondChild','child_dependent','Second Child']]) {
        await setDoc(doc(db,'users',uid),{uid, role, displayName});
      }
    });
    const parent = env.authenticatedContext('parent', { email_verified: true }).firestore();
    const child = env.authenticatedContext('child', { email_verified: true }).firestore();
    const other = env.authenticatedContext('other', { email_verified: true }).firestore();
    const secondChild = env.authenticatedContext('secondChild', { email_verified: true }).firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    const ref = db => doc(db,'m5Links','parent_child');
    const position = db => doc(db,'m5Locations','child');
    const request = () => ({ ownerUid:'parent',ownerName:'Parent',targetUid:'child',targetName:'Child',type:'child',status:'pending',safeZones:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp() });
    await t.test('parent creates pending request but cannot activate it', async () => {
      await assertSucceeds(setDoc(ref(parent),request()));
      await assertFails(updateDoc(ref(parent),{status:'active',updatedAt:serverTimestamp()}));
      await assertFails(getDoc(ref(other)));
      await assertFails(getDoc(ref(anonymous)));
    });
    await t.test('only the child writes its own valid location', async () => {
      const data = {latitude:0,longitude:0,accuracy:10,speed:null,address:'',updatedAt:serverTimestamp()};
      await assertSucceeds(setDoc(position(child),data));
      await assertFails(setDoc(position(parent),data));
      await assertFails(setDoc(position(secondChild),data));
      await assertFails(updateDoc(position(child),{latitude:91,updatedAt:serverTimestamp()}));
      await assertFails(getDoc(position(parent)));
    });
    await t.test('only intended child accepts and only accepted parent reads', async () => {
      await assertFails(updateDoc(ref(secondChild),{status:'active',targetName:'Second Child',updatedAt:serverTimestamp()}));
      await assertSucceeds(updateDoc(ref(child),{status:'active',targetName:'Child Actual',updatedAt:serverTimestamp()}));
      await assertSucceeds(getDoc(position(parent)));
      await assertFails(getDoc(position(other)));
      await assertFails(getDocs(collection(parent,'m5Locations')));
      await assertFails(updateDoc(ref(child),{ownerUid:'other',updatedAt:serverTimestamp()}));
    });
    await t.test('child cannot promote its profile or write another child history', async () => {
      await assertFails(updateDoc(doc(child,'users','child'),{role:'parent_guardian'}));
      await assertFails(setDoc(doc(secondChild,'m5Links','parent_child','events','forged'),{title:'Fake',category:'checkin',description:'Fake',actorUid:'secondChild',createdAt:serverTimestamp()}));
      await assertSucceeds(setDoc(doc(child,'m5Links','parent_child','events','real'),{title:'Safe',category:'checkin',description:'Safe',actorUid:'child',createdAt:serverTimestamp()}));
      await assertSucceeds(getDocs(collection(parent,'m5Links','parent_child','events')));
    });
    await t.test('child revocation removes parent access to location and history', async () => {
      await assertSucceeds(updateDoc(ref(child),{status:'revoked',updatedAt:serverTimestamp()}));
      await assertFails(getDoc(position(parent)));
      await assertFails(getDocs(collection(parent,'m5Links','parent_child','events')));
    });
    await t.test('unverified parents cannot send requests', async () => {
      const unverified=env.authenticatedContext('parent',{email_verified:false}).firestore();
      await assertFails(setDoc(ref(unverified),request()));
    });
  } finally { await env.cleanup(); }
});
