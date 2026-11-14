import { createNavigationContainerRef } from '@react-navigation/native';
import { ROUTES } from '../constants/routes';

export const navigationRef = createNavigationContainerRef();

/**
 * Navigate safely from anywhere in the app (including modals, services, and nested navigators).
 * 
 * Handles nested routes cleanly:
 * If target is a Tab screen (e.g. Map, Safety, Home, CircleFind) and the caller is in root stack,
 * it routes through the 'Main' tab navigator.
 */
export function navigate(name, params) {
  if (!navigationRef.isReady()) {
    console.warn('[navigationService] Navigation container not ready yet.');
    return;
  }

  const TAB_ROUTES = [ROUTES.HOME, ROUTES.SAFETY, ROUTES.MAP, ROUTES.CIRCLE_FIND, ROUTES.PROFILE];

  // CircleFind sub-screens nested inside the CircleFind tab navigator
  const CIRCLE_FIND_SUB_ROUTES = [
    ROUTES.CIRCLE_FIND_DETAIL,
    ROUTES.CIRCLE_FIND_REPORT,
    ROUTES.MATCH_CHAT,
    'CircleFindDetail',
    'CircleFindReport',
    'MatchChat',
  ];

  if (TAB_ROUTES.includes(name)) {
    // Navigate into MainTabNavigator
    navigationRef.navigate('Main', {
      screen: name,
      params,
    });
  } else if (CIRCLE_FIND_SUB_ROUTES.includes(name)) {
    // Navigate into Main -> CircleFind Tab -> Sub-screen
    navigationRef.navigate('Main', {
      screen: ROUTES.CIRCLE_FIND,
      params: {
        screen: name,
        params,
      },
    });
  } else {
    navigationRef.navigate(name, params);
  }
}

