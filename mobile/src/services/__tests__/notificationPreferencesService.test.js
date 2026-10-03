// src/services/__tests__/notificationPreferencesService.test.js
//
// FIRST EXAMPLE TEST — template for the team
//
// This is Member 6's example test, covering the Account module's
// notification preference logic. Copy this file's structure for testing
// your own service files: same folder pattern (a __tests__ folder next
// to the file being tested), same mocking approach for Firebase calls.
//
// Why this doesn't hit real Firestore:
// Unit tests should never make real network calls — they'd be slow,
// flaky, and could write test data into the real project. Instead, we
// mock ('fake out') the firebase/firestore functions and our own
// firebase.js file, so we can control exactly what they return and check
// exactly how they were called.

import {
  getNotificationPreferences,
  updateNotificationPreference,
  NOTIFICATION_CATEGORIES,
} from '../notificationPreferencesService';
import { getDoc, updateDoc } from 'firebase/firestore';

// Mock the Firestore SDK functions this service imports.
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => 'mock-doc-ref'),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
}));

// Mock our own firebase.js so this test never touches the real project.
jest.mock('../firebase', () => ({
  db: 'mock-db',
}));

describe('notificationPreferencesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNotificationPreferences', () => {
    it('throws if no uid is given', async () => {
      await expect(getNotificationPreferences()).rejects.toThrow(
        'getNotificationPreferences requires a uid.'
      );
    });

    it('returns all-defaults when the profile document does not exist', async () => {
      getDoc.mockResolvedValue({ exists: () => false });

      const result = await getNotificationPreferences('user-123');

      expect(result).toEqual({
        sos: true,
        journey: true,
        lostFound: true,
        geofence: true,
        reminders: true,
      });
    });

    it('merges saved preferences over the defaults', async () => {
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ notificationPrefs: { journey: false } }),
      });

      const result = await getNotificationPreferences('user-123');

      expect(result.journey).toBe(false);
      expect(result.sos).toBe(true); // untouched fields keep their default
    });
  });

  describe('updateNotificationPreference', () => {
    it('throws if no uid is given', async () => {
      await expect(updateNotificationPreference(undefined, 'journey', false)).rejects.toThrow(
        'updateNotificationPreference requires a uid.'
      );
    });

    it('throws on an unknown category', async () => {
      await expect(
        updateNotificationPreference('user-123', 'not_a_real_category', false)
      ).rejects.toThrow('Unknown notification category');
    });

    it('allows turning a normal category off', async () => {
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ notificationPrefs: { journey: false } }),
      });

      await updateNotificationPreference('user-123', 'journey', false);

      expect(updateDoc).toHaveBeenCalledWith('mock-doc-ref', {
        'notificationPrefs.journey': false,
      });
    });

    it('NEVER allows turning sos off, even if false is passed in', async () => {
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ notificationPrefs: { sos: true } }),
      });

      await updateNotificationPreference('user-123', 'sos', false);

      // The critical assertion for this whole module: no matter what the
      // caller asked for, sos must always be written as true.
      expect(updateDoc).toHaveBeenCalledWith('mock-doc-ref', {
        'notificationPrefs.sos': true,
      });
    });
  });

  describe('NOTIFICATION_CATEGORIES', () => {
    it('includes exactly the five categories the SRS defines', () => {
      expect(NOTIFICATION_CATEGORIES).toEqual([
        'sos',
        'journey',
        'lostFound',
        'geofence',
        'reminders',
      ]);
    });
  });
});