import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { isAdminRole } from '../constants/roles';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await firebaseUser.getIdTokenResult();
        const claimRole = tokenResult?.claims?.role;
        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        const userData = userSnap.exists() ? userSnap.data() : null;
        const effectiveRole = userData?.role || claimRole;

        if (!isAdminRole(effectiveRole)) {
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setAuthError(
            'Access denied. This portal is restricted to verified Admin/Moderator accounts.'
          );
          setLoading(false);
          return;
        }

        setAuthError('');
        setUser(firebaseUser);
        setProfile({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: userData?.displayName || firebaseUser.displayName || 'Admin',
          role: effectiveRole,
          ...userData,
        });
      } catch (err) {
        console.error('[AdminAuth] Failed to verify admin role:', err);
        await signOut(auth);
        setUser(null);
        setProfile(null);
        setAuthError(
          'Unable to verify Admin permissions. Check your network or Firestore configuration.'
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    setAuthError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const tokenResult = await credential.user.getIdTokenResult();
      const claimRole = tokenResult?.claims?.role;
      const userSnap = await getDoc(doc(db, 'users', credential.user.uid));
      const userData = userSnap.exists() ? userSnap.data() : null;
      const effectiveRole = userData?.role || claimRole;

      if (!isAdminRole(effectiveRole)) {
        await signOut(auth);
        const msg =
          'Access denied. Only accounts with the Admin/Moderator role may access this dashboard.';
        setAuthError(msg);
        throw new Error(msg);
      }
      return credential.user;
    } catch (err) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        const msg = 'Invalid email or password.';
        setAuthError(msg);
        throw new Error(msg);
      }
      if (err.code === 'auth/too-many-requests') {
        const msg = 'Too many failed login attempts. Please wait a moment and try again.';
        setAuthError(msg);
        throw new Error(msg);
      }
      setAuthError(err.message || 'Sign-in failed.');
      throw err;
    }
  };

  const logout = async () => {
    setAuthError('');
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        authError,
        setAuthError,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
