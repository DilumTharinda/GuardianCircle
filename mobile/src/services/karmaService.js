import { doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Adds karma points to a user's profile. Safe to call on ANY user's
 * profile (not just your own) — this is specifically for cases like
 * "give the person who returned my item some points". The underlying
 * Firestore rule only allows this write to touch the karmaScore field,
 * nothing else on that user's profile can be changed this way.
 */
export async function awardKarma(uid, points) {
  if (!uid || !points) return;

  try {
    await updateDoc(doc(db, 'users', uid), {
      karmaScore: increment(points),
    });
  } catch (error) {
    console.log('Error awarding karma:', error.message);
  }
}

/**
 * Reads a single user's current karma score. Returns 0 if the user
 * has never earned any karma yet (field doesn't exist).
 */
export async function getKarmaScore(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data().karmaScore || 0;
    }
    return 0;
  } catch (error) {
    console.log('Error fetching karma score:', error.message);
    return 0;
  }
}