import * as Haptics from 'expo-haptics';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './firebase';
import { getCurrentCoordinates } from './locationService';
import { isChild } from '../constants/roles';

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

  // 2. Fetch Linked Entities (Trusted Contacts and Parents if Child Account)
  const recipientIds = [];
  const linkedParents = [];

  try {
    // Check if Child account
    const isChildAccount = isChild(userRole);

    // Query LinkedEntities from Firestore
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

    // Also check local AsyncStorage cache for mock trusted contacts / parents
    const localContactsRaw = await AsyncStorage.getItem('@guardiancircle_trusted_contacts');
    if (localContactsRaw) {
      const localContacts = JSON.parse(localContactsRaw);
      localContacts.forEach((c) => {
        if (c.id && !recipientIds.includes(c.id)) {
          recipientIds.push(c.id);
        }
      });
    }

    // Default fallback contacts for safety demo if empty
    if (recipientIds.length === 0) {
      recipientIds.push('contact_emergency_lead_01', 'contact_campus_security_02');
    }
  } catch (err) {
    console.warn('[sosService] Error gathering recipients:', err);
  }

  // 3. Capture high-accuracy GPS coordinates & address
  const locationData = await getCurrentCoordinates();

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

  // 5. Write to Firestore `Alerts` collection
  let alertId = `sos_${Date.now()}`;
  try {
    const alertRef = await addDoc(collection(db, 'Alerts'), {
      ...alertPayload,
      timestamp: serverTimestamp(),
    });
    alertId = alertRef.id;
  } catch (err) {
    console.warn('[sosService] Firestore write failed, stored in reliable local cache:', err);
  }

  // 6. Write to Offline / Local Storage Cache
  try {
    const localAlertsRaw = await AsyncStorage.getItem(LOCAL_ALERTS_KEY);
    const localAlerts = localAlertsRaw ? JSON.parse(localAlertsRaw) : [];
    localAlerts.unshift({ id: alertId, ...alertPayload });
    await AsyncStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(localAlerts.slice(0, 50)));

    // Set currently active SOS ID for fast access
    await AsyncStorage.setItem('@guardiancircle_current_active_sos', alertId);
  } catch (err) {
    console.warn('[sosService] Local storage save error:', err);
  }

  // 7. Trigger Heavy Haptic Feedback Pattern
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // Double pulse
    setTimeout(async () => {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (e) {}
    }, 200);
  } catch (e) {
    // Graceful fallback on devices without hardware vibrator
  }

  console.log(`🚨 [SOS DISPATCHED] ID: ${alertId} | Trigger: ${triggerType} | Coords: ${locationData.lat}, ${locationData.lng}`);
  return alertId;
}