# Trusted Circle — FR-1.11 / Member 3 Phase 2

`src/services/trustedCircleService.js` owns contact persistence. The screen and
Member 2 SOS should use this service so they read the same records.

## Service contract

All persistence methods require the authenticated Firebase user's UID; demo
accounts are not a substitute for Firebase authentication.

| Export | Purpose |
| --- | --- |
| `subscribeTrustedContacts(uid, onContacts, onError)` | Subscribe to contacts; returns an unsubscribe function. |
| `getTrustedContacts(uid)` | Return the same contacts in a one-time read. |
| `addTrustedContact(uid, form)` | Add a contact. |
| `updateTrustedContact(uid, id, form)` | Edit an owned trusted contact. |
| `deleteTrustedContact(uid, id)` | Delete an owned trusted contact. |
| `validateTrustedContact(form)` | Validate contact input before saving. |
| `getTrustedCircleErrorMessage(error)` | Return a user-facing error message. |

The form contains `targetName`, `targetPhone`, and optional `relationship`.
Names and phone numbers are normalized before storage.
The form checks duplicate normalized phone numbers against its current list;
this is not a database uniqueness constraint across concurrent clients.

Records live in the existing lowercase `linkedEntities` collection with
generated document IDs. A returned contact includes `id` and these fields:

```js
{
  type: 'trusted_contact',
  ownerUid: '<authenticated UID>',
  targetUid: null,
  targetName: '<name>',
  targetPhone: '<normalized phone>',
  relationship: '<optional relationship>',
  targetPhotoURL: null,
  permissions: {
    viewLocation: false,
    receiveSOS: true,
    receiveJourney: false,
  },
  status: 'active',
  linkedAt: '<Firestore Timestamp>',
  updatedAt: '<Firestore Timestamp>',
}
```

Reads query `ownerUid` and locally retain `trusted_contact` records with
`active` or `pending` status. They do not return linked children, pets, items,
or revoked contacts. Editing preserves account-link and permission fields.
`targetUid` is null on creation because entering a phone number does not verify
a GuardianCircle account link. A contact document's `id` is never a recipient UID.

## Member 2 SOS reuse

Read contacts for the real current user, then select eligible recipients:

```js
import { auth } from '../services/firebase';
import { getTrustedContacts } from '../services/trustedCircleService';

const uid = auth.currentUser?.uid;
if (!uid) throw new Error('Sign in before loading trusted contacts.');

const contacts = await getTrustedContacts(uid);
const sosContacts = contacts.filter(
  (contact) => contact.status === 'active' && contact.permissions?.receiveSOS,
);
const recipientUids = [...new Set(sosContacts
  .map((contact) => contact.targetUid)
  .filter((targetUid) => typeof targetUid === 'string' && targetUid.length > 0))];
```

Phone contacts remain available in `sosContacts` for a future verified delivery
flow. Phase 2 stores and manages contacts; it does not deliver notifications or
modify SOS dispatch. New phone-only contacts therefore produce no account UID
recipients until a separate account-linking flow verifies them.

Existing `sosService.js` uses uppercase `LinkedEntities` with
`userId`/`targetUserId`, unlike the shared schema above. It also reads a global
AsyncStorage contact cache and has demo recipient fallbacks. Member 2 must
replace that contact lookup when integrating this service. Neither that cache
nor the existing global SQLite `trusted_circle` cache is used here; any future
contact cache must be scoped to the authenticated UID and cleared on logout.

## Firestore access policy

No Firestore rules deployment is included or verified by Phase 2. Member 1
must merge owner-scoped access into the project's existing policies and test
the deployed rules. The following illustrates the trusted-contact ownership
checks; retain the existing policies for other linked-entity types:

```text
match /linkedEntities/{contactId} {
  function owns(data) {
    return request.auth != null && data.ownerUid == request.auth.uid;
  }
  function trusted(data) {
    return data.type == 'trusted_contact';
  }

  // Owner-only reads also support the service's ownerUid-only list query.
  allow get, list: if owns(resource.data);
  allow create: if owns(request.resource.data)
                && trusted(request.resource.data);
  allow update: if owns(resource.data) && trusted(resource.data)
                && owns(request.resource.data) && trusted(request.resource.data)
                && request.resource.data.diff(resource.data).affectedKeys()
                    .hasOnly(['targetName', 'targetPhone', 'relationship', 'updatedAt']);
  allow delete: if owns(resource.data) && trusted(resource.data);
}
```

Also validate allowed fields, field types/lengths, normalized phone format,
creation defaults (`targetUid: null`, active status and the permissions above),
and server timestamps. Broad existing `allow` rules can override restrictive
ones because matching grants are combined with OR; remove any grant that lets
another user access these records. Test with the Firestore Rules emulator
before deploying merged rules.

## Automated checks

Run `node --test tests/trustedCircleService.test.cjs` from `mobile`.
These tests stub Firebase; they verify validation, CRUD, UID isolation and
listener cleanup without connecting to the live project. They do not test
deployed Firestore rules.

## Manual checks

- Sign in with a real Firebase account. Check initial loading and the empty list.
- Add a valid contact, reopen the screen/restart the app, and verify persistence.
- Edit the name, phone, and relationship; verify the updated values persist.
- Check blank/invalid inputs and duplicate normalized phone numbers.
- Cancel deletion, then confirm deletion and verify the record stays deleted.
- Deny Firestore access; verify the error/retry state. Disconnect networking
  and attempt a save; verify failure is not reported as success. Firestore
  may continue displaying previously cached contacts while offline.
- Sign out and sign into another account; confirm contacts do not cross accounts.
- Check demo mode cannot write real contacts and pending/revoked/non-contact
  records are handled according to the contract above.
- Verify server rules reject another UID's reads/writes, owner/type changes,
  invalid payloads, and client attempts to assign an unverified `targetUid`.
- On a phone, verify keyboard access, scrolling, and add/edit/delete dialogs.
