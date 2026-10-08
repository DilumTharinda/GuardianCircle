// src/services/notificationService.js
//
// Cross-cutting: Standardize notification behavior across every module
// (Team Guide Section 10.2/10.3, Step 4)
//
// WHY THIS FILE EXISTS
// As of this audit, no module (SOS, parent-child, lost & found) actually
// sends a push notification anywhere — alertService.js only manages
// status, sosService.js logs to the console instead of notifying anyone,
// and parentChildService.js writes to local mock storage only. This file
// is the ONE place notification-sending logic should live, so every
// module calls through the same path instead of each reinventing it
// differently. It does not change any other member's files — see
// NOTIFICATION_STANDARDIZATION_NOTES.md for what each module owner
// should wire up.
//
// WHAT THIS GIVES OTHER MODULES
//   - registerForPushNotificationsAsync(uid): call once after login to
//     get this device's push token and save it to the user's profile.
//   - sendNotificationToUser(uid, { title, body, data, category }):
//     the standard way to notify one user. Looks up their push token AND
//     their notification preferences (via notificationPreferencesService,
//     FR-3.3) and skips sending if they've turned that category off —
//     except 'sos', which always sends regardless of preference.
//   - sendNotificationToUsers(uids, {...}): same, for a list of
//     recipients (e.g. a whole Trusted Circle).
//
// WHAT THIS DOES NOT DO
// Expo's push API is called directly from the client here, which matches
// how the rest of this codebase talks to Firebase directly (no backend
// server exists in this project). For a production app this send step
// would normally happen server-side (e.g. a Cloud Function) so a device
// can't spoof notifications to other users — worth flagging to the team,
// not something to silently "fix" by adding backend infrastructure here.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getNotificationPreferences } from './notificationPreferencesService';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Maps a notification's category to the FR-3.3 preference key that gates
// it. Any category not listed here is always sent (fail open, not
// silently dropped) — but 'sos' is explicitly pinned to make the
// "always delivered" requirement obvious in code, not just by omission.
const CATEGORY_TO_PREFERENCE_KEY = {
  sos: 'sos',
  geofence: 'geofence',
  journey: 'journey',
  lost_found: 'lostFound',
  reminder: 'reminders',
};
const ALWAYS_SEND_CATEGORY = 'sos';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests OS-level notification permission and registers this device
 * for push notifications, saving the Expo push token to the user's
 * Firestore profile (users/{uid}.pushToken). Call this once, right after
 * login — per the team's permission pattern (Team Guide Section 5.3,
 * Step 4: request permissions only when the feature actually needs them,
 * not all at launch).
 * @param {string} uid
 * @returns {Promise<string|null>} The push token, or null if permission
 *   was denied or this is running on a simulator/emulator without push
 *   capability.
 */
export async function registerForPushNotificationsAsync(uid) {
  if (!uid) {
    throw new Error('registerForPushNotificationsAsync requires a uid.');
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('sos', {
      name: 'Emergency SOS Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let tokenData;
  try {
    tokenData = await Notifications.getExpoPushTokenAsync();
  } catch (err) {
    console.warn('[notificationService] Could not get push token (likely a simulator):', err);
    return null;
  }

  const pushToken = tokenData.data;

  try {
    await updateDoc(doc(db, 'users', uid), { pushToken });
  } catch (err) {
    console.warn('[notificationService] Failed to save push token to profile:', err);
  }

  return pushToken;
}

async function sendExpoPushMessage(pushToken, { title, body, data }) {
  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data ?? {},
      priority: 'high',
    }),
  });

  if (!response.ok) {
    throw new Error(`Expo push send failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * The standard way to notify one user, from any module. Respects their
 * saved notification preferences (FR-3.3) — except 'sos', which is
 * always delivered regardless of what the user has toggled off.
 * @param {string} uid - Recipient's user id.
 * @param {Object} notification
 * @param {string} notification.title
 * @param {string} notification.body
 * @param {Object} [notification.data] - Extra payload (e.g. { alertId, screen }).
 * @param {'sos'|'journey'|'lost_found'|'geofence'|'reminder'} notification.category
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendNotificationToUser(uid, { title, body, data, category }) {
  if (!uid) {
    return { sent: false, reason: 'missing_uid' };
  }

  const preferenceKey = CATEGORY_TO_PREFERENCE_KEY[category];
  if (category !== ALWAYS_SEND_CATEGORY && preferenceKey) {
    try {
      const prefs = await getNotificationPreferences(uid);
      if (prefs[preferenceKey] === false) {
        return { sent: false, reason: 'user_opted_out' };
      }
    } catch (err) {
      // If we can't read preferences, fail open rather than silently
      // dropping a potentially important notification.
      console.warn('[notificationService] Could not read preferences, sending anyway:', err);
    }
  }

  let pushToken;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    pushToken = snap.exists() ? snap.data().pushToken : null;
  } catch (err) {
    console.warn('[notificationService] Could not look up push token:', err);
    return { sent: false, reason: 'lookup_failed' };
  }

  if (!pushToken) {
    return { sent: false, reason: 'no_push_token' };
  }

  try {
    await sendExpoPushMessage(pushToken, { title, body, data });
    return { sent: true };
  } catch (err) {
    console.warn('[notificationService] Send failed:', err);
    return { sent: false, reason: 'send_failed' };
  }
}

/**
 * Same as sendNotificationToUser, for multiple recipients at once (e.g.
 * a whole Trusted Circle, or every linked parent of a child).
 * @param {string[]} uids
 * @param {Object} notification - Same shape as sendNotificationToUser's second argument.
 * @returns {Promise<Array<{uid: string, sent: boolean, reason?: string}>>}
 */
export async function sendNotificationToUsers(uids, notification) {
  const results = await Promise.all(
    (uids ?? []).map(async (uid) => ({
      uid,
      ...(await sendNotificationToUser(uid, notification)),
    }))
  );
  return results;
}