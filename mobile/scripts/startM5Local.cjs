// Explicit, development-only launcher. All Firebase data uses the demo project.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const mobile = path.resolve(__dirname, '..'); const repository = path.resolve(mobile, '..');
const output = path.join(mobile, '.m5-validation'); fs.mkdirSync(output, { recursive: true });
const network = Object.entries(os.networkInterfaces()).filter(([name]) => /wi-?fi|wireless|ethernet/i.test(name));
const address = network.flatMap(([, interfaces]) => interfaces).find(item => item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))?.address;
if (!address) throw Error('Connect the computer to Wi-Fi, then start local testing again.');
const environment = { ...process.env, EXPO_PUBLIC_USE_FIREBASE_EMULATORS: 'true', EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: address,
  FIRESTORE_EMULATOR_VERSION: '1.19.8', FIREBASE_EMULATORS_PATH: path.join(output, 'firebase-emulators19') };
const bundledJava = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
if (fs.existsSync(path.join(bundledJava, 'bin', 'java.exe'))) {
  const existingPath = environment.Path || environment.PATH || '';
  for (const key of Object.keys(environment)) if (key.toLowerCase() === 'path') delete environment[key];
  environment.JAVA_HOME = bundledJava; environment.PATH = `${path.join(bundledJava, 'bin')};${existingPath}`;
}
const children = []; let closing = false;
function start(executable, args, options = {}) {
  const child = spawn(executable, args, { cwd: mobile, env: environment, windowsHide: true, ...options });
  children.push(child); child.on('error', error => { console.error(error.message); shutdown(1); }); return child;
}
function shutdown(code = 0) {
  if (closing) return; closing = true;
  for (const child of children) if (child.pid && child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown()); process.on('SIGTERM', () => shutdown());
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function responds(url) { try { await fetch(url, { signal: AbortSignal.timeout(1000) }); return true; } catch { return false; } }
async function main() {
  if (!await responds('http://127.0.0.1:9099/') || !await responds('http://127.0.0.1:8080/')) {
    const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
    const cli = fs.existsSync(cache) && fs.readdirSync(cache).map(name => path.join(cache, name, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js')).find(filename => fs.existsSync(filename));
    const log = fs.openSync(path.join(output, 'local-backend.log'), 'a');
    const args = ['emulators:start', '--only', 'auth,firestore', '--project', 'demo-guardiancircle-m5', '--config', 'firebase.m5.local.json'];
    if (cli) start(process.execPath, [cli, ...args], { cwd: repository, stdio: ['ignore', log, log] });
    else start('cmd.exe', ['/d', '/s', '/c', 'npx.cmd --yes --package firebase-tools@15.34.2 firebase ' + args.join(' ')], { cwd: repository, stdio: ['ignore', log, log] });
    console.log('Starting the local Firebase test backend. First use may download its emulator.');
    let ready = false;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (await responds('http://127.0.0.1:9099/') && await responds('http://127.0.0.1:8080/')) { ready = true; break; }
      await sleep(1000);
    }
    if (!ready) throw Error('Local backend did not start. See mobile/.m5-validation/local-backend.log.');
  }
  await new Promise((resolve, reject) => {
    const seed = start(process.execPath, [path.join(__dirname, 'seedM5Local.cjs')], { stdio: 'inherit' });
    seed.on('exit', code => code === 0 ? resolve() : reject(Error('Could not prepare the local test accounts.')));
  });
  if (!await responds('http://127.0.0.1:8082/')) start(process.execPath, [path.join(__dirname, 'serveM5Phone.cjs'), address], { stdio: 'inherit' });
  console.log(`\nOn your Android phone, open http://${address}:8082 on the same Wi-Fi.\nKeep this terminal open. Ctrl+C stops services started by this launcher.\n`);
  if (!await responds('http://127.0.0.1:8081/status')) start('cmd.exe', ['/d', '/s', '/c', 'npx.cmd expo start --go --lan --port 8081'], { stdio: 'inherit' });
}
main().catch(error => { console.error(error.message); shutdown(1); });
