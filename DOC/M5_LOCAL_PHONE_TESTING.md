# Local Android and phone testing

This development-only setup runs GuardianCircle against Firebase Auth and Firestore emulators on your computer. It does not create production accounts, require production Firebase keys, or bypass the M5 security rules. The app shows a **Local test environment** banner.

## Start on this Windows computer

Double-click `mobile/start-local-test.cmd` and keep its terminal open. It discovers the computer's Wi-Fi/Ethernet IPv4 address, starts the local backend, creates three verified test accounts, and starts Expo and a phone setup page. The backend log is in the ignored `mobile/.m5-validation/local-backend.log`.

On your Android phone, join the same network and open the HTTP address printed by the launcher, for example `http://192.168.43.185:8082`. The page provides the matching Expo Go installer, an app link, a QR code, and the local test password. If Android asks whether the browser may install the APK, allow it for this installation. The installer is Expo's SDK 57 client downloaded by Expo CLI, not a GuardianCircle production APK.

Accounts:

| Role | Email |
| --- | --- |
| Parent | `parent@guardiancircle.test` |
| Child one | `child1@guardiancircle.test` |
| Child two | `child2@guardiancircle.test` |

The seed script generates a local password and saves it only to the ignored `mobile/.m5-validation/local-accounts.json`. All three accounts are email-verified inside the Auth emulator. No real verification emails are sent. Test data belongs to the running emulator session and is not production data; after restarting the backend, sign out and sign in again if a previous session's profile is unavailable.

## Virtual Android device

The existing Android Studio virtual device is `Pixel_7a_2` (Android 14). Start it from Android Studio's Device Manager, then press `a` in the Expo terminal or open the installed Expo Go client and enter the printed `exp://` address. Expo CLI can install a compatible client automatically when opening Android.

Use the parent account on the physical phone and a child account in the virtual device to test linking and synchronization. The virtual device's GPS is simulated; it cannot prove real-world GPS accuracy or background behavior. A physical child device is needed for that verification.

## Check the M5 flow

1. Sign in as a child and copy the account ID from **Home → My Family**.
2. On the parent device, choose **Family → Link a child account**, paste the ID and send the request.
3. Refresh the child's requests and choose **Accept tracking**. A pending request must not grant access.
4. Start location sharing on the child, allow permission, and keep My Family open. Refresh the parent and open **View location**. Repeat with the second child account as needed.
5. Exercise safe check-ins, emergency requests, safe zones, and history. Revoke a link from either account and verify access disappears. A new request needs another child acceptance.

## Configuration and services

Local mode is explicitly selected with:

```dotenv
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=YOUR_COMPUTER_WIFI_IPV4
```

The launcher injects these values into its child processes. The `.env` on this computer also contains them and remains ignored. To return to a real Firebase project, disable the emulator flag and supply the actual project configuration. Local mode is rejected in release builds.

| Service | Port |
| --- | --- |
| Expo/Metro | 8081 |
| Phone setup, APK and QR | 8082 |
| Firebase Auth emulator | 9099 |
| Firestore emulator | 8080 |

`firebase.m5.local.json` binds the test services to the local network so the phone can connect. Use test data only and run this on a trusted network. Allow Node/Java through Windows Firewall for that network if the phone cannot reach the services. Keep the computer awake. These addresses stop working when the servers stop or the computer's IP changes.

The local setup uses official Firestore emulator **1.19.8**, which is smaller than the latest download and supports the rules used here. Android Studio's bundled Java runtime is used when available. The initial downloaded JAR was checked against Google's published MD5 checksum. Cached downloads, logs, screenshots, test credentials and APKs are ignored by Git.

Maps tiles may be unavailable without a Google Maps key. Coordinate, authentication, linking, safe-zone and safety-event testing remain separate from verifying Google Maps rendering. Google sign-in, Cloudinary uploads, background tracking, push delivery and BLE hardware are not configured by this local setup. Other modules may report permission errors because this fixture loads only the M5 reference rules.

## Developer checks

From `mobile`, while the local backend is running:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
npm.cmd run test:rules
node scripts/seedM5Local.cjs
node scripts/checkM5Local.cjs
npm.cmd run test:services
npm.cmd test -- --runInBand
```

The rules suite clears the demo Firestore database. Run it before seeding accounts for manual testing, and never while someone is using the local fixture. The service integration check uses the actual M5 service code against the emulators, temporarily links the fixture accounts, checks consent, location ownership, zone events, check-ins, SOS and revocation, and then removes those fixture links/locations/events so manual testing starts unlinked. Its test GPS fixes are synthetic and are deleted after the check.

The original implementation report is in `M5_PARENT_CHILD_TRACKING.md`. This follow-up adds local runtime setup; production Firebase rule deployment and physical-device acceptance are still separate tasks.

## Validation for this local setup

- 130 Node service tests passed, including 26 M5 checks.
- 8 existing Jest tests passed.
- All 7 Firebase emulator permission checks passed against the reference rules.
- The real-service emulator check passed pending/accepted linking for two children, child-only location writes, safe-zone transitions, check-in requests and responses, SOS state, recorded history, and revocation.
- The cached Android client was installed in `Pixel_7a_2`; child sign-in and My Family rendering were verified in the running app.
- The phone setup page and Android installer returned HTTP 200; the user confirmed the setup page opens on their physical Android phone.
- The launcher was smoke-tested while reusing the running services. `.env`, test credentials, APKs, downloads and screenshots were confirmed ignored by Git.

The test backend and physical network checks do not validate real-world child GPS accuracy, production rule deployment, background tracking, push delivery or other modules' production configuration.
