import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { ROLES } from '../constants/roles';
import * as SecureStore from 'expo-secure-store';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);         // Firebase Auth user object
  const [userProfile, setUserProfile] = useState(null); // Firestore profile document
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await loadUserProfile(firebaseUser.uid);
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe; // cleanup on unmount
  }, []);

  async function loadUserProfile(uid) {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setUserProfile(docSnap.data());
    }
  }

  /**
   * Register a new user with email/password.
   * Creates both a Firebase Auth account and a Firestore profile document.
   * The Admin role is never accepted here — it is set only via backend.
   */
  async function register(email, password, displayName, role) {
    // Safety guard: reject any attempt to self-assign Admin role
    if (role === ROLES.ADMIN_MODERATOR) {
      throw new Error('Admin accounts cannot be created through registration.');
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Create the Firestore user profile document
    const profileData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName,
      role,
      photoURL: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      notificationPrefs: {
        sos: true,          // SOS alerts: ALWAYS true, cannot be toggled off
        journey: true,
        lostFound: true,
        geofence: true,
        reminders: true,
      },
      karma: 0,
    };

    await setDoc(doc(db, 'users', firebaseUser.uid), profileData);

    // Store the session token securely (not in plain AsyncStorage)
    const token = await firebaseUser.getIdToken();
    await SecureStore.setItemAsync('auth_token', token);

    setUserProfile(profileData);
    return firebaseUser;
  }

  /**
   * Log in an existing user.
   */
  async function login(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const token = await userCredential.user.getIdToken();
    await SecureStore.setItemAsync('auth_token', token);
    return userCredential.user;
  }

  /**
   * Log out the current user.
   */
  async function logout() {
    await SecureStore.deleteItemAsync('auth_token');
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
  }

  /**
   * Refresh the ID token and store it securely.
   * Call this before any sensitive backend operation.
   */
  async function refreshToken() {
    if (user) {
      const token = await user.getIdToken(true); // force refresh
      await SecureStore.setItemAsync('auth_token', token);
      return token;
    }
    return null;
  }

  const value = {
    user,
    userProfile,
    loading,
    register,
    login,
    logout,
    refreshToken,
    loadUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}