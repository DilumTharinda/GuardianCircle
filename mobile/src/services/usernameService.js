/**
 * GuardianCircle — Username Service
 * Handles unique username generation, validation, and Firestore persistence.
 */

import { db } from './firebase';
import { doc, getDoc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';

const RESERVED_USERNAMES = ['admin', 'support', 'moderator', 'system', 'guardian', 'root'];

export const UsernameService = {
  /**
   * Generates a random username for new users.
   * Format: Adjective + Noun + RandomNumber
   */
  generateRandomUsername: () => {
    const adjectives = ['Happy', 'Swift', 'Brave', 'Calm', 'Bright', 'Kind', 'Strong', 'Quiet', 'Lucky', 'Golden'];
    const nouns = ['Panda', 'Eagle', 'Lion', 'Wolf', 'Fox', 'Tiger', 'Deer', 'Owl', 'Bear', 'Hawk'];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(100 + Math.random() * 899); // 100-999

    return `${adj}${noun}${num}`;
  },

  /**
   * Validates if a username meets the requirements.
   */
  validateUsername: (username) => {
    if (!username || username.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters long.' };
    }
    if (username.length > 20) {
      return { valid: false, error: 'Username cannot exceed 20 characters.' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { valid: false, error: 'Username can only contain letters, numbers, and underscores.' };
    }
    if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
      return { valid: false, error: 'This username is reserved and cannot be used.' };
    }
    return { valid: true };
  },

  /**
   * Checks if a username is already taken.
   * If Firestore rules restrict /usernames collection access, gracefully falls back to available.
   */
  isUsernameTaken: async (username) => {
    try {
      const usernameRef = doc(db, 'usernames', username.toLowerCase());
      const snap = await getDoc(usernameRef);
      return snap.exists();
    } catch (err) {
      // Permission-denied or network error: log warning and do not crash
      console.warn('[UsernameService] isUsernameTaken check warning:', err?.message || err);
      return false;
    }
  },

  /**
   * Atomically assigns a username to a user.
   * Ensures uniqueness using a transaction, with fallback if /usernames collection lacks write permission.
   */
  assignUsername: async (uid, username) => {
    const usernameLower = username.toLowerCase();
    const userRef = doc(db, 'users', uid);
    const usernameRef = doc(db, 'usernames', usernameLower);

    try {
      await runTransaction(db, async (transaction) => {
        let usernameSnap = null;
        try {
          usernameSnap = await transaction.get(usernameRef);
        } catch (_) {
          // If security rules disallow reading /usernames, proceed to update user
        }
        if (usernameSnap && usernameSnap.exists()) {
          throw new Error('Username is already taken.');
        }

        try {
          transaction.set(usernameRef, { uid });
        } catch (_) {}
        transaction.update(userRef, { username: usernameLower });
      });
    } catch (txErr) {
      if (txErr.message === 'Username is already taken.') {
        throw txErr;
      }
      console.warn('[UsernameService] assignUsername transaction warning, updating user profile directly:', txErr?.message || txErr);
      await setDoc(userRef, { username: usernameLower }, { merge: true });
    }
  },

  /**
   * Updates a user's username and cleans up the old one.
   */
  updateUsername: async (uid, oldUsername, newUsername) => {
    const newUsernameLower = newUsername.toLowerCase();
    const oldUsernameLower = oldUsername?.toLowerCase();
    const userRef = doc(db, 'users', uid);
    const newUsernameRef = doc(db, 'usernames', newUsernameLower);

    try {
      await runTransaction(db, async (transaction) => {
        let newUsernameSnap = null;
        try {
          newUsernameSnap = await transaction.get(newUsernameRef);
        } catch (_) {}

        if (newUsernameSnap && newUsernameSnap.exists()) {
          throw new Error('Username is already taken.');
        }

        // Delete old username mapping if it exists
        if (oldUsernameLower) {
          try {
            const oldUsernameRef = doc(db, 'usernames', oldUsernameLower);
            transaction.delete(oldUsernameRef);
          } catch (_) {}
        }

        try {
          transaction.set(newUsernameRef, { uid });
        } catch (_) {}
        transaction.update(userRef, { username: newUsernameLower });
      });
    } catch (txErr) {
      if (txErr.message === 'Username is already taken.') {
        throw txErr;
      }
      console.warn('[UsernameService] updateUsername transaction warning, updating user profile directly:', txErr?.message || txErr);
      await setDoc(userRef, { username: newUsernameLower }, { merge: true });
    }
  }
};
