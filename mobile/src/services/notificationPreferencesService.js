// src/services/notificationPreferencesService.js
//
// FR-3.3 (logic half) — Notification Preference Management
//
// Reads and updates a user's notificationPrefs object on their Firestore
// profile document (users/{uid}), which AuthContext already creates with
// this shape on registration and demo login:
//
//   notificationPrefs: {
//     sos: true,
//     journey: true,
//     lostFound: true,
//     geofence: true,
//     reminders: true,
//   }
//
// This service does not build any UI — the toggle switches are the
// leader's screen. This is only the logic underneath: validating the
// category, enforcing that SOS-class alerts can never be turned off (SRS
// requirement — see Team Guide Section 10.2), and persisting the change.

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// The only valid preference keys. Keeping this as a single source of
// truth means both the service and any screen built on top of it agree
// on what a "category" is.
export const NOTIFICATION_CATEGORIES = ['sos', 'journey', 'lostFound', 'geofence', 'reminders'];

// SOS-class alerts must always reach the user — this can never be turned
// off, regardless of what's requested.
const LOCKED_ON_CATEGORY = 'sos';

const DEFAULT_PREFERENCES = {
  sos: true,
  journey: true,
  lostFound: true,
  geofence: true,
  reminders: true,
};

/**
 * Reads a user's current notification preferences from Firestore.
 * Falls back to the default (everything on) if the profile document or
 * the notificationPrefs field doesn't exist yet.
 * @param {string} uid
 * @returns {Promise<Object>}
 */
export async function getNotificationPreferences(uid) {
  if (!uid) {
    throw new Error('getNotificationPreferences requires a uid.');
  }

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return { ...DEFAULT_PREFERENCES };
  }

  const data = snap.data();
  return { ...DEFAULT_PREFERENCES, ...(data.notificationPrefs ?? {}) };
}

/**
 * Updates a single notification category for a user.
 * SOS is always forced to true, no matter what value is passed in — this
 * enforces the SRS requirement that SOS-class alerts can never be
 * disabled by the user.
 * @param {string} uid
 * @param {string} category - One of NOTIFICATION_CATEGORIES.
 * @param {boolean} enabled
 * @returns {Promise<Object>} The full preferences object after the update.
 */
export async function updateNotificationPreference(uid, category, enabled) {
  if (!uid) {
    throw new Error('updateNotificationPreference requires a uid.');
  }
  if (!NOTIFICATION_CATEGORIES.includes(category)) {
    throw new Error(`Unknown notification category: "${category}".`);
  }

  const safeValue = category === LOCKED_ON_CATEGORY ? true : Boolean(enabled);

  await updateDoc(doc(db, 'users', uid), {
    [`notificationPrefs.${category}`]: safeValue,
  });

  return getNotificationPreferences(uid);
}