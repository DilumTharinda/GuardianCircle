/**
 * Centralized screen name constants.
 * ALL members must use these constants when navigating.
 * Never use raw string names like navigate('Home') — use ROUTES.HOME
 */
export const ROUTES = {
  // Auth stack
  SPLASH: 'Splash',
  LOGIN: 'Login',
  REGISTER: 'Register',

  // Main tab screens
  HOME: 'Home',
  SAFETY: 'Safety',
  MAP: 'Map',
  LOST_FOUND: 'LostFound',
  PROFILE: 'Profile',

  // Safety sub-screens (Member 2)
  SOS: 'SOS',
  SOS_ACTIVE: 'SOSActive',

  // Journey sub-screens (Member 3)
  START_JOURNEY: 'StartJourney',
  JOURNEY_ACTIVE: 'JourneyActive',
  TRUSTED_CIRCLE: 'TrustedCircle',
  UNSAFE_REPORT: 'UnsafeReport',

  // Lost & Found sub-screens (Member 4)
  REPORT_LOST: 'ReportLost',
  REPORT_FOUND: 'ReportFound',
  LOST_FOUND_DETAIL: 'LostFoundDetail',
  MATCH_CHAT: 'MatchChat',

  // Parent-Child sub-screens (Member 5)
  PARENT_DASHBOARD: 'ParentDashboard',
  CHILD_LOCATION: 'ChildLocation',
  SAFE_ZONES: 'SafeZones',
  CHILD_HISTORY: 'ChildHistory',

  // Account sub-screens (Member 6)
  NOTIFICATION_PREFS: 'NotificationPrefs',
  EDIT_PROFILE: 'EditProfile',
};