import * as Haptics from 'expo-haptics';
import { DeviceEventEmitter } from 'react-native';
import { collection, doc, setDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './firebase';
import { getCurrentCoordinates, getCachedCoordinates, DEFAULT_COORDS } from './locationService';
import { isChild } from '../constants/roles';
import { getTrustedCircleSOSRecipientIds } from './trustedCircleService';
import { getAllUserCircleMemberUids } from './trustedCircleGroupService';
import { dispatchBroadcastNotification, dispatchPersonalNotification } from './notificationCenterService';
import { sendNotificationToUsers } from './notificationService';
import { logActivity, AUDIT_ACTIONS } from './auditLogService';

const LOCAL_ALERTS_KEY = '@guardiancircle_local_alerts';

/**
 * Dispatches an Emergency SOS alert across the entire system.
 * 
 * @param {string} triggerType - One of 'in_app', 'volume_button', 'shake', 'widget', 'fall_detection'
 * @param {object} extraMeta - Any additional telemetry data (e.g. acceleration magnitude)
 * @returns {Promise<string>} The generated alert ID
 */
export async function triggerSOS(triggerType = 'in_app', extraMeta = {}) {
  let uid = 'demo_user_active';
  let userEmail = 'user@guardiancircle.test';
  let userName = 'Guardian User';
  let userRole = 'primary_user';

  // 1. Resolve User Identity
  try {
    const currentUser = auth?.currentUser;
    if (currentUser) {
      uid = currentUser.uid;
      userEmail = currentUser.email || userEmail;
      userName = currentUser.displayName || userName;
    } else {
      const demoData = await AsyncStorage.getItem('@demo_parent_user');
      if (demoData) {
        const parsed = JSON.parse(demoData);
        uid = parsed?.user?.uid || uid;
        userEmail = parsed?.user?.email || userEmail;
        userName = parsed?.user?.displayName || parsed?.profile?.displayName || userName;
        userRole = parsed?.profile?.role || userRole;
      }
    }
  } catch (e) {
    console.warn('[sosService] User profile resolution fallback:', e);
  }

  // 2. Resolve Initial Location Instantly (0ms cached memory or default)
  const immediateCachedLoc = getCachedCoordinates() || {
    lat: DEFAULT_COORDS.latitude,
    lng: DEFAULT_COORDS.longitude,
    accuracy: null,
    address: DEFAULT_COORDS.address,
  };

  const recipientIds = [];
  const linkedParents = [];

  // Launch background tasks concurrently without blocking instantaneous alert dispatch
  const backgroundTasks = (async () => {
    try {
      const linkedQuery = query(
        collection(db, 'LinkedEntities'),
        where('userId', '==', uid)
      );
      const snap = await getDocs(linkedQuery);
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.targetUserId) {
          recipientIds.push(data.targetUserId);
        }
        if (data.type === 'parent' || data.type === 'guardian') {
          linkedParents.push(data.targetUserId);
        }
      });
    } catch (dbErr) {
      console.warn('[sosService] LinkedEntities query fallback:', dbErr);
    }

    try {
      const trustedRecipientIds = await getTrustedCircleSOSRecipientIds(uid);
      trustedRecipientIds.forEach((recipientId) => {
        if (!recipientIds.includes(recipientId)) recipientIds.push(recipientId);
      });

      // Also gather all members from multi-circle groups
      const groupCircleMembers = await getAllUserCircleMemberUids(uid);
      groupCircleMembers.forEach((memberUid) => {
        if (!recipientIds.includes(memberUid)) recipientIds.push(memberUid);
      });
    } catch (error) {
      console.warn('[sosService] Trusted Circle recipient lookup unavailable:', error);
    }
  })();

  // Race quick GPS fix with 800ms limit; if GPS is still calculating, immediate cached location is used instantly
  const fastLocationPromise = Promise.race([
    getCurrentCoordinates(),
    new Promise((resolve) => setTimeout(() => resolve(immediateCachedLoc), 800)),
  ]);

  const locationData = (await fastLocationPromise) || immediateCachedLoc;

  // 4. Construct Comprehensive Alert Payload
  const alertPayload = {
    userId: uid,
    userEmail,
    userName,
    userRole,
    triggerType: triggerType || 'in_app',
    location: {
      lat: locationData.lat,
      lng: locationData.lng,
      accuracy: locationData.accuracy,
      address: locationData.address,
      altitude: locationData.altitude || null,
      speed: locationData.speed || null,
    },
    status: 'active', // 'active' | 'resolved' | 'cancelled'
    timestamp: new Date().toISOString(),
    recipientIds,
    linkedParents,
    notifiedAdminDashboard: true,
    telemetry: extraMeta || {},
  };

  // 5. Instantly generate canonical Firestore Document Reference
  // This guarantees local cache, Map markers, and Firestore share the exact same ID immediately
  const alertDocRef = doc(collection(db, 'Alerts'));
  const alertId = alertDocRef.id;

  try {
    const localAlertsRaw = await AsyncStorage.getItem(LOCAL_ALERTS_KEY);
    const localAlerts = localAlertsRaw ? JSON.parse(localAlertsRaw) : [];
    localAlerts.unshift({ id: alertId, ...alertPayload });
    await AsyncStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(localAlerts.slice(0, 50)));

    // Set currently active SOS ID for fast access
    await AsyncStorage.setItem('@guardiancircle_current_active_sos', alertId);

    // Notify app components immediately of emergency dispatch with canonical ID
    DeviceEventEmitter.emit('EMERGENCY_ALERT_UPDATED', { alertId, status: 'active', ...alertPayload });
  } catch (err) {
    console.warn('[sosService] Local storage save error:', err);
  }

  // 6. Asynchronous Cloud Sync & Notification Dispatch (Non-blocking background pipeline)
  (async () => {
    // Wait for recipient lookups if still running
    await Promise.race([backgroundTasks, new Promise((res) => setTimeout(res, 2000))]);

    // Update payload with any newly discovered recipients
    alertPayload.recipientIds = recipientIds;
    alertPayload.linkedParents = linkedParents;

    // Cloud upload to Firestore using the exact canonical docRef
    try {
      await setDoc(alertDocRef, {
        ...alertPayload,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[sosService] Firestore write background sync failed:', err);
    }

    // Audit Log activity
    logActivity({
      action: AUDIT_ACTIONS.SOS_TRIGGER,
      performedBy: uid,
      targetUid: alertId,
      targetEmail: userEmail,
      userRole,
      note: `SOS triggered via ${triggerType || 'in_app'}`,
      metadata: {
        alertId,
        triggerType: triggerType || 'in_app',
        location: {
          lat: locationData.lat,
          lng: locationData.lng,
          address: locationData.address,
        },
        recipientCount: recipientIds.length,
      },
    }).catch(() => {});

    // Send Tier-1 high-priority notification to Trusted Circle members first
    recipientIds.forEach((recipientUid) => {
      dispatchPersonalNotification(recipientUid, {
        title: '🚨 EMERGENCY SOS FROM TRUSTED CIRCLE',
        body: `${userName} triggered an Emergency SOS near ${locationData.address || 'nearby'}. Tap to track immediately.`,
        category: 'sos',
        priority: 'high',
        data: { alertId, location: locationData, userName, userId: uid },
        linkRoute: 'Map',
        linkParams: { focusAlertId: alertId, alertLocation: locationData },
      }).catch(() => {});
    });

    // Also send OS-Level Push Notification via Expo Push Gateway with MAX Priority SOS channel
    if (recipientIds.length > 0) {
      sendNotificationToUsers(recipientIds, {
        title: '🚨 EMERGENCY SOS FROM TRUSTED CIRCLE',
        body: `${userName} triggered an Emergency SOS near ${locationData.address || 'nearby'}. Tap to track immediately.`,
        category: 'sos',
        data: {
          alertId,
          userId: uid,
          userName,
          userEmail,
          location: locationData,
          category: 'sos',
          type: 'sos',
        },
      }).catch((e) => console.warn('[sosService] Push notification dispatch error:', e));
    }

    // Tier-2 Escalation: If no circle recipients exist, or after 60-second unread window, broadcast to community
    const hasCircleRecipients = recipientIds.length > 0;
    const escalateToCommunityBroadcast = () => {
      try {
        dispatchBroadcastNotification({
          title: 'Emergency SOS Broadcast',
          message: `${userName} triggered an Emergency SOS near ${locationData.address || 'nearby location'}.`,
          type: 'sos',
          priority: 'high',
          targetRole: 'all',
          linkRoute: 'Map',
          linkParams: { focusAlertId: alertId, alertLocation: locationData },
        }).catch(() => {});
      } catch (_) {}
    };

    if (!hasCircleRecipients) {
      escalateToCommunityBroadcast();
    } else {
      // 60-second escalation timer if circle contacts are unreached/offline
      setTimeout(() => {
        escalateToCommunityBroadcast();
      }, 60000);
    }
  })();

  // 7. Instant Haptic Feedback & Vibrations (Immediate response)
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch (_) {}

  console.log(`🚨 [SOS DISPATCHED] ID: ${alertId} | Trigger: ${triggerType} | Coords: ${locationData.lat}, ${locationData.lng}`);
  return alertId;
}
