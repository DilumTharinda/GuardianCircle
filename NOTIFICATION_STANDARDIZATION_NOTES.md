# Notification Standardization — Audit Findings

Cross-cutting task from the Team Guide (Section 10.2/10.3, Step 4). This
is an audit of how each module currently sends (or doesn't send) push
notifications, plus what's needed to standardize them.

## What I found (as of this audit)

| File | Sends a real push notification? | What it actually does |
|---|---|---|
| `alertService.js` | No | Manages alert status (resolve/cancel), reads/writes Firestore + local cache. No notification code at all. |
| `sosService.js` | No | Writes the alert to Firestore, gathers recipient IDs, does haptics, then `console.log`s "🚨 SOS DISPATCHED" — that's a developer log, not something the recipient ever sees. |
| `parentChildService.js` | No | Runs on `USE_MOCK_DATA = true` (local AsyncStorage only). `triggerChildSOS()` writes a local history entry but never notifies the linked parent. |
| `notificationService.js` | — | Was empty. Now holds the shared sending logic (see below). |

**Bottom line:** nothing in the app currently delivers a real push
notification to anyone. This isn't a regression anyone caused — these
modules just haven't reached that part of their build yet. But it's a
real gap against the SRS: FR-1.1 requires the Trusted Circle to be
notified on SOS, and FR-4.4 requires the linked parent to always receive
a child's SOS regardless of their notification settings.

## What's now available

`src/services/notificationService.js` has two functions ready to use:

```js
import { registerForPushNotificationsAsync, sendNotificationToUser, sendNotificationToUsers } from '../services/notificationService';

// Once, right after login:
await registerForPushNotificationsAsync(user.uid);

// Whenever something needs to notify someone:
await sendNotificationToUser(trustedContactUid, {
  title: 'SOS Alert',
  body: `${userName} triggered an emergency alert.`,
  data: { alertId, screen: 'AlertDetail' },
  category: 'sos', // always delivered, ignores notification preferences
});

// For a whole list of recipients at once:
await sendNotificationToUsers(recipientIds, { title, body, data, category: 'sos' });
```

Valid `category` values and which FR-3.3 preference they respect:
`sos` (always sent — never gated), `journey`, `lost_found`, `geofence`,
`reminder`.

## What each module owner needs to do (not done here)

I haven't modified anyone else's files — these are specific, actionable
asks for whoever owns each module:

- **Member 2 (`sosService.js`)**: after writing the alert to Firestore,
  replace the `console.log` with:
  `await sendNotificationToUsers(recipientIds, { title: 'SOS Alert', body: ..., category: 'sos' })`
- **Member 5 (`parentChildService.js`)**: in `triggerChildSOS()`, add a
  call to `sendNotificationToUser(child.ownerUid, { ..., category: 'sos' })`
  so the linked parent is actually notified — this is the FR-4.4
  requirement specifically. Also worth flagging: `USE_MOCK_DATA = true`
  means none of this module's data is real yet — worth checking whether
  that's intentional for now or should be switched off soon.
- **Member 3/Member 4**: once geofence alerts and lost & found match
  notifications are built, they should call
  `sendNotificationToUser(..., { category: 'geofence' | 'lost_found' })`
  rather than writing their own send logic.
- **Whoever builds the registration/login flow**: call
  `registerForPushNotificationsAsync(user.uid)` once, right after a
  successful login — this is what makes `pushToken` exist on a user's
  profile at all, which every other call above depends on.

## Not yet addressed (flagging, not fixing here)

Expo push is called directly from the client in this implementation,
matching how the rest of this codebase talks to Firebase directly (no
backend server exists in this project yet). In a production app this
would normally run server-side (e.g. a Cloud Function) so one device
can't send fake notifications pretending to be from another user. Worth
raising with the team — not something to solve unilaterally by adding
backend infrastructure as part of this task.