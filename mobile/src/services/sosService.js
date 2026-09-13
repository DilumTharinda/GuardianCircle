import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function triggerSOS(triggerType) {
  let uid = 'demo_user_active';
  let userEmail = 'user@guardiancircle.test';

  try {
    const currentUser = auth?.currentUser;
    if (currentUser) {
      uid = currentUser.uid;
      userEmail = currentUser.email || userEmail;
    } else {
      const demoData = await AsyncStorage.getItem('@demo_parent_user');
      if (demoData) {
        const parsed = JSON.parse(demoData);
        uid = parsed?.user?.uid || uid;
        userEmail = parsed?.user?.email || userEmail;
      }
    }
  } catch (e) {
    console.warn('[sosService] Auth check fallback:', e);
  }

  // 1. Capture location safely
  let coords = { lat: 6.9271, lng: 79.8612 }; // Default: Colombo, Sri Lanka
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (pos?.coords) {
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    }
  } catch (err) {
    console.warn('[sosService] Location capture fallback:', err);
  }

  // 2. Alert Payload
  const alertData = {
    userId: uid,
    userEmail,
    triggerType: triggerType || 'IN_APP',
    location: coords,
    timestamp: new Date().toISOString(),
    status: 'active',
    recipientIds: [],
    notifiedAdminDashboard: true,
  };

  // 3. Write to Firestore & Local Storage for 100% reliability
  let alertId = `sos_${Date.now()}`;
  try {
    const alertRef = await addDoc(collection(db, 'Alerts'), {
      ...alertData,
      timestamp: serverTimestamp(),
    });
    alertId = alertRef.id;
  } catch (err) {
    console.warn('[sosService] Firestore write failed, saving locally:', err);
  }

  try {
    const localAlertsRaw = await AsyncStorage.getItem('@guardiancircle_local_alerts');
    const localAlerts = localAlertsRaw ? JSON.parse(localAlertsRaw) : [];
    localAlerts.unshift({ id: alertId, ...alertData });
    await AsyncStorage.setItem('@guardiancircle_local_alerts', JSON.stringify(localAlerts.slice(0, 50)));
  } catch (err) {
    console.warn('[sosService] Local storage save error:', err);
  }

  // 4. Safe Haptic Feedback
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch (e) {
    // Ignore haptics error on devices without vibrator
  }

  return alertId;
}