import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, browserLocalPersistence, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const useEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
if (useEmulators && !__DEV__) {
  throw new Error('Local Firebase emulators are available only in development builds.');
}
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?.trim();
if (useEmulators && (!emulatorHost || /[\s/:]/.test(emulatorHost))) {
  throw new Error('Set EXPO_PUBLIC_FIREBASE_EMULATOR_HOST to your computer hostname or IPv4 address, without a port.');
}

const firebaseConfig = useEmulators ? {
  apiKey: 'demo-local-only',
  authDomain: 'demo-guardiancircle-m5.firebaseapp.com',
  projectId: 'demo-guardiancircle-m5',
  storageBucket: 'demo-guardiancircle-m5.appspot.com',
  appId: '1:000000000000:web:local-only',
} : {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyMockKeyForOfflineDevelopmentOnly123',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'guardiancircle-dev.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'guardiancircle-dev',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'guardiancircle-dev.appspot.com',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:123456789:web:mock123',
};

// Prevent re-initialization on hot reload
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.warn('[Firebase] Fallback initialization:', e);
  app = getApp();
}

// Auth with persistence (handles web and native seamlessly)
let auth;
try {
  const persistence =
    Platform.OS === 'web'
      ? browserLocalPersistence
      : getReactNativePersistence(AsyncStorage);
  auth = initializeAuth(app, {
    persistence,
  });
} catch (e) {
  // If already initialized
  const { getAuth } = require('firebase/auth');
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

// Mark connected instances so Fast Refresh cannot reconnect an existing SDK instance.
if (useEmulators && !auth.__guardianLocalEmulator) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  auth.__guardianLocalEmulator = true;
}
if (useEmulators && !db.__guardianLocalEmulator) {
  connectFirestoreEmulator(db, emulatorHost, 8080);
  db.__guardianLocalEmulator = true;
}

export { app, auth, db, storage };
