import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyMockKeyForOfflineDevelopmentOnly123',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'guardiancircle-dev.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'guardiancircle-dev',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'guardiancircle-dev.appspot.com',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:123456789:web:mock123',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(
  app,
  process.env.REACT_APP_FIREBASE_FUNCTIONS_REGION || 'us-central1'
);

if (process.env.REACT_APP_USE_FIREBASE_EMULATORS === 'true') {
  const host = process.env.REACT_APP_FIREBASE_EMULATOR_HOST || 'localhost';
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
  } catch (err) {
    // Emulators may already be connected during HMR
  }
}

export const isFirebaseConfigured = Boolean(process.env.REACT_APP_FIREBASE_API_KEY);

export { app, auth, db, functions };
