# GuardianCircle M5 parent-child tracking

Implementation and validation date: 2 November 2026. Branch: `feature/m5-parent-child-tracking`.

## Implemented behavior

- Email/password registration uses Firebase Authentication and the selected parent or child role. Demo sessions are no longer restored. Missing or failed profile reads block entry to account screens; late reads cannot restore a previous account's privileges.
- Roles are fixed in the app. Parent tracking routes are registered only for parents, and navigation resets when the account or role changes.
- The child shares their account ID from My Family. The parent sends a pending request using that ID. Only the intended child can accept or reject it. A request never grants location access by itself. Both participants can revoke an active link; a new request requires fresh child acceptance.
- Parents see only their accepted Firebase links. No fictional children, GPS coordinates, battery readings, connection badges, safety percentages, or local mock fallback are used.
- Child-controlled foreground GPS sharing publishes the device position, accuracy, speed and server timestamp. Writes are serialized and intermediate fixes coalesced. Leaving My Family, backgrounding the app, stopping sharing or signing out removes the watcher. Returning to the screen resumes sharing if its switch remains enabled.
- Parents receive location snapshots on the map; the family overview refreshes every ten seconds while focused. Missing positions remain unavailable. Old positions retain their actual timestamps.
- Safe zones use explicit latitude, longitude and radius, or the last received child position as their centre. Real boundary transitions are recorded after an initial position exists. History filters recorded events by the viewing device's local today/yesterday boundaries.
- Parent check-in requests are saved for the child's next refresh. Child safe check-ins clear the request and their SOS state. Child emergency requests are stored for linked parents. These are in-app records, not push notifications or emergency-service calls.
- Pet and valuable profiles persist as owner-scoped Firebase records. Hardware telemetry remains unavailable.
- Family controls use Ionicons, themed text and inputs, accessible labels, and disabled states. Unused simulator and radar components were removed.

## Firebase configuration and deployment

1. Copy `mobile/.env.example` into an untracked `mobile/.env` and supply the real Firebase project values and Google Maps key. Do not commit credentials or generated build output. The existing Firebase module's development defaults do not provide a working deployment.
2. Enable Firebase Email/Password authentication and verify both test accounts' email addresses. Configure authorized domains and Google credentials separately if testing Google sign-in; Google accounts still default to the general-user role.
3. Review `firebase/firestore.m5.rules` alongside the actual deployed rules. This repository did not contain the production rule set. The file is a **reference and emulator fixture**, not a replacement for the other modules' permissions. Merge the M5 and immutable-role protections into the reviewed production rules. Remove broad authenticated-user/wildcard grants over these paths: overlapping allows can defeat restrictive rules. Do not deploy the test configuration to production.
4. Run the emulator permission suite before deploying merged rules. The reference rules have not been compiled or executed against an emulator in this workspace because Java and the Firestore emulator are unavailable. Server enforcement remains unverified until that validation and deployment are complete.
5. The app queries links by one participant field and items by owner; the new queries do not require composite indexes. Normal single-field indexing must remain enabled. No Cloud Functions, service-account keys or Firebase Admin credentials are required by the client.

Collections:

| Path | Purpose |
| --- | --- |
| `users/{uid}` | Existing authenticated profile and role |
| `m5Links/{parentUid}_{childUid}` | Pending/accepted/rejected/revoked relationship, safe zones and check-in request |
| `m5Links/{linkId}/events/{eventId}` | Child check-ins, emergency requests and real zone transitions |
| `m5Locations/{childUid}` | Child-owned latest location and safety state |
| `m5Items/{itemId}` | Parent-owned pet/valuable profile |

The old `linkedEntities`, `childLocations`, and AsyncStorage demo records are not read or automatically migrated. Existing real relationships must be re-established with child consent. No old Firebase records were deleted. Account deletion still needs a trusted backend cleanup process for related link, location, event and item records; client account deletion does not cascade.

