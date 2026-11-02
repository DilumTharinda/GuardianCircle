const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
function setup() {
  const state = []; let listener, effect, value, read;
  const auth = { currentUser: null };
  const react = { createContext: () => ({ Provider: 'Provider' }), useState: initial => {
    const index = state.length; state.push(initial); return [initial, v => { state[index] = v; }];
  }, useEffect: callback => { effect = callback; }, createElement: (_, props) => { value = props.value; } };
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync('src/context/AuthContext.js', 'utf8'), {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-react-jsx'],
  }).code;
  vm.runInNewContext(code, { module, exports: module.exports, console, process: { env: {} }, require: name => {
    if (name === 'react') return { ...react, default: react, __esModule: true };
    if (name === 'react-native') return { Platform: { OS: 'web' } };
    if (name === 'firebase/auth') return { onAuthStateChanged: (_, cb) => { listener = cb; return () => {}; } };
    if (name === 'firebase/firestore') return { doc: (_, collection, uid) => uid, getDoc: uid => read(uid) };
    if (name === '../services/firebase') return { auth, db: {} };
    if (name === '../constants/roles') return { ROLES: { PARENT_GUARDIAN: 'parent_guardian', CHILD_DEPENDENT: 'child_dependent', ADMIN_MODERATOR: 'admin_moderator' } };
    if (name.includes('async-storage')) return { getItem: () => { throw Error('Demo storage must not be read'); } };
    throw Error(name);
  } });
  module.exports.AuthProvider({ children: null }); effect();
  return { state, value, setRead: callback => { read = callback; }, login: user => { auth.currentUser = user; return listener(user); } };
}
test('signed out session never restores a demo identity', async () => {
  const app = setup(); await app.login(null); assert.equal(app.state[0], null); assert.equal(app.state[1], null); assert.equal(app.state[2], false);
});
test('late profile cannot replace a new account', async () => {
  const app = setup(); let resolve;
  app.setRead(uid => uid === 'old' ? new Promise(r => { resolve = r; }) : Promise.resolve({ exists: () => true, data: () => ({ role: 'child_dependent', uid: 'forged' }) }));
  const old = app.login({ uid: 'old' }); await app.login({ uid: 'new' });
  resolve({ exists: () => true, data: () => ({ role: 'parent_guardian' }) }); await old;
  assert.equal(app.state[1].uid, 'new'); assert.equal(app.state[1].role, 'child_dependent');
});
test('profile failure leaves no privileges', async () => {
  const app = setup(); app.setRead(async () => { throw { code: 'permission-denied' }; });
  await app.login({ uid: 'child' }); assert.equal(app.state[1], null); assert.equal(app.state[2], false);
});
test('registration rejects unknown and admin roles', async () => {
  const app = setup(); await assert.rejects(app.value.register('x', 'x', 'x', 'admin_moderator')); await assert.rejects(app.value.register('x', 'x', 'x', 'invented'));
});
