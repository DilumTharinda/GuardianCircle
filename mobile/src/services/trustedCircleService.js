import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';

const COLLECTION = 'linkedEntities';
const CONTACT_TYPE = 'trusted_contact';
const VISIBLE_STATUSES = ['active', 'pending'];

function contactError(code, message) {
  const error = new Error(message);
  error.code = `trusted-circle/${code}`;
  return error;
}

function assertCurrentUser(uid) {
  if (typeof uid !== 'string' || !uid.trim() || !auth.currentUser) {
    throw contactError('auth-required', 'Sign in to manage your trusted contacts.');
  }
  if (auth.currentUser.uid !== uid) {
    throw contactError('session-changed', 'Your session changed. Sign in again to continue.');
  }
}

/** Shared by the form and all writes; phone numbers are stored without formatting. */
export function validateTrustedContact(form = {}) {
  const targetName = typeof form?.targetName === 'string' ? form.targetName.trim() : '';
  const rawPhone = typeof form?.targetPhone === 'string' ? form.targetPhone.trim() : '';
  const targetPhone = rawPhone.replace(/[\s().-]/g, '');
  const relationship = typeof form?.relationship === 'string' ? form.relationship.trim() : '';
  const errors = {};

  if (!targetName) errors.targetName = 'Enter the contact name.';
  else if (targetName.length > 80) errors.targetName = 'Use 80 characters or fewer for the name.';

  if (!rawPhone) errors.targetPhone = 'Enter a phone number.';
  else if (!/^\+?[0-9]{7,15}$/.test(targetPhone)) {
    errors.targetPhone = 'Use 7 to 15 digits, with an optional + country code.';
  }

  if (relationship.length > 40) {
    errors.relationship = 'Use 40 characters or fewer for the relationship.';
  }

  return { values: { targetName, targetPhone, relationship }, errors };
}

function validatedValues(form) {
  const { values, errors } = validateTrustedContact(form);
  if (Object.keys(errors).length) {
    const error = contactError('invalid-contact', 'Check the contact details and try again.');
    error.validationErrors = errors;
    throw error;
  }
  return values;
}

function contactsQuery(uid) {
  // Filter type/status locally so this shared collection needs no composite index.
  return query(collection(db, COLLECTION), where('ownerUid', '==', uid));
}

function mapContacts(snapshot, uid) {
  return snapshot.docs
    .map((contact) => ({ ...contact.data(), id: contact.id }))
    .filter((contact) => contact.ownerUid === uid
      && contact.type === CONTACT_TYPE
      && VISIBLE_STATUSES.includes(contact.status))
    .sort((a, b) => String(a.targetName || '').localeCompare(String(b.targetName || '')));
}

/**
 * Shared contact source for Trusted Circle and Member 2 SOS.
 * The document id identifies a contact record, never a recipient Firebase UID.
 * targetUid stays null until a separate verified account-linking flow fills it.
 */
export async function getTrustedContacts(uid) {
  assertCurrentUser(uid);
  const snapshot = await getDocs(contactsQuery(uid));
  assertCurrentUser(uid);
  return mapContacts(snapshot, uid);
}

/** Ends the subscription and clears visible contacts on sign-out/account change. */
export function subscribeTrustedContacts(uid, onContacts, onError) {
  let stopped = false;
  let stopSnapshot = () => {};
  let stopAuth = () => {};

  const unsubscribe = () => {
    if (stopped) return;
    stopped = true;
    stopSnapshot();
    stopAuth();
  };

  const fail = (error) => {
    if (stopped) return;
    unsubscribe();
    onContacts([]);
    onError(error);
  };

  try {
    assertCurrentUser(uid);
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== uid || auth.currentUser?.uid !== uid) {
        fail(contactError('session-changed', 'Your session changed. Sign in again to continue.'));
      }
    }, fail);
    // Also support an immediately delivered listener error before registration returns.
    if (stopped) {
      authUnsubscribe();
      return unsubscribe;
    }
    stopAuth = authUnsubscribe;

    const snapshotUnsubscribe = onSnapshot(contactsQuery(uid), (snapshot) => {
      if (stopped) return;
      try {
        assertCurrentUser(uid);
      } catch (error) {
        fail(error);
        return;
      }
      onContacts(mapContacts(snapshot, uid));
    }, fail);
    if (stopped) snapshotUnsubscribe();
    else stopSnapshot = snapshotUnsubscribe;
  } catch (error) {
    fail(error);
  }

  return unsubscribe;
}

export async function addTrustedContact(uid, form) {
  assertCurrentUser(uid);
  const values = validatedValues(form);
  const contact = doc(collection(db, COLLECTION));
  // Transactions require the server, so offline saves reject instead of leaving
  // a queued write and an indefinitely pending form. Auto-IDs need no missing-doc
  // read, which would be denied by owner-only read rules.
  await runTransaction(db, async (transaction) => {
    assertCurrentUser(uid);
    transaction.set(contact, {
      ...values,
      type: CONTACT_TYPE,
      ownerUid: uid,
      targetUid: null,
      targetPhotoURL: null,
      permissions: { viewLocation: false, receiveSOS: true, receiveJourney: false },
      status: 'active',
      linkedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  assertCurrentUser(uid);
  return contact.id;
}

function contactRef(id) {
  if (typeof id !== 'string' || !id.trim() || id.includes('/')) {
    throw contactError('invalid-contact', 'Choose a valid trusted contact.');
  }
  return doc(db, COLLECTION, id);
}

async function mutateTrustedContact(uid, id, mutate) {
  assertCurrentUser(uid);
  const ref = contactRef(id);
  await runTransaction(db, async (transaction) => {
    assertCurrentUser(uid);
    const snapshot = await transaction.get(ref);
    assertCurrentUser(uid);
    if (!snapshot.exists()) {
      throw contactError('not-found', 'This contact no longer exists. Refresh your circle.');
    }
    const contact = snapshot.data();
    if (contact.ownerUid !== uid || contact.type !== CONTACT_TYPE) {
      throw contactError('permission-denied', 'You cannot change this trusted contact.');
    }
    if (!VISIBLE_STATUSES.includes(contact.status)) {
      throw contactError('not-found', 'This contact is no longer in your circle.');
    }
    mutate(transaction, ref);
  });
  assertCurrentUser(uid);
}

export async function updateTrustedContact(uid, id, form) {
  assertCurrentUser(uid);
  const values = validatedValues(form);
  await mutateTrustedContact(uid, id, (transaction, ref) => {
    // Preserve targetUid, permissions and the original linkedAt timestamp.
    transaction.update(ref, { ...values, updatedAt: serverTimestamp() });
  });
}

export async function deleteTrustedContact(uid, id) {
  await mutateTrustedContact(uid, id, (transaction, ref) => transaction.delete(ref));
}

/** Avoid exposing raw Firebase errors, paths or configuration in the UI. */
export function getTrustedCircleErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
  switch (code) {
    case 'auth-required':
    case 'unauthenticated':
      return 'Sign in to manage your trusted contacts.';
    case 'session-changed':
      return 'Your session changed. Sign in again to continue.';
    case 'permission-denied':
      return 'Your account cannot access these contacts. Check your sign-in or contact support.';
    case 'invalid-contact':
    case 'invalid-argument':
      return 'Check the contact details and try again.';
    case 'not-found':
      return 'This contact is no longer available. Refresh your circle.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Cannot reach your trusted circle. Check your connection and try again.';
    default:
      return 'Could not update your trusted circle. Please try again.';
  }
}