Firebase rule design references: [conditions and document lookups](https://firebase.google.com/docs/firestore/security/rules-conditions), [field restrictions](https://firebase.google.com/docs/firestore/security/rules-fields).

## Automated validation

Run from `mobile`:

```powershell
npm.cmd ci
npm.cmd run test:m5
npm.cmd run test:services
npm.cmd test -- --runInBand
```

Results for this implementation:

| Check | Result |
| --- | --- |
| M5 service tests with mocked React/Firebase/location boundaries | 21 passed |
| Full Node service suite, including M5 | 125 passed |
| Existing Jest suite | 8 passed |
| Android production JS/Hermes export | Passed; this is bundling, not an APK or device test |
| Firebase emulator permission suite | Skipped: no emulator host or Java runtime available |
| Web production export | Blocked by existing `expo-sqlite/web/wa-sqlite/wa-sqlite.wasm` Metro resolution in `offlineStorageService` imported by `App.js` |
| Whitespace/diff validation | Passed |

The first export attempt also stopped at the existing missing Google Maps key requirement. For bundling only, a clearly nonfunctional process-local placeholder was supplied; no key or environment file was committed. Android artifacts are ignored under `mobile/.m5-validation/`.

To run the permission tests, install the Firebase CLI and its supported Java runtime, then run from the repository root:

```powershell
npx.cmd firebase-tools emulators:exec --only firestore --project demo-guardiancircle-m5 --config firebase.m5.test.json "npm --prefix mobile run test:rules"
```

The tests load the reference rules and exercise pending consent, intended-child acceptance, unrelated-account denial, own-device writes, invalid coordinates, role escalation, history access and revocation. Running `test:rules` without `FIRESTORE_EMULATOR_HOST` explicitly skips the suite; that is not a successful permission validation. CI runs service tests and Jest, but does not currently run the emulator suite.

## Manual device acceptance

Use two physical devices with distinct verified parent/child accounts and a third unrelated account:

1. Register and sign in, restart the app to verify persistence, then switch accounts and verify profiles and family records do not carry over. Check dark/light themes and keyboard accessibility.
2. Send a link request, verify pending access is denied, reject it, resend, and accept on the intended child's device. Verify unrelated and unverified accounts cannot access data.
3. Start sharing on the child device. Confirm actual coordinates and timestamps appear on the parent map. Walk outdoors and verify updates and reported accuracy. Do not treat a successful bundle as a GPS/device test.
4. Deny permission, disable device location services, disconnect networking, then restore each. Check errors, resumption and absence of invented locations. Stop sharing, navigate away, background the app and sign out; verify watcher cleanup and that the parent retains a timestamped last position.
5. Define a real safe zone, cross its boundary, and confirm entry/exit history. Verify today/yesterday filters around local midnight, sharing recorded events and clearing history.
6. Request a check-in from the parent, respond on the child device, trigger a family emergency request, then mark safe. Confirm the parent receives the state while their app is open; no push delivery is claimed.
7. Revoke from either device and confirm location/history access is denied, including an already-open parent map. Re-link only through a new accepted request.
8. Add/remove pet and item profiles and verify isolation between parent accounts. Hardware proximity, ringing, location and battery must remain unavailable.

## Remaining limitations

Background/terminated-app tracking, push delivery, hardware BLE integration, reverse geocoding, automatic legacy-data migration, backend cascading deletion, production rules deployment and physical-device verification remain outstanding. GPS geofencing uses successive fixes and may miss crossings between fixes; it does not guarantee a child's safety. The web export issue is outside the M5 files and remains unresolved. iOS native build/runtime behavior has not been tested.

## Local commits

| Commit | Message |
| --- | --- |
| `4b600b2` | `feat(m5): integrate real parent and child authentication` |
| `4ba569e` | `feat(m5): implement secure parent-child account linking` |
| `b981bee` | `refactor(m5): replace mock child data with Firebase records` |
| `bf4522f` | `feat(m5): implement live child location synchronization` |
| `33fa588` | `feat(m5): enforce parent and child access permissions` |
| `6778d72` | `style(m5): replace emoji icons with consistent vector icons` |
| `b0facbd` | `feat(m5): record real safe-zone transitions` |
| `df28cbc` | `test(m5): add parent-child tracking integration tests` |

The documentation commit follows these entries. No changes were pushed and no pull request was created.
