import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export async function triggerSOS(triggerType) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user for SOS trigger');

  // 1. Capture location
  const { status } = await Location.requestForegroundPermissionsAsync();
  let coords = null;
  if (status === 'granted') {
    const pos = await Location.getCurrentPositionAsync({});
    coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  // 2. TEMPORARY stub — replace once Member 3's trusted circle service exists
  const recipients = [];

  // 3. Write the alert document
  const db = getFirestore();
  const alertRef = await addDoc(collection(db, 'Alerts'), {
    userId: user.uid,
    triggerType,
    location: coords,
    timestamp: serverTimestamp(),
    status: 'active',
    recipientIds: recipients.map(r => r.id),
    notifiedAdminDashboard: true,
  });

  // 4. Local feedback — vibration only for now, no sound
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

  return alertRef.id;
}