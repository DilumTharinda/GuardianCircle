import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  orderBy,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  sendPersonalNotification,
  notifyCircleMembers,
} from './notificationCenterService';
import { ROUTES } from '../constants/routes';
import { logActivity, AUDIT_ACTIONS } from './auditLogService';

export const TRUSTED_CIRCLES_COLLECTION = 'trustedCircles';

/**
 * Creates a new Trusted Circle with the calling user as the group Admin.
 */
export async function createTrustedCircle(creatorUser, circleName) {
  if (!creatorUser?.uid) throw new Error('User must be signed in to create a circle.');
  const trimmedName = (circleName || '').trim();
  if (!trimmedName) throw new Error('Please enter a circle name.');

  const circleDocRef = doc(collection(db, TRUSTED_CIRCLES_COLLECTION));
  const circleId = circleDocRef.id;

  const adminMember = {
    uid: creatorUser.uid,
    role: 'admin',
    displayName: creatorUser.displayName || 'Circle Admin',
    email: creatorUser.email || '',
    username: creatorUser.username || '',
    photoURL: creatorUser.photoURL || null,
    joinedAt: new Date().toISOString(),
  };

  const circleData = {
    id: circleId,
    name: trimmedName,
    createdBy: creatorUser.uid,
    createdByName: creatorUser.displayName || 'Admin',
    adminUids: [creatorUser.uid],
    memberUids: [creatorUser.uid],
    members: [adminMember],
    chatMessages: [],
    pendingInvites: [],
    settings: {
      shareLiveLocation: true,
      sosAlertAllMembers: true,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(circleDocRef, circleData);

  logActivity({
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    performedBy: creatorUser.uid,
    targetUid: circleId,
    note: `Created Trusted Circle "${trimmedName}"`,
  }).catch(() => {});

  return circleData;
}

/**
 * Subscribe to all circles the user is an active member of.
 */
export function subscribeUserCircles(uid, onUpdate) {
  if (!uid) return () => {};

  const q = query(
    collection(db, TRUSTED_CIRCLES_COLLECTION),
    where('memberUids', 'array-contains', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const circles = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Deduplicate members array by uid to prevent duplicate keys or duplicate entries in Firestore
        const uniqueMembers = [];
        const seenMemberUids = new Set();
        if (Array.isArray(data.members)) {
          data.members.forEach((m) => {
            if (m && m.uid && !seenMemberUids.has(m.uid)) {
              seenMemberUids.add(m.uid);
              uniqueMembers.push(m);
            }
          });
        }
        circles.push({
          id: docSnap.id,
          ...data,
          members: uniqueMembers,
          memberUids: Array.isArray(data.memberUids) ? Array.from(new Set(data.memberUids)) : [],
        });
      });
      // Sort: circles created by user first, then alphabetical
      circles.sort((a, b) => {
        if (a.createdBy === uid && b.createdBy !== uid) return -1;
        if (b.createdBy === uid && a.createdBy !== uid) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      onUpdate(circles);
    },
    (err) => {
      console.warn('[trustedCircleGroupService] subscribeUserCircles error:', err?.message || err);
      onUpdate([]);
    }
  );
}

/**
 * Search user in app by username (exact or prefix) or email address.
 */
export async function searchUserForInvite(queryText) {
  const clean = (queryText || '').trim().toLowerCase();
  if (clean.length < 2) return [];

  const results = [];
  const seenUids = new Set();

  // 1. If starts with @ or search by username
  const cleanUsername = clean.startsWith('@') ? clean.slice(1) : clean;
  try {
    const userSnap = await getDoc(doc(db, 'usernames', cleanUsername));
    if (userSnap.exists()) {
      const targetUid = userSnap.data()?.uid;
      if (targetUid) {
        const uProfileSnap = await getDoc(doc(db, 'users', targetUid));
        if (uProfileSnap.exists()) {
          const uData = uProfileSnap.data();
          seenUids.add(targetUid);
          results.push({
            uid: targetUid,
            displayName: uData.displayName || cleanUsername,
            email: uData.email || '',
            username: uData.username || cleanUsername,
            photoURL: uData.photoURL || null,
          });
        }
      }
    }
  } catch (_) {}

  // 2. Search by email
  if (clean.includes('@')) {
    try {
      const emailQ = query(collection(db, 'users'), where('email', '==', clean));
      const emailSnap = await getDocs(emailQ);
      emailSnap.forEach((d) => {
        if (!seenUids.has(d.id)) {
          seenUids.add(d.id);
          const u = d.data();
          results.push({
            uid: d.id,
            displayName: u.displayName || u.email,
            email: u.email,
            username: u.username || '',
            photoURL: u.photoURL || null,
          });
        }
      });
    } catch (_) {}
  }

  return results;
}

/**
 * Send an In-App Invitation to a specific registered user.
 */
export async function sendInAppInvitation(circle, invitedBy, targetUser) {
  if (!circle?.id || !targetUser?.uid) throw new Error('Invalid invitation target.');
  if (circle.memberUids.includes(targetUser.uid)) {
    throw new Error(`${targetUser.displayName || 'User'} is already a member of this circle.`);
  }

  const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newInvite = {
    inviteId,
    toUid: targetUser.uid,
    toEmail: targetUser.email || '',
    toUsername: targetUser.username || '',
    invitedByUid: invitedBy.uid,
    invitedByName: invitedBy.displayName || 'Admin',
    circleId: circle.id,
    circleName: circle.name,
    type: 'in_app',
    status: 'pending',
    sentAt: new Date().toISOString(),
  };

  // 1. Add to pendingInvites in circle
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circle.id);
  await updateDoc(circleRef, {
    pendingInvites: arrayUnion(newInvite),
    updatedAt: serverTimestamp(),
  });

  // 2. Send personal notification to target user
  await sendPersonalNotification({
    targetUid: targetUser.uid,
    title: '🤝 Trusted Circle Invitation',
    body: `${invitedBy.displayName || 'A user'} invited you to join "${circle.name}".`,
    type: 'TRUSTED_CIRCLE_INVITE',
    senderUid: invitedBy.uid,
    circleId: circle.id,
    circleName: circle.name,
    inviteId,
  });

  return newInvite;
}

/**
 * Send an Email Invitation (Generates pending record and preps email action).
 */
export async function sendEmailInvitation(circle, invitedBy, emailAddress) {
  const cleanEmail = (emailAddress || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  const inviteId = `inv_mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newInvite = {
    inviteId,
    toUid: null,
    toEmail: cleanEmail,
    toUsername: null,
    invitedByUid: invitedBy.uid,
    invitedByName: invitedBy.displayName || 'Admin',
    circleId: circle.id,
    circleName: circle.name,
    type: 'email',
    status: 'pending',
    sentAt: new Date().toISOString(),
  };

  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circle.id);
  await updateDoc(circleRef, {
    pendingInvites: arrayUnion(newInvite),
    updatedAt: serverTimestamp(),
  });

  return newInvite;
}

/**
 * Accept a Trusted Circle Invitation.
 */
export async function acceptCircleInvitation(circleId, inviteId, currentUser) {
  if (!circleId || !currentUser?.uid) return;

  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);
  const snap = await getDoc(circleRef);
  if (!snap.exists()) throw new Error('Circle not found.');

  const circle = snap.data();
  const currentInvites = Array.isArray(circle.pendingInvites) ? circle.pendingInvites : [];
  const invite = currentInvites.find(
    (i) =>
      i.inviteId === inviteId ||
      (i.toUid && i.toUid === currentUser.uid) ||
      (i.toEmail && i.toEmail.toLowerCase() === currentUser.email?.toLowerCase())
  );

  const existingMembers = Array.isArray(circle.members) ? circle.members : [];
  const alreadyMember = existingMembers.some((m) => m.uid === currentUser.uid);

  const newMember = {
    uid: currentUser.uid,
    role: 'member',
    displayName: currentUser.displayName || 'Member',
    email: currentUser.email || '',
    username: currentUser.username || '',
    photoURL: currentUser.photoURL || null,
    joinedAt: new Date().toISOString(),
  };

  // Build clean members array without duplicates
  const updatedMembers = alreadyMember
    ? existingMembers
    : [...existingMembers, newMember];

  // Remove the invite matching this user or inviteId
  const updatedInvites = currentInvites.filter(
    (i) =>
      i.inviteId !== inviteId &&
      i.inviteId !== invite?.inviteId &&
      i.toUid !== currentUser.uid &&
      (!currentUser.email || (i.toEmail || '').toLowerCase() !== currentUser.email.toLowerCase())
  );

  await updateDoc(circleRef, {
    memberUids: arrayUnion(currentUser.uid),
    members: updatedMembers,
    pendingInvites: updatedInvites,
    updatedAt: serverTimestamp(),
  });

  // Notify circle admin and members
  notifyCircleMembers({
    circleId,
    circleName: circle.name || 'Trusted Circle',
    senderUid: currentUser.uid,
    title: `👋 ${circle.name || 'Trusted Circle'}`,
    body: `${currentUser.displayName || 'A new user'} joined the circle.`,
    type: 'CIRCLE_MEMBER_JOINED',
    memberUids: Array.from(new Set([...(circle.memberUids || []), currentUser.uid])),
    linkRoute: ROUTES.TRUSTED_CIRCLE,
    linkParams: { circleId },
  }).catch(() => {});
}

/**
 * Decline a Circle Invitation.
 */
export async function declineCircleInvitation(circleId, inviteId, currentEmail) {
  if (!circleId) return;
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);
  const snap = await getDoc(circleRef);
  if (!snap.exists()) return;

  const circle = snap.data();
  const currentInvites = Array.isArray(circle.pendingInvites) ? circle.pendingInvites : [];
  const updatedInvites = currentInvites.filter(
    (i) => i.inviteId !== inviteId && (currentEmail ? i.toEmail !== currentEmail : true)
  );

  await updateDoc(circleRef, {
    pendingInvites: updatedInvites,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin removes a member from the circle.
 */
export async function removeCircleMember(circleId, memberUid, adminUid) {
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);
  const snap = await getDoc(circleRef);
  if (!snap.exists()) throw new Error('Circle not found.');

  const circle = snap.data();
  if (circle.createdBy !== adminUid && !(circle.adminUids || []).includes(adminUid)) {
    throw new Error('Only a Circle Admin can remove members.');
  }
  if (memberUid === circle.createdBy) {
    throw new Error('Circle Admin cannot be removed.');
  }

  const currentMembers = Array.isArray(circle.members) ? circle.members : [];
  const updatedMembers = currentMembers.filter((m) => m.uid !== memberUid);

  await updateDoc(circleRef, {
    memberUids: arrayRemove(memberUid),
    members: updatedMembers,
    updatedAt: serverTimestamp(),
  });

  // Notify the removed member
  sendPersonalNotification({
    targetUid: memberUid,
    title: '⚠️ Removed from Circle',
    body: `You were removed from "${circle.name}".`,
    type: 'TRUSTED_CIRCLE_UPDATE',
    senderUid: adminUid,
    circleId,
  }).catch(() => {});
}

/**
 * Member leaves a circle on their own.
 */
export async function leaveCircle(circleId, userUid) {
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);
  const snap = await getDoc(circleRef);
  if (!snap.exists()) throw new Error('Circle not found.');

  const circle = snap.data();
  if (circle.createdBy === userUid) {
    throw new Error('Admin cannot leave their own circle. You must delete the circle or transfer ownership.');
  }

  const currentMembers = Array.isArray(circle.members) ? circle.members : [];
  const updatedMembers = currentMembers.filter((m) => m.uid !== userUid);

  await updateDoc(circleRef, {
    memberUids: arrayRemove(userUid),
    members: updatedMembers,
    updatedAt: serverTimestamp(),
  });

  // Notify admin that member left
  if (circle.createdBy && circle.createdBy !== userUid) {
    const leaverName = currentMembers.find((m) => m.uid === userUid)?.displayName || 'A member';
    sendPersonalNotification({
      targetUid: circle.createdBy,
      title: '🚪 Member Left Circle',
      body: `${leaverName} has left "${circle.name}".`,
      type: 'TRUSTED_CIRCLE_UPDATE',
      senderUid: userUid,
      circleId,
    }).catch(() => {});
  }
}

/**
 * Admin permanently deletes the circle.
 */
export async function deleteCircle(circleId, adminUid) {
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);
  const snap = await getDoc(circleRef);
  if (!snap.exists()) return;

  const circle = snap.data();
  if (circle.createdBy !== adminUid && !(circle.adminUids || []).includes(adminUid)) {
    throw new Error('Only the Circle Admin can delete this circle.');
  }

  await deleteDoc(circleRef);
}

/**
 * Update Circle Settings / Name (Admin only).
 */
export async function updateCircleSettings(circleId, adminUid, updateData) {
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);
  const snap = await getDoc(circleRef);
  if (!snap.exists()) throw new Error('Circle not found.');

  const circle = snap.data();
  if (circle.createdBy !== adminUid && !(circle.adminUids || []).includes(adminUid)) {
    throw new Error('Only the Circle Admin can update settings.');
  }

  await updateDoc(circleRef, {
    ...updateData,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribe to all circles where the user has a pending invitation.
 */
export function subscribePendingInvites(user, onUpdate) {
  if (!user?.uid && !user?.email) return () => {};

  const uid = user.uid;
  const userEmail = (user.email || '').toLowerCase().trim();

  // Query circle collection
  const colRef = collection(db, TRUSTED_CIRCLES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const pendingList = [];
      snapshot.forEach((docSnap) => {
        const circleData = docSnap.data();
        const circleId = docSnap.id;
        const invites = Array.isArray(circleData.pendingInvites) ? circleData.pendingInvites : [];
        const isCreator = circleData.createdBy === uid;
        const isMember =
          isCreator ||
          (Array.isArray(circleData.memberUids) && circleData.memberUids.includes(uid));

        if (!isMember) {
          invites.forEach((inv) => {
            const matchesUid = inv.toUid && inv.toUid === uid;
            const matchesEmail = inv.toEmail && inv.toEmail.toLowerCase() === userEmail;
            if (matchesUid || matchesEmail) {
              pendingList.push({
                ...inv,
                circleId,
                circleName: circleData.name || 'Trusted Circle',
                createdByName: circleData.createdByName || inv.invitedByName || 'Circle Admin',
              });
            }
          });
        }
      });
      onUpdate(pendingList);
    },
    (err) => {
      console.warn('[trustedCircleGroupService] subscribePendingInvites error:', err?.message || err);
      onUpdate([]);
    }
  );
}

/**
 * Fetch a single Trusted Circle by ID.
 */
export async function getCircleById(circleId) {
  if (!circleId) return null;
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);
  const snap = await getDoc(circleRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Fetch all unique member UIDs across all active circles the user belongs to.
 * Used for SOS broadcast recipient targeting.
 */
export async function getAllUserCircleMemberUids(uid) {
  if (!uid) return [];
  try {
    const q = query(
      collection(db, TRUSTED_CIRCLES_COLLECTION),
      where('memberUids', 'array-contains', uid)
    );
    const snap = await getDocs(q);
    const allMembers = new Set();
    snap.forEach((d) => {
      const data = d.data();
      if (Array.isArray(data.memberUids)) {
        data.memberUids.forEach((mUid) => {
          if (mUid !== uid) allMembers.add(mUid);
        });
      }
    });
    return Array.from(allMembers);
  } catch (e) {
    console.warn('[trustedCircleGroupService] getAllUserCircleMemberUids error:', e);
    return [];
  }
}

/**
 * Update Trusted Circle metadata: name and/or photoURL.
 */
export async function updateCircleDetails(circleId, updates, userUid) {
  if (!circleId) throw new Error('Circle ID required.');
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);
  const dataToUpdate = {
    ...updates,
    updatedAt: serverTimestamp(),
  };
  await updateDoc(circleRef, dataToUpdate);

  logActivity({
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    performedBy: userUid,
    targetUid: circleId,
    note: `Updated circle details: ${Object.keys(updates).join(', ')}`,
  }).catch(() => {});

  // Notify members about circle name or profile image update
  getDoc(circleRef).then((snap) => {
    if (snap.exists()) {
      const cData = snap.data();
      const memberUids = cData.memberUids || [];
      const cName = updates.name || cData.name || 'Trusted Circle';
      if (updates.name) {
        notifyCircleMembers({
          circleId,
          circleName: cName,
          senderUid: userUid,
          title: `📝 ${cName}`,
          body: `Circle name was updated to "${updates.name}".`,
          type: 'CIRCLE_UPDATE',
          memberUids,
          linkRoute: ROUTES.TRUSTED_CIRCLE,
          linkParams: { circleId },
        }).catch(() => {});
      } else if (updates.photoURL) {
        notifyCircleMembers({
          circleId,
          circleName: cName,
          senderUid: userUid,
          title: `🖼️ ${cName}`,
          body: `Circle group image was updated.`,
          type: 'CIRCLE_UPDATE',
          memberUids,
          linkRoute: ROUTES.TRUSTED_CIRCLE,
          linkParams: { circleId },
        }).catch(() => {});
      }
    }
  }).catch(() => {});
}

/**
 * Send a chat message in a Trusted Circle group chat.
 * Appends message to chatMessages array directly on the circle document,
 * fully compliant with deployed Firestore rules (allow update: if isAuthenticated()).
 */
export async function sendCircleMessage(circleId, senderUser, text) {
  if (!circleId || !senderUser?.uid || !text?.trim()) return;
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newMsg = {
    id: messageId,
    text: text.trim(),
    senderId: senderUser.uid,
    senderName: senderUser.displayName || 'Member',
    senderPhotoURL: senderUser.photoURL || null,
    createdAt: new Date().toISOString(),
  };

  await updateDoc(circleRef, {
    chatMessages: arrayUnion(newMsg),
    lastMessage: {
      text: text.trim(),
      senderName: senderUser.displayName || 'Member',
      senderId: senderUser.uid,
      sentAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });

  // Notify other circle members in real-time
  getDoc(circleRef).then((snap) => {
    if (snap.exists()) {
      const cData = snap.data();
      notifyCircleMembers({
        circleId,
        circleName: cData.name || 'Trusted Circle',
        senderUid: senderUser.uid,
        title: `💬 ${cData.name || 'Trusted Circle'}`,
        body: `${senderUser.displayName || 'Member'}: ${text.trim()}`,
        type: 'CIRCLE_MESSAGE',
        memberUids: cData.memberUids || [],
        linkRoute: ROUTES.CIRCLE_CHAT,
        linkParams: {
          circleId,
          circleName: cData.name || 'Trusted Circle',
          circlePhotoURL: cData.photoURL || null,
        },
      }).catch(() => {});
    }
  }).catch(() => {});
}

/**
 * Subscribe to real-time messages in a Trusted Circle group chat.
 * Listens to circle doc updates for real-time delivery without subcollection permission blocks.
 */
export function subscribeCircleMessages(circleId, onUpdate) {
  if (!circleId) return () => {};
  const circleRef = doc(db, TRUSTED_CIRCLES_COLLECTION, circleId);

  return onSnapshot(
    circleRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const msgs = Array.isArray(data.chatMessages) ? data.chatMessages : [];
        // Sort chronologically
        const sorted = [...msgs].sort((a, b) => {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return tA - tB;
        });
        onUpdate(sorted);
      } else {
        onUpdate([]);
      }
    },
    (err) => {
      console.warn('[trustedCircleGroupService] subscribeCircleMessages error:', err?.message || err);
      onUpdate([]);
    }
  );
}

