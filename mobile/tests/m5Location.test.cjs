const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), babel=require('@babel/core');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function setup(overrides={}) {
  let next; let removed=0; let watches=0; const errors=[], statuses=[];
  const location={ Accuracy:{High:4}, requestForegroundPermissionsAsync:async()=>({status:'granted'}), hasServicesEnabledAsync:async()=>true,
    watchPositionAsync:async(_,callback)=>{watches++;next=callback;return {remove:()=>removed++};}, ...overrides };
  const module={exports:{}};
  const code=babel.transformSync(fs.readFileSync('src/services/childLocationTracking.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
  vm.runInNewContext(code,{module,exports:module.exports,require:()=>location});
  return { start:publish=>module.exports.startChildLocationTracking({publish,onStatus:s=>statuses.push(s),onError:e=>errors.push(e.message)}),
    errors,statuses,next:fix=>next(fix),removed:()=>removed,watches:()=>watches };
}
test('foreground GPS fixes synchronize and watcher is removed on stop',async()=>{
 const app=setup(), sent=[];const stop=app.start(async coords=>sent.push(coords));await flush();app.next({coords:{latitude:0,longitude:0}});await flush();stop();
 assert.equal(sent.length,1);assert.equal(app.removed(),1);app.next({coords:{latitude:1,longitude:1}});await flush();assert.equal(sent.length,1);
});
test('stopping while permission request is pending never starts a watcher',async()=>{
 let resolve;const app=setup({requestForegroundPermissionsAsync:()=>new Promise(r=>resolve=r)});const stop=app.start(async()=>{});stop();resolve({status:'granted'});await flush();assert.equal(app.watches(),0);
});
test('denied permission is visible and produces no watcher',async()=>{
 const app=setup({requestForegroundPermissionsAsync:async()=>({status:'denied'})});app.start(async()=>{});await flush();assert.match(app.errors[0],/denied/);assert.equal(app.watches(),0);
});
test('writes serialize and keep only the newest pending fix',async()=>{
 let release;const app=setup(),sent=[];let count=0;const stop=app.start(async coords=>{sent.push(coords.latitude);if(count++===0)await new Promise(r=>release=r);});
 await flush();app.next({coords:{latitude:1}});app.next({coords:{latitude:2}});app.next({coords:{latitude:3}});assert.deepEqual(sent,[1]);release();await flush();assert.deepEqual(sent,[1,3]);stop();
});
test('a write failure stays visible and later fixes can recover',async()=>{
 const app=setup();let count=0;const stop=app.start(async()=>{if(count++===0)throw Error('offline');});await flush();app.next({coords:{}});await flush();assert.equal(app.errors[0],'offline');app.next({coords:{}});await flush();assert.equal(app.statuses.at(-1),'Location synchronized');stop();
});
