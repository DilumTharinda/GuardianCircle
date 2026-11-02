import { auth, db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import { ROLES } from '../constants/roles';

export async function requireTrackingRole(role) {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) throw new Error('Sign in with a verified account.');
  const profile = await getDoc(doc(db, 'users', user.uid));
  if (!profile.exists() || profile.data().role !== role) throw new Error('This action is unavailable for your account role.');
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your session changed. Please retry.');
  return { ...profile.data(), uid: user.uid };
}

// The child shares their account ID directly. No searchable user directory is exposed.
export async function sendLinkRequest(parentProfile, childUser) {
  const parent = await requireTrackingRole(ROLES.PARENT_GUARDIAN);
  const targetUid = childUser?.id?.trim();
  if (!targetUid || targetUid.includes('/') || targetUid === parent.uid || targetUid.length > 128) {
    throw new Error('Enter the account ID shown on the child device.');
  }
  const ref = doc(db, 'm5Links', `${parent.uid}_${targetUid}`);
  await runTransaction(db, async transaction => {
    const previous = await transaction.get(ref);
    if (previous.exists() && ['pending', 'active'].includes(previous.data().status)) {
      throw new Error('A request or active link already exists for this child.');
    }
    transaction.set(ref, {
      ownerUid: parent.uid, ownerName: parent.displayName || 'Parent', targetUid,
      targetName: 'Child', type: 'child', status: 'pending', safeZones: [],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
  return { id: ref.id, targetName: 'Child' };
}

export async function getPendingRequests(childUid) {
  const child = await requireTrackingRole(ROLES.CHILD_DEPENDENT);
  if (childUid !== child.uid) throw new Error('Access denied.');
  const snapshot = await getDocs(query(collection(db, 'm5Links'), where('targetUid', '==', child.uid)));
  return snapshot.docs.map(d => ({ ...d.data(), id: d.id })).filter(d => d.status === 'pending');
}

async function respondToLink(linkId, status) {
  const child = await requireTrackingRole(ROLES.CHILD_DEPENDENT);
  const ref = doc(db, 'm5Links', linkId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().targetUid !== child.uid || snapshot.data().status !== 'pending') {
      throw new Error('This pending request is unavailable.');
    }
    transaction.update(ref, { status, targetName: child.displayName || 'Child', updatedAt: serverTimestamp() });
  });
}
export const acceptLinkRequest = linkId => respondToLink(linkId, 'active');
export const rejectLinkRequest = linkId => respondToLink(linkId, 'rejected');
export async function revokeChildLink(linkId) {
  const child = await requireTrackingRole(ROLES.CHILD_DEPENDENT);
  const ref = doc(db, 'm5Links', linkId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().targetUid !== child.uid || snapshot.data().status !== 'active') throw new Error('This active link is unavailable.');
    transaction.update(ref, { status: 'revoked', updatedAt: serverTimestamp() });
  });
}
