import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser
} from 'firebase/auth';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { ROLES } from '../constants/roles';
import AsyncStorage from '@react-native-async-storage/async-storage';

let GoogleSignin = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy-web-client-id.apps.googleusercontent.com',
    offlineAccess: true,
  });
} catch (e) {
  console.warn('GoogleSignin native module not found. It will not work in standard Expo Go.');
}

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
  const [userRefreshKey, setUserRefreshKey] = useState(0);

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

    try {
      await sendEmailVerification(firebaseUser);
    } catch (e) {
      console.warn('[AuthContext] Failed to send verification email:', e);
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

  async function checkAndCreateGoogleProfile(firebaseUser) {
    const docRef = doc(db, 'users', firebaseUser.uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      const profileData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || 'Guardian User',
        role: ROLES.PRIMARY_USER,
        photoURL: firebaseUser.photoURL || null,
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
      await setDoc(docRef, profileData);
      setUserProfile(profileData);
    } else {
      setUserProfile(docSnap.data());
    }
  }

  async function updateUserProfile(newDisplayName, newRole, password, photoURL = null) {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('No authenticated user found.');
    
    if (firebaseUser.uid === 'parent_user_default') {
      throw new Error('Cannot edit the demo user.');
    }

    // Re-authenticate if role changed
    if (newRole !== userProfile.role) {
      const isGoogle = firebaseUser.providerData.some(p => p.providerId === 'google.com');
      if (!isGoogle) {
        if (!password) {
          throw new Error('Password is required to change your role.');
        }
        try {
          const credential = EmailAuthProvider.credential(firebaseUser.email, password);
          await reauthenticateWithCredential(firebaseUser, credential);
        } catch (e) {
          if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
            throw new Error('Incorrect password.');
          } else if (e.code === 'auth/requires-recent-login') {
            throw new Error('For security reasons, you must log out and log back in before changing your role.');
          }
          throw e;
        }
      }
    }

    // Update Firestore data
    try {
      const updateData = {
        displayName: newDisplayName,
        role: newRole,
        updatedAt: serverTimestamp(),
      };
      
      if (photoURL !== undefined) {
        updateData.photoURL = photoURL;
      }

      await setDoc(doc(db, 'users', firebaseUser.uid), updateData, { merge: true });
      
      setUserProfile(prev => ({
        ...prev,
        displayName: newDisplayName,
        role: newRole,
        ...(photoURL !== undefined && { photoURL }),
      }));
    } catch (e) {
      console.warn('[AuthContext] Failed to update Firestore profile', e);
      throw new Error('Failed to update profile. Make sure you updated the Firestore Rules to allow role changes.');
    }
  }

  async function loginWithGoogle() {
    if (Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await checkAndCreateGoogleProfile(userCredential.user);
      const token = await userCredential.user.getIdToken();
      await safeStorage.setItem('auth_token', token);
      return userCredential.user;
    } else {
      if (!GoogleSignin) {
        throw new Error('Google Sign-In is not available in Expo Go. Please build a custom dev client.');
      }
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const { data } = await GoogleSignin.signIn();
        const idToken = data?.idToken;
        
        if (!idToken) {
          throw new Error('No ID token found!');
        }

        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(auth, credential);
        await checkAndCreateGoogleProfile(userCredential.user);
        
        const token = await userCredential.user.getIdToken();
        await safeStorage.setItem('auth_token', token);
        return userCredential.user;
      } catch (error) {
        console.warn('Google Sign-In Error:', error);
        throw error;
      }
    }
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

  async function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  async function reloadUser() {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUserRefreshKey(prev => prev + 1);
      return auth.currentUser.emailVerified;
    }
    return false;
  }

  async function resendVerificationEmail() {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  }

  async function deleteUserAccount(password) {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('No authenticated user found.');
    
    if (firebaseUser.uid === 'parent_user_default') {
      throw new Error('Cannot delete the demo user.');
    }

    // Re-authenticate
    try {
      const isGoogle = firebaseUser.providerData.some(p => p.providerId === 'google.com');
      
      if (!isGoogle) {
        if (!password) {
          throw new Error('Password is required to delete this account.');
        }
        const credential = EmailAuthProvider.credential(firebaseUser.email, password);
        await reauthenticateWithCredential(firebaseUser, credential);
      }
    } catch (e) {
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
        throw new Error('Incorrect password.');
      } else if (e.code === 'auth/requires-recent-login') {
        throw new Error('For security reasons, you must log out and log back in before deleting your account.');
      }
      throw e;
    }

    // Delete Firestore data
    try {
      await deleteDoc(doc(db, 'users', firebaseUser.uid));
    } catch (e) {
      console.warn('[AuthContext] Failed to delete Firestore profile', e);
    }

    // Delete Firebase Auth user
    try {
      await deleteUser(firebaseUser);
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        throw new Error('For security reasons, you must log out and log back in before deleting your account.');
      }
      throw e;
    }
    
    // Clear local state
    await safeStorage.deleteItem('auth_token');
    setUser(null);
    setUserProfile(null);
  }

  const value = {
    user,
    userProfile,
    loading,
    userRefreshKey,
    register,
    login,
    loginWithGoogle,
    loginAsDemoParent,
    logout,
    loadUserProfile,
    resetPassword,
    reloadUser,
    resendVerificationEmail,
    deleteUserAccount,
    updateUserProfile,
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