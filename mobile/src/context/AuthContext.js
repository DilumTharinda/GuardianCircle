import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { ROLES } from '../constants/roles';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Safe secure storage helper for native & web
const safeStorage = {
  async setItem(key, val) {
    try {
      if (Platform.OS !== 'web') {
        const SecureStore = require('expo-secure-store');
        await SecureStore.setItemAsync(key, val);
      } else {
        await AsyncStorage.setItem(`@sec_${key}`, val);
      }
    } catch (e) {
      await AsyncStorage.setItem(`@sec_${key}`, val);
    }
  },
  async deleteItem(key) {
    try {
      if (Platform.OS !== 'web') {
        const SecureStore = require('expo-secure-store');
        await SecureStore.deleteItemAsync(key);
      } else {
        await AsyncStorage.removeItem(`@sec_${key}`);
      }
    } catch (e) {
      await AsyncStorage.removeItem(`@sec_${key}`);
    }
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase Auth user object or Demo User
  const [userProfile, setUserProfile] = useState(null); // Firestore profile document
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state changes with safety timeout
  useEffect(() => {
    let timer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        clearTimeout(timer);
        if (firebaseUser) {
          setUser(firebaseUser);
          await loadUserProfile(firebaseUser.uid);
        } else {
          // Check if we have a demo user cached
          const savedDemo = await AsyncStorage.getItem('@demo_parent_user');
          if (savedDemo) {
            const parsed = JSON.parse(savedDemo);
            setUser(parsed.user);
            setUserProfile(parsed.profile);
          } else {
            setUser(null);
            setUserProfile(null);
          }
        }
        setLoading(false);
      });
    } catch (err) {
      clearTimeout(timer);
      setLoading(false);
    }

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  async function loadUserProfile(uid) {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setUserProfile(docSnap.data());
      }
    } catch (e) {
      console.warn('[AuthContext] Load profile fallback:', e);
    }
  }

  /**
   * 1-Click Demo Login as Parent Guardian (for offline testing without Firebase quota)
   */
  async function loginAsDemoParent() {
    const demoUser = {
      uid: 'parent_user_default',
      email: 'lavindi.parent@guardiancircle.test',
      displayName: 'Lavindi Tharunya',
    };
    const demoProfile = {
      uid: 'parent_user_default',
      email: 'lavindi.parent@guardiancircle.test',
      displayName: 'Lavindi Tharunya',
      role: ROLES.PARENT_GUARDIAN,
      photoURL: null,
      notificationPrefs: {
        sos: true,
        journey: true,
        lostFound: true,
        geofence: true,
        reminders: true,
      },
      karma: 100,
    };

    setUser(demoUser);
    setUserProfile(demoProfile);
    await AsyncStorage.setItem(
      '@demo_parent_user',
      JSON.stringify({ user: demoUser, profile: demoProfile })
    );
    return demoUser;
  }

  async function register(email, password, displayName, role) {
    if (role === ROLES.ADMIN_MODERATOR) {
      throw new Error('Admin accounts cannot be created through registration.');
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    const profileData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName,
      role,
      photoURL: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      notificationPrefs: {
        sos: true,
        journey: true,
        lostFound: true,
        geofence: true,
        reminders: true,
      },
      karma: 0,
    };

    try {
      await setDoc(doc(db, 'users', firebaseUser.uid), profileData);
    } catch (e) {
      console.warn('[AuthContext] Firestore profile save failed:', e);
    }

    const token = await firebaseUser.getIdToken();
    await safeStorage.setItem('auth_token', token);

    setUserProfile(profileData);
    return firebaseUser;
  }

  async function login(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const token = await userCredential.user.getIdToken();
    await safeStorage.setItem('auth_token', token);
    return userCredential.user;
  }

  async function logout() {
    await safeStorage.deleteItem('auth_token');
    await AsyncStorage.removeItem('@demo_parent_user');
    try {
      await signOut(auth);
    } catch (e) {}
    setUser(null);
    setUserProfile(null);
  }

  const value = {
    user,
    userProfile,
    loading,
    register,
    login,
    loginAsDemoParent,
    logout,
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