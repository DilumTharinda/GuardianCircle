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
  FORGOT_PASSWORD: 'ForgotPassword',

  // Main tab screens
  HOME: 'Home',
  SAFETY: 'Safety',
  MAP: 'Map',
  CIRCLE_FIND: 'CircleFind',
  LOST_FOUND: 'CircleFind', // Alias for backward compatibility
  PROFILE: 'Profile',

  // Safety sub-screens (Member 2)
  SOS: 'SOS',
  SOS_ACTIVE: 'SOSActive',

  // Journey sub-screens (Member 3)
  START_JOURNEY: 'StartJourney',
  JOURNEY_ACTIVE: 'JourneyActive',
  TRUSTED_CIRCLE: 'TrustedCircle',
  UNSAFE_REPORT: 'UnsafeReport',

  // CircleFind sub-screens (Unified recovery section)
  CIRCLE_FIND_LIST: 'CircleFindList',
  CIRCLE_FIND_REPORT: 'CircleFindReport',
  CIRCLE_FIND_DETAIL: 'CircleFindDetail',
  LOST_FOUND_LIST: 'CircleFindList', // Alias
  REPORT_LOST: 'CircleFindReport', // Alias
  REPORT_FOUND: 'CircleFindReport', // Alias
  LOST_FOUND_DETAIL: 'CircleFindDetail', // Alias
  MATCH_CHAT: 'MatchChat',
  COMMUNITY_FEED: 'CommunityFeed',

  // Parent-Child sub-screens (Member 5)
  PARENT_DASHBOARD: 'ParentDashboard',
  CHILD_LOCATION: 'ChildLocation',
  SAFE_ZONES: 'SafeZones',
  CHILD_HISTORY: 'ChildHistory',

  // Account sub-screens (Member 6)
  NOTIFICATION_PREFS: 'NotificationPrefs',
  EDIT_PROFILE: 'EditProfile',
};