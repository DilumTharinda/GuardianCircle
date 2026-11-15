import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Vibration, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './AuthContext';
import { navigationRef } from '../navigation/navigationService';
import { ROUTES } from '../constants/routes';
import { setupNotificationChannelsAsync } from '../services/notificationService';

// Safely resolve Expo Audio without crashing if native build doesn't link ExponentAV
let ExpoAudio = null;
try {
  ExpoAudio = require('expo-av')?.Audio || null;
} catch (e) {
  ExpoAudio = null;
}

const EmergencyAlertContext = createContext({
  isEmergencyActive: false,
  activeSOS: null,
  acknowledgeAndStopSOS: () => {},
  viewOnMap: () => {},
});

// Heavy repeating emergency vibration pattern
const SOS_VIBRATION_PATTERN = [0, 600, 300, 600, 300, 800, 400];

export function EmergencyAlertProvider({ children }) {
  const { user } = useAuth();
  const [activeSOS, setActiveSOS] = useState(null);
  const isVibratingRef = useRef(false);
  const vibrationIntervalRef = useRef(null);
  const soundObjectRef = useRef(null);
  const sentNotificationAlertIds = useRef(new Set());
  const dismissedAlertIds = useRef(new Set());

  // Helper to trigger OS-level siren chime via Android high-priority SOS notification channel
  // Sends EXACTLY ONE notification per alert ID so the user is not spammed.
  const triggerNativeEmergencyChime = async (alertInfo) => {
    if (Platform.OS === 'web' || !alertInfo?.id) return;
    if (sentNotificationAlertIds.current.has(alertInfo.id)) return;
    sentNotificationAlertIds.current.add(alertInfo.id);

    try {
      await setupNotificationChannelsAsync();
      const sender = alertInfo?.userName || 'Trusted Circle Member';
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 EMERGENCY SOS ALERT!',
          body: `${sender} needs immediate help! Tap to view live location.`,
          sound: 'default',
          vibrate: SOS_VIBRATION_PATTERN,
          priority: Notifications.AndroidNotificationPriority.MAX,
          channelId: 'sos',
          data: {
            category: 'sos',
            type: 'sos',
            alertId: alertInfo?.id,
            userName: sender,
            location: alertInfo?.location,
          },
        },
        trigger: null, // deliver immediately through speaker and heads-up banner
      });
    } catch (err) {
      console.warn('[EmergencyAlertContext] Native chime notification trigger error:', err);
    }
  };

  // Helper to start continuous emergency alarm siren sound & vibration
  const startContinuousAlert = async (alertInfo) => {
    // 1. Continuous Vibration
    if (Platform.OS !== 'web') {
      try {
        if (!isVibratingRef.current) {
          isVibratingRef.current = true;
          Vibration.vibrate(SOS_VIBRATION_PATTERN, true);
          
          if (vibrationIntervalRef.current) clearInterval(vibrationIntervalRef.current);
          vibrationIntervalRef.current = setInterval(() => {
            if (isVibratingRef.current) {
              Vibration.vibrate(SOS_VIBRATION_PATTERN, false);
            }
          }, 3200);
        }
      } catch (e) {
        console.warn('[EmergencyAlertContext] Vibration trigger error:', e);
      }
    }

    // 2. Play Emergency Alarm Sound:
    // Try ExpoAudio (in-app looped audio stream) first if available
    let didPlayExpoAudio = false;
    try {
      if (ExpoAudio && !soundObjectRef.current) {
        await ExpoAudio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const { sound } = await ExpoAudio.Sound.createAsync(
          require('../../assets/sos_alarm.wav'),
          { shouldPlay: true, isLooping: true, volume: 1.0 }
        );
        soundObjectRef.current = sound;
        await sound.playAsync();
        didPlayExpoAudio = true;
      }
    } catch (soundErr) {
      console.warn('[EmergencyAlertContext] Expo Audio siren playback notice:', soundErr?.message || soundErr);
    }

    // 3. Fallback / Native Speaker Chime via Android NotificationManager ('sos' MAX priority channel):
    // If ExpoAudio is not available in the binary, trigger exactly ONE loud notification chime through the speaker
    if (!didPlayExpoAudio && Platform.OS !== 'web') {
      await triggerNativeEmergencyChime(alertInfo);
    }
  };

  // Helper to stop both vibration and siren sound completely
  const stopContinuousAlert = async () => {
    // 1. Cancel vibration
    if (Platform.OS !== 'web') {
      try {
        isVibratingRef.current = false;
        if (vibrationIntervalRef.current) {
          clearInterval(vibrationIntervalRef.current);
          vibrationIntervalRef.current = null;
        }
        Vibration.cancel();
      } catch (e) {
        console.warn('[EmergencyAlertContext] Vibration cancel error:', e);
      }
    }

    // 2. Stop and unload ExpoAudio siren sound
    try {
      if (soundObjectRef.current) {
        await soundObjectRef.current.stopAsync();
        await soundObjectRef.current.unloadAsync();
        soundObjectRef.current = null;
      }
    } catch (e) {
      soundObjectRef.current = null;
    }
  };

  // 1. Subscribe to real-time incoming circle SOS alerts targeting this user
  useEffect(() => {
    if (!user?.uid) {
      setActiveSOS(null);
      stopContinuousAlert();
      return;
    }

    let unsubFirestore = () => {};

    try {
      const q = query(
        collection(db, 'Alerts'),
        where('status', '==', 'active')
      );

      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          let foundTargetSOS = null;
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const alertId = docSnap.id;
            
            // Do not target the sender themselves with incoming emergency alert modal
            if (data.userId === user.uid) return;
            // Ignore already acknowledged alerts in this session
            if (dismissedAlertIds.current.has(alertId)) return;

            const recipientIds = data.recipientIds || [];
            if (recipientIds.includes(user.uid)) {
              foundTargetSOS = {
                id: alertId,
                ...data,
                timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp || new Date().toISOString(),
              };
            }
          });

          if (foundTargetSOS) {
            setActiveSOS(foundTargetSOS);
            startContinuousAlert(foundTargetSOS);
          } else {
            setActiveSOS(null);
            stopContinuousAlert();
          }
        },
        (err) => {
          console.warn('[EmergencyAlertContext] Firestore listener notice:', err);
        }
      );
    } catch (e) {
      console.warn('[EmergencyAlertContext] Setup subscription error:', e);
    }

    // 2. Listen to OS push notification clicks / foreground notifications
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = response.notification.request.content.data;
      if (payload && (payload.category === 'sos' || payload.type === 'sos' || payload.alertId)) {
        if (!dismissedAlertIds.current.has(payload.alertId)) {
          const alertObj = {
            id: payload.alertId,
            userName: payload.userName || 'Trusted Circle Member',
            userEmail: payload.userEmail || '',
            location: payload.location || {},
            timestamp: new Date().toISOString(),
          };
          setActiveSOS(alertObj);
          startContinuousAlert(alertObj);
        }
      }
    });

    const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
      const payload = notification.request.content.data;
      if (payload && (payload.category === 'sos' || payload.type === 'sos' || payload.alertId)) {
        if (payload.userId !== user.uid && !dismissedAlertIds.current.has(payload.alertId)) {
          const alertObj = {
            id: payload.alertId,
            userName: payload.userName || 'Trusted Circle Member',
            userEmail: payload.userEmail || '',
            location: payload.location || {},
            timestamp: new Date().toISOString(),
          };
          setActiveSOS(alertObj);
          startContinuousAlert(alertObj);
        }
      }
    });

    return () => {
      unsubFirestore();
      stopContinuousAlert();
      responseListener?.remove?.();
      receivedListener?.remove?.();
    };
  }, [user?.uid]);

  // Acknowledge SOS: stops continuous alarm siren and vibration, hides modal, resets screen back to normal
  const acknowledgeAndStopSOS = () => {
    if (activeSOS?.id) {
      dismissedAlertIds.current.add(activeSOS.id);
    }
    stopContinuousAlert();
    setActiveSOS(null);
  };

  // View on Live Map: stops vibration and navigates directly to live map screen
  const viewOnMap = () => {
    const alertData = activeSOS;
    acknowledgeAndStopSOS();
    if (navigationRef.isReady()) {
      navigationRef.navigate('Main', {
        screen: ROUTES.MAP,
        params: {
          focusAlertId: alertData?.id,
          alertLocation: alertData?.location,
        },
      });
    }
  };

  const value = {
    isEmergencyActive: !!activeSOS,
    activeSOS,
    acknowledgeAndStopSOS,
    viewOnMap,
  };

  return (
    <EmergencyAlertContext.Provider value={value}>
      {children}
    </EmergencyAlertContext.Provider>
  );
}

export function useEmergencyAlert() {
  return useContext(EmergencyAlertContext);
}

