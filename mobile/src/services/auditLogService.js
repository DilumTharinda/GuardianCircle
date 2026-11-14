import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from './firebase';

/**
 * Audit Action taxonomy aligning with GuardianCircle IEEE 29148 SRS.
 */
export const AUDIT_ACTIONS = {
  // Authentication & Session
  AUTH_REGISTER: 'AUTH_REGISTER',
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_PASSWORD_RESET: 'AUTH_PASSWORD_RESET',
  PROFILE_UPDATE: 'PROFILE_UPDATE',

  // Safety & SOS
  SOS_TRIGGER: 'SOS_TRIGGER',
  SOS_RESOLVE: 'SOS_RESOLVE',
  SOS_CANCEL: 'SOS_CANCEL',

  // Journey & Navigation
  JOURNEY_START: 'JOURNEY_START',
  JOURNEY_CHECKIN: 'JOURNEY_CHECKIN',
  JOURNEY_COMPLETE: 'JOURNEY_COMPLETE',
  JOURNEY_CANCEL: 'JOURNEY_CANCEL',

  // Community & Lost and Found (CircleFind)
  REPORT_CREATE: 'REPORT_CREATE',
  REPORT_STATUS_CHANGE: 'REPORT_STATUS_CHANGE',
  REPORT_AMPLIFY: 'REPORT_AMPLIFY',
  REPORT_DELETE: 'REPORT_DELETE',

  // Map & Hazards
  UNSAFE_ZONE_REPORT: 'UNSAFE_ZONE_REPORT',

  // Parent - Child Relationships
  LINK_REQUEST: 'LINK_REQUEST',
  LINK_ACCEPT: 'LINK_ACCEPT',
  LINK_REMOVE: 'LINK_REMOVE',
};

const PENDING_AUDIT_LOGS_KEY = '@guardiancircle_pending_audit_logs';

/**
 * Logs an activity to Cloud Firestore `auditLog` collection.
 * Non-blocking: will never crash or delay caller operations.
 * If offline or write fails, queues locally into AsyncStorage for retry.
 *
 * @param {Object} params
 * @param {string} params.action - One of AUDIT_ACTIONS
 * @param {string} [params.performedBy] - User ID who triggered the action
 * @param {string} [params.targetUid] - Target user ID (optional)
 * @param {string} [params.targetEmail] - Target email (optional)
 * @param {string} [params.userRole] - Role of the user at event time
 * @param {string} [params.note] - Descriptive human-readable note
 * @param {Object} [params.metadata] - Extra structured metadata (location, reportId, triggerType, etc.)
 */
export async function logActivity({
  action,
  performedBy,
  targetUid,
  targetEmail,
  userRole,
  note = '',
  metadata = {},
}) {
  try {
    const currentUid = performedBy || auth?.currentUser?.uid || 'anonymous';
    const currentEmail = targetEmail || auth?.currentUser?.email || null;

    const auditEntry = {
      action: action || 'UNKNOWN_ACTION',
      performedBy: currentUid,
      targetUid: targetUid || currentUid,
      targetEmail: currentEmail,
      userRole: userRole || null,
      note: note || '',
      metadata: metadata || {},
      timestamp: serverTimestamp(),
      createdAtClient: new Date().toISOString(),
    };

    // Attempt direct write to Firestore
    await addDoc(collection(db, 'auditLog'), auditEntry);

    // If there were any previously queued offline logs, attempt to flush them in background
    flushPendingAuditLogs().catch(() => {});
  } catch (err) {
    console.warn('[auditLogService] Live write failed; queueing locally:', err?.message || err);
    // Queue offline
    try {
      const offlineEntry = {
        action: action || 'UNKNOWN_ACTION',
        performedBy: performedBy || auth?.currentUser?.uid || 'anonymous',
        targetUid: targetUid || performedBy || null,
        targetEmail: targetEmail || auth?.currentUser?.email || null,
        userRole: userRole || null,
        note: note || '',
        metadata: metadata || {},
        createdAtClient: new Date().toISOString(),
      };
      const existingStr = await AsyncStorage.getItem(PENDING_AUDIT_LOGS_KEY);
      const existing = existingStr ? JSON.parse(existingStr) : [];
      existing.push(offlineEntry);
      // Cap at 100 queued items
      const trimmed = existing.slice(-100);
      await AsyncStorage.setItem(PENDING_AUDIT_LOGS_KEY, JSON.stringify(trimmed));
    } catch (queueErr) {
      console.warn('[auditLogService] Offline queue error:', queueErr);
    }
  }
}

/**
 * Flush any queued audit logs from local storage to Firestore.
 */
export async function flushPendingAuditLogs() {
  try {
    const existingStr = await AsyncStorage.getItem(PENDING_AUDIT_LOGS_KEY);
    if (!existingStr) return;

    const list = JSON.parse(existingStr);
    if (!Array.isArray(list) || list.length === 0) return;

    const remaining = [];
    for (const item of list) {
      try {
        await addDoc(collection(db, 'auditLog'), {
          ...item,
          timestamp: serverTimestamp(),
          syncedFromOffline: true,
        });
      } catch (err) {
        remaining.push(item);
      }
    }

    if (remaining.length > 0) {
      await AsyncStorage.setItem(PENDING_AUDIT_LOGS_KEY, JSON.stringify(remaining));
    } else {
      await AsyncStorage.removeItem(PENDING_AUDIT_LOGS_KEY);
    }
  } catch (_) {}
}

