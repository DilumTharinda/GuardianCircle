// Local emulator fixture only. Never connects to a production Firebase endpoint.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const project = 'demo-guardiancircle-m5';
const authRoot = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const firestoreRoot = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
const output = path.resolve(__dirname, '../.m5-validation/local-accounts.json');
const previous = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
const password = previous[0]?.password || `GuardianTest${crypto.randomInt(1000, 10000)}!`;
const fixtures = [
  { email: 'parent@guardiancircle.test', displayName: 'Test Parent', role: 'parent_guardian' },
  { email: 'child1@guardiancircle.test', displayName: 'Test Child One', role: 'child_dependent' },
  { email: 'child2@guardiancircle.test', displayName: 'Test Child Two', role: 'child_dependent' },
];
async function request(url, body, method = 'POST') {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `Local emulator returned ${response.status}`);
  return result;
}
async function main() {
  const accounts = [];
  for (const fixture of fixtures) {
    let account;
    try { account = await request(`${authRoot}/accounts:signUp?key=demo-local-only`, { email: fixture.email, password, returnSecureToken: true }); }
    catch (error) {
      if (!error.message.includes('EMAIL_EXISTS')) throw error;
      account = await request(`${authRoot}/accounts:signInWithPassword?key=demo-local-only`, { email: fixture.email, password, returnSecureToken: true });
    }
    await request(`${authRoot}/accounts:update?key=demo-local-only`, { localId: account.localId, emailVerified: true, displayName: fixture.displayName });
    const profile = { ...fixture, uid: account.localId };
    const fields = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, { stringValue: value }]));
    await request(`${firestoreRoot}/users/${account.localId}`, { fields }, 'PATCH');
    accounts.push({ ...profile, password });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(accounts, null, 2));
  console.log('Created three verified LOCAL TEST accounts (not production accounts):');
  for (const account of accounts) console.log(`${account.role}: ${account.email} | password: ${password} | account ID: ${account.uid}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
