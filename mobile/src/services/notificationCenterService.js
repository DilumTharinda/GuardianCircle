import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';

const LOCAL_READ_NOTIFS_KEY = '@guardiancircle_read_notifications';

/**
 * Real-time notification collections:
 * 1. users/{uid}/notifications -> Personalized alerts for a specific user
 * 2. broadcastNotifications    -> Community-wide and role-targeted notifications
 */
export const BROADCAST_COLLECTION = 'broadcastNotifications';

/**
 * Get locally stored set of read notification IDs (supports broadcast read state)
 */
export async function getLocalReadIds() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_READ_NOTIFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Save notification IDs to local read cache
 */
export async function saveLocalReadIds(ids = []) {
  try {
    const current = await getLocalReadIds();
    const merged = Array.from(new Set([...current, ...ids]));
    await AsyncStorage.setItem(LOCAL_READ_NOTIFS_KEY, JSON.stringify(merged));
  } catch (_) {}
}

/**
 * Subscribe to real-time personal notifications for a user
 * @param {string} uid
 * @param {function} onUpdate - callback receiving Array<Notification>
 * @returns {function} unsubscribe callback
 */
export function subscribeToPersonalNotifications(uid, onUpdate) {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }

  const notifRef = collection(db, 'users', uid, 'notifications');
  const q = query(notifRef, orderBy('createdAt', 'desc'), limit(30));

  return onSnapshot(
    q,
    async (snap) => {
      const readIds = await getLocalReadIds();
      const list = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        const isRead = data.read === true || readIds.includes(docSnap.id);
        return {
          id: docSnap.id,
          ...data,
          read: isRead,
          isPersonal: true,
        };
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('[notificationCenterService] Personal subscription error:', err?.message || err);
      onUpdate([]);
    }
  );
}

/**
 * Subscribe to real-time common & role-based broadcast notifications
 * @param {string} userRole - e.g. 'community_member', 'admin_moderator', 'parent_guardian'
 * @param {function} onUpdate - callback receiving Array<Notification>
 * @returns {function} unsubscribe callback
 */
export function subscribeToBroadcastNotifications(userRole, onUpdate) {
  const broadcastRef = collection(db, BROADCAST_COLLECTION);
  const q = query(broadcastRef, orderBy('createdAt', 'desc'), limit(30));

  return onSnapshot(
    q,
    async (snap) => {
      const readIds = await getLocalReadIds();
      const list = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const targetRoles = data.targetRoles || [];
        const isTargeted =
          targetRoles.length === 0 ||
          targetRoles.includes('all') ||
          (userRole && targetRoles.includes(userRole));

        if (isTargeted) {
          const isRead = data.read === true || readIds.includes(docSnap.id);
          list.push({
            id: docSnap.id,
            ...data,
            read: isRead,
            isPersonal: false,
          });
        }
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('[notificationCenterService] Broadcast subscription error:', err?.message || err);
      onUpdate([]);
    }
  );
}

/**
 * Dispatch a personalized notification directly to a user
 */
export async function dispatchPersonalNotification(targetUid, {
  title,
  body = '',
  message = '',
  category = 'system', // 'sos' | 'circlefind' | 'karma' | 'system'
  priority = 'normal', // 'high' | 'normal'
  data = {},
  linkRoute = null,
  linkParams = {},
}) {
  if (!targetUid || !title) return;
  const contentBody = body || message || '';
  try {
    const notifRef = collection(db, 'users', targetUid, 'notifications');
    await addDoc(notifRef, {
      title,
      body: contentBody,
      category,
      priority,
      read: false,
      data: {
        ...data,
        ...(linkRoute ? { screen: linkRoute, params: linkParams } : {}),
      },
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[notificationCenterService] dispatchPersonalNotification error:', err?.message || err);
  }
}

/**
 * Dispatch a common / community / role-based notification
 */
export async function dispatchBroadcastNotification({
  title,
  body = '',
  message = '',
  category = 'system', // 'sos' | 'circlefind' | 'community' | 'system'
  type = null,
  priority = 'normal',
  targetRoles = ['all'],
  targetRole = null,
  data = {},
  linkRoute = null,
  linkParams = {},
}) {
  if (!title) return;
  const contentBody = body || message || '';
  const finalCategory = type || category || 'system';
  const roles = targetRole ? [targetRole] : (targetRoles || ['all']);

  try {
    const broadcastRef = collection(db, BROADCAST_COLLECTION);
    await addDoc(broadcastRef, {
      title,
      body: contentBody,
      category: finalCategory,
      priority,
      targetRoles: roles,
      read: false,
      data: {
        ...data,
        ...(linkRoute ? { screen: linkRoute, params: linkParams } : {}),
      },
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[notificationCenterService] dispatchBroadcastNotification error:', err?.message || err);
  }
}

/**
 * Mark a notification as read (handles both personal and broadcast)
 */
export async function markNotificationAsRead(uid, notificationId, isPersonal = true) {
  if (!notificationId) return;
  // 1. Always record in local read store
  await saveLocalReadIds([notificationId]);

  // 2. If personal, also persist to user's subcollection
  if (uid && isPersonal) {
    try {
      const docRef = doc(db, 'users', uid, 'notifications', notificationId);
      await updateDoc(docRef, { read: true });
    } catch (_) {}
  }
}

/**
 * Mark all notifications as read (both personal and broadcast)
 */
export async function markAllNotificationsAsRead(uid, allNotifList = []) {
  if (!allNotifList || allNotifList.length === 0) return;
  const allIds = allNotifList.map((n) => (typeof n === 'string' ? n : n.id)).filter(Boolean);

  // 1. Immediately persist all IDs to local cache
  await saveLocalReadIds(allIds);

  // 2. Persist personal notifications to Firestore
  if (uid) {
    const personalIds = allNotifList
      .filter((n) => typeof n === 'object' && n.isPersonal && n.id)
      .map((n) => n.id);

    if (personalIds.length > 0) {
      try {
        const batch = writeBatch(db);
        personalIds.forEach((id) => {
          const docRef = doc(db, 'users', uid, 'notifications', id);
          batch.update(docRef, { read: true });
        });
        await batch.commit();
      } catch (err) {
        console.warn('[notificationCenterService] markAllAsRead batch error:', err?.message || err);
      }
    }
  }
}

/**
 * Delete a personal notification
 */
export async function deletePersonalNotification(uid, notificationId) {
  if (!uid || !notificationId) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'notifications', notificationId));
  } catch (err) {
    console.warn('[notificationCenterService] deletePersonalNotification error:', err?.message || err);
  }
}

