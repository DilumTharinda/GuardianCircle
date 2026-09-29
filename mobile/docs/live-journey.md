# Live journey tracking — FR-1.6

The native map screen lets a signed-in Firebase user long-press any visible map
position to choose a destination. The optional label defaults to "Selected
destination"; no destination or route coordinates are hard-coded.

## Tracking behavior

- Tracking uses `expo-location` foreground GPS only. It stops when the map loses
  focus, the app leaves the foreground, the journey ends, or the screen unmounts.
- A paused journey must be resumed explicitly after returning to the map. The
  elapsed time is wall-clock time from the original start and includes pauses.
- The current marker and travelled polyline contain real, fresh, non-mocked GPS
  samples. The path is memory-only and starts a new segment after each pause.
- Distance is straight-line distance from the latest GPS fix to the destination;
  it is not a road-route distance or safer-route recommendation.
- Auto check-in uses a 50 m arrival radius. To limit false arrivals, it requires
  two fresh fixes at least three seconds apart, each with accuracy no worse than
  25 m and with `distance + accuracy <= 50 m`.
- Foreground tracking is supported by Expo Go. Continuous background tracking
  would require a native development/production build, background permissions,
  platform declarations, and an OS-safe background task; Phase 3 does not claim
  or emulate that behavior.

## Persistence

`src/services/journeyService.js` stores start and terminal summaries in the
lowercase `journeys` collection under the authenticated `ownerUid`. It writes
GeoPoints for start, destination, and current/final position, typed timestamps,
status, foreground tracking mode, and the arrival threshold. It does not upload
every GPS fix, the travelled path, routes, unsafe areas, or sharing recipients.

The latest server-confirmed active journey is restored in a paused state. A
terminal summary that cannot reach Firestore is retained in UID-scoped
AsyncStorage and must be retried before starting another journey. No trajectory
is stored locally. Transactions require server acknowledgement, so a failed save
is never reported as successful.

Firestore rules are not deployed from this repository. The deployed rules must
allow authenticated users to query only their own `ownerUid`, create only their
own active records, and update only their own active journey to `arrived` or
`cancelled`. They must reject owner/start/destination changes and cross-user
reads or writes.

## Manual verification

- On a real phone, grant location access, long-press a destination, start, walk,
  and verify the marker, path, elapsed time, and distance update.
- Put the app in the background or switch tabs; verify tracking stops. Return and
  explicitly resume it, and confirm a new path segment starts.
- Approach a destination with good GPS accuracy and verify automatic check-in.
- Cancel manually and verify the watcher stops and the terminal status persists.
- Restart during an active journey and verify it restores paused for that UID.
- Deny permission, disable location services, obstruct GPS, and retry each state.
- Disable networking at start and completion; verify failures are visible, then
  reconnect and retry the pending final save.
- Sign out or switch accounts and verify no journey state crosses accounts.
