// Small LAN-only development helper for installing the matching Expo Go client.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const address = process.argv[2];
if (!address || !/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) throw Error('Pass this computer Wi-Fi IPv4 address.');
const root = path.resolve(__dirname, '../.m5-validation');
const apkDirectory = path.join(os.homedir(), '.expo', 'android-apk-cache');
const appUrl = `exp://${address}:8081`;
// Use the QR encoder already installed with Expo; artifacts stay ignored.
const { toQR } = require('toqr');
const { PNG } = require('pngjs');
const matrix = toQR(appUrl); const extent = Math.sqrt(matrix.length); const scale = 10; const border = 4;
const qr = new PNG({ width: (extent + border * 2) * scale, height: (extent + border * 2) * scale });
qr.data.fill(255);
for (let row = 0; row < extent; row += 1) for (let column = 0; column < extent; column += 1) {
  if (!matrix[row * extent + column]) continue;
  for (let y = 0; y < scale; y += 1) for (let x = 0; x < scale; x += 1) {
    const pixel = (((row + border) * scale + y) * qr.width + (column + border) * scale + x) * 4;
    qr.data[pixel] = qr.data[pixel + 1] = qr.data[pixel + 2] = 0;
  }
}
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'guardian-phone-qr.png'), PNG.sync.write(qr));
const page = () => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GuardianCircle local test</title><body style="font:18px system-ui;max-width:600px;margin:32px auto;padding:16px;line-height:1.6"><h1>GuardianCircle local test</h1><p>Keep this phone and the computer on the same Wi-Fi.</p><ol><li><a href="/expo-go.apk">Install the Expo Go client for this project</a>. Android may ask you to allow installation from your browser.</li><li><a href="${appUrl}">Open GuardianCircle in Expo Go</a>.</li></ol><p>These test accounts are available after the local backend finishes starting:</p><ul><li>Parent: parent@guardiancircle.test</li><li>Child 1: child1@guardiancircle.test</li><li>Child 2: child2@guardiancircle.test</li></ul><p>Test password for all three: <strong>${testPassword()}</strong></p><p><a href="/qr.png">Show the app QR code</a></p><p>GPS testing requires location permission. Keep My Family open on the child device. Maps tiles may be unavailable without a Maps key; actual coordinates and check-ins can still be tested.</p></body></html>`;
function testPassword() {
  const accountFile = path.join(root, 'local-accounts.json');
  return fs.existsSync(accountFile) ? JSON.parse(fs.readFileSync(accountFile, 'utf8'))[0].password : 'Preparing test accounts';
}
http.createServer((request, response) => {
  const route = (request.url || '/').split('?')[0];
  if (route === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(page()); return; }
  let file;
  let contentType;
  if (route === '/qr.png') { file = path.join(root, 'guardian-phone-qr.png'); contentType = 'image/png'; }
  else if (route === '/expo-go.apk') {
    const apk = fs.existsSync(apkDirectory) && fs.readdirSync(apkDirectory).filter(name => /^Expo-Go-57\.[\d.]+\.apk$/.test(name)).sort().at(-1);
    if (apk) file = path.join(apkDirectory, apk);
    contentType = 'application/vnd.android.package-archive';
  }
  if (!file || !fs.existsSync(file)) { response.writeHead(404); response.end('The Android client is still being prepared. Please retry shortly.'); return; }
  response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': fs.statSync(file).size });
  if (request.method === 'HEAD') { response.end(); return; }
  fs.createReadStream(file).pipe(response);
}).listen(8082, '0.0.0.0', () => console.log(`Phone setup: http://${address}:8082`));
