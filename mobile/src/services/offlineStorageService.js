// src/services/offlineStorageService.js
//
// FR-3.4 — Offline-First Data Access
//
// What this does:
//   - Caches three things locally in Expo SQLite so they're viewable with
//     no internet: the Trusted Circle list, the last known GPS location,
//     and a queue of "pending reports" (anything the user tried to submit
//     while offline).
//   - Does NOT talk to Firestore directly. Other modules (Member 3's
//     Trusted Circle, Member 4's Lost & Found, etc.) own their own
//     Firestore writes. This service only owns the local cache and the
//     queue — when back online, the calling module hands this service a
//     small "upload function," and this service calls it for each queued
//     item and clears it out on success.
//
// Uses the modern async Expo SQLite API (openDatabaseAsync / execAsync /
// runAsync / getAllAsync — expo-sqlite ~57, confirmed in package.json).
 
import * as SQLite from 'expo-sqlite';
 
const DB_NAME = 'guardiancircle_offline.db';
 
let dbPromise = null;
 
// Lazily opens (and creates, on first run) the local database. Safe to
// call this many times — it only actually opens the connection once.
function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}
 
/**
 * Opens (and, on first run, creates) the local offline database.
 * Call this once, early in app startup (e.g. in App.js), before any of
 * the functions below are used.
 * @returns {Promise<void>}
 */
export async function initOfflineDb() {
  const db = await getDb();
 
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
 
    CREATE TABLE IF NOT EXISTS trusted_circle (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      contact_info TEXT,
      permission_level TEXT,
      raw_json TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
 
    CREATE TABLE IF NOT EXISTS last_location (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      captured_at INTEGER NOT NULL
    );
 
    CREATE TABLE IF NOT EXISTS pending_reports (
      local_id TEXT PRIMARY KEY NOT NULL,
      report_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT
    );
  `);
}
 
// ---------------------------------------------------------------------
// Trusted Circle cache (read-only mirror — Member 3's screens own writes)
// ---------------------------------------------------------------------
 
/**
 * Overwrites the local Trusted Circle cache with the latest list.
 * @param {Array<Object>} contacts - Each item needs at least { id, name }.
 *   Extra fields are preserved in raw_json so nothing is lost even if this
 *   cache's columns don't cover every field Member 3's module uses.
 * @returns {Promise<void>}
 */
export async function cacheTrustedCircle(contacts) {
  const db = await getDb();
  const now = Date.now();
 
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM trusted_circle;');
    for (const contact of contacts) {
      await db.runAsync(
        `INSERT INTO trusted_circle (id, name, contact_info, permission_level, raw_json, cached_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [
          String(contact.id),
          contact.name ?? null,
          contact.contactInfo ?? contact.phone ?? contact.email ?? null,
          contact.permissionLevel ?? null,
          JSON.stringify(contact),
          now,
        ]
      );
    }
  });
}
 
/**
 * Reads the locally cached Trusted Circle list.
 * @returns {Promise<Array<Object>>}
 */
export async function getCachedTrustedCircle() {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT raw_json FROM trusted_circle ORDER BY name;');
  return rows.map((row) => JSON.parse(row.raw_json));
}
 
// ---------------------------------------------------------------------
// Last known location cache
// ---------------------------------------------------------------------
 
/**
 * Saves (or overwrites) the single cached last-known location.
 * @param {{latitude: number, longitude: number}} location
 * @returns {Promise<void>}
 */
export async function cacheLastKnownLocation({ latitude, longitude }) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO last_location (id, latitude, longitude, captured_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       captured_at = excluded.captured_at;`,
    [latitude, longitude, Date.now()]
  );
}
 
/**
 * Reads the cached last-known location.
 * @returns {Promise<{latitude: number, longitude: number, capturedAt: number}|null>}
 */
export async function getCachedLastKnownLocation() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    'SELECT latitude, longitude, captured_at FROM last_location WHERE id = 1;'
  );
  if (!row) return null;
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    capturedAt: row.captured_at,
  };
}
 
// ---------------------------------------------------------------------
// Pending reports queue (anything submitted while offline)
// ---------------------------------------------------------------------
 
/**
 * Queues a submission that couldn't reach Firestore (device offline).
 * @param {string} reportType - A short tag the calling module defines,
 *   e.g. 'lost_found_report', 'unsafe_location_report', 'journey_checkin'.
 * @param {Object} payload - Plain, JSON-serializable object the module
 *   needs to later re-submit (no functions, no File/Blob objects).
 * @returns {Promise<string>} The local queue id.
 */
export async function queuePendingReport(reportType, payload) {
  const db = await getDb();
  const localId = `${reportType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
 
  await db.runAsync(
    `INSERT INTO pending_reports (local_id, report_type, payload_json, created_at, status)
     VALUES (?, ?, ?, ?, 'pending');`,
    [localId, reportType, JSON.stringify(payload), Date.now()]
  );
 
  return localId;
}
 
/**
 * Reads queued (not-yet-synced) reports.
 * @param {string} [reportType] - Filter by type, or omit for everything queued.
 * @returns {Promise<Array<Object>>}
 */
export async function getPendingReports(reportType) {
  const db = await getDb();
  const rows = reportType
    ? await db.getAllAsync(
        'SELECT * FROM pending_reports WHERE report_type = ? ORDER BY created_at;',
        [reportType]
      )
    : await db.getAllAsync('SELECT * FROM pending_reports ORDER BY created_at;');
 
  return rows.map((row) => ({
    localId: row.local_id,
    reportType: row.report_type,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
    status: row.status,
    lastError: row.last_error,
  }));
}
 
/**
 * Removes a report from the queue (call this after a successful re-submit).
 * @param {string} localId
 * @returns {Promise<void>}
 */
export async function removePendingReport(localId) {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_reports WHERE local_id = ?;', [localId]);
}
 
async function markReportFailed(localId, errorMessage) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE pending_reports SET status = 'failed', last_error = ? WHERE local_id = ?;`,
    [String(errorMessage).slice(0, 500), localId]
  );
}
 
/**
 * Retries every queued report against the real upload functions.
 * Call this when connectivity is back (see useOfflineSync.js for one way
 * to trigger it automatically).
 * @param {Object<string, (payload: Object) => Promise<void>>} uploadHandlers
 *   Maps a reportType to an async function that performs the real
 *   submission, e.g.:
 *   syncPendingReports({
 *     lost_found_report: (payload) => lostFoundService.submitReport(payload),
 *     unsafe_location_report: (payload) => journeyService.submitUnsafeReport(payload),
 *   });
 * @returns {Promise<{succeeded: number, failed: number}>}
 */
export async function syncPendingReports(uploadHandlers) {
  const pending = await getPendingReports();
  let succeeded = 0;
  let failed = 0;
 
  for (const item of pending) {
    const handler = uploadHandlers[item.reportType];
    if (!handler) {
      // No one registered a handler for this type yet — leave it queued.
      continue;
    }
    try {
      await handler(item.payload);
      await removePendingReport(item.localId);
      succeeded += 1;
    } catch (err) {
      await markReportFailed(item.localId, err?.message ?? 'Unknown sync error');
      failed += 1;
    }
  }
 
  return { succeeded, failed };
}
 