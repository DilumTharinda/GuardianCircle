// src/hooks/useNotificationPreferences.js
//
// FR-3.3 (logic half) — Notification Preference Management
//
// Gives a screen everything it needs to render toggle switches: the
// current preference values, an updatePreference() function to flip one,
// and a saving flag for showing a spinner on the toggle mid-request.
//
// After a successful update, it refreshes AuthContext's userProfile via
// loadUserProfile() so the rest of the app sees the change immediately,
// not just this screen.

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  NOTIFICATION_CATEGORIES,
  updateNotificationPreference,
} from '../services/notificationPreferencesService';

const DEFAULT_PREFERENCES = {
  sos: true,
  journey: true,
  lostFound: true,
  geofence: true,
  reminders: true,
};

export function useNotificationPreferences() {
  const { user, userProfile, loadUserProfile } = useAuth();
  const [savingCategory, setSavingCategory] = useState(null);
  const [error, setError] = useState(null);

  const preferences = useMemo(
    () => ({ ...DEFAULT_PREFERENCES, ...(userProfile?.notificationPrefs ?? {}) }),
    [userProfile]
  );

  const updatePreference = useCallback(
    async (category, enabled) => {
      if (!user?.uid) {
        setError('You must be logged in to change notification preferences.');
        return;
      }
      setError(null);
      setSavingCategory(category);
      try {
        await updateNotificationPreference(user.uid, category, enabled);
        await loadUserProfile(user.uid);
      } catch (err) {
        setError(err?.message ?? 'Failed to update notification preference.');
      } finally {
        setSavingCategory(null);
      }
    },
    [user, loadUserProfile]
  );

  return {
    preferences,
    categories: NOTIFICATION_CATEGORIES,
    updatePreference,
    savingCategory,
    error,
  };
}