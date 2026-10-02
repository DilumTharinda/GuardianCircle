# Member 3 integration and testing

## Automated checks

- `node --test tests/*.test.cjs` covers journey lifecycle/persistence/location,
  journey sharing, Trusted Circle persistence, unsafe report creation/heatmap
  filtering, and OSRM route parsing/scoring.
- Babel syntax checks cover `MapScreen.js` and `saferRouteService.js`.
- Android Expo export validates the native map screen bundle.

## Device checks still needed

- On Android and iOS, deny location permission, disable device location, restore
  each setting, and retry the map/report GPS flows.
- Start a journey, background and reopen the app, resume foreground tracking,
  check in at the destination, and manually end another journey. Confirm no
  duplicate location watcher remains after leaving the Map tab.
- Share an active journey to a selected Trusted Circle contact, cancel the OS
  share sheet, and confirm the app reports cancellation. Sharing is a one-time
  OS share-sheet action; it does not deliver SMS or a live tracking link.
- Add, edit, and delete a Trusted Circle contact; verify empty and offline states.
- Submit an unsafe-location report and verify it appears in the report-based
  heatmap without appearing in Lost & Found. Test malformed Firestore entries.
- Request an OSRM route with live device GPS and a selected destination; check
  available alternatives, report score ordering, no-route and offline states,
  and visible OSRM/OpenStreetMap attribution.

## Boundaries

- Public OSRM demo routing uses the driving profile and has no uptime guarantee;
  it is demo infrastructure, not pedestrian guidance or a production safety
  backend.
- The legacy SOS `getCurrentCoordinates()` result contract remains unchanged.
  It still falls back to configured default coordinates if GPS fails; Member 3
  journey, reporting, and route flows use strict real foreground GPS snapshots.
- SOS preserves legacy linked-parent recipients and now also reads current
  Trusted Circle contacts through `getTrustedContacts()`. Only active,
  SOS-enabled contacts with a verified `targetUid` are added; unlinked phone-only
  contacts cannot be addressed by the UID-based SOS recipient field. No
  hard-coded recipients or SMS/WhatsApp delivery are used.
