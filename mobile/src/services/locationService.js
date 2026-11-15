import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

// In-memory memory location cache for instantaneous 0ms fallback retrieval
let cachedLatestLocation = null;

export function getCachedCoordinates() {
  return cachedLatestLocation;
}

/**
 * Gets one foreground location snapshot without using fallback coordinates.
 * Success includes latitude, longitude, accuracy (or null), and timestamp.
 * Failures have a status/message; permission denial also includes canAskAgain.
 */
export async function getForegroundLocationSnapshot() {
  let timeoutId;

  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted' && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }

    if (permission.status !== 'granted') {
      return {
        status: 'permission-denied',
        canAskAgain: permission.canAskAgain,
        message: permission.canAskAgain
          ? 'Allow location access to show your position on the map, then tap Retry.'
          : 'Allow location access in your app settings, then return here and tap Retry.',
      };
    }

    if (!(await Location.hasServicesEnabledAsync())) {
      return {
        status: 'services-disabled',
        message: 'Turn on location services in your device settings, then tap Retry.',
      };
    }

    // Expo's one-shot API has no native timeout option. This bounds our wait;
    // the native request may still finish later, but its result will be ignored.
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error('Location request timed out.');
          error.code = 'LOCATION_TIMEOUT';
          reject(error);
        }, 30000);
      }),
    ]);

    const { latitude, longitude, accuracy } = position?.coords ?? {};
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(position?.timestamp)
    ) {
      throw new Error('The device returned an invalid location.');
    }

    return {
      status: 'success',
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
      timestamp: position.timestamp,
      // Existing map callers ignore this; journey tracking uses it to reject
      // emulator/mock-provider fixes instead of treating them as real travel.
      mocked: position.mocked === true,
    };
  } catch (error) {
    return {
      status: 'location-error',
      message: error?.code === 'LOCATION_TIMEOUT'
        ? 'Getting your location took too long. Try again in an open area.'
        : 'Unable to get your current location. Please try again.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Default fallback coordinates: Colombo, Sri Lanka
 */
export const DEFAULT_COORDS = {
  latitude: 6.9271,
  longitude: 79.8612,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
  address: 'Colombo, Sri Lanka',
};

/**
 * Requests location permissions and returns current GPS coordinates.
 * Optimized for emergency response: races high-accuracy fix against fast cached position
 * and performs non-blocking reverse geocoding to prevent delay.
 */
export async function getCurrentCoordinates() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[locationService] Permission to access location was denied');
      return {
        lat: DEFAULT_COORDS.latitude,
        lng: DEFAULT_COORDS.longitude,
        accuracy: null,
        address: DEFAULT_COORDS.address,
      };
    }

    // 1. First grab last known position if immediately available (<100ms)
    let lastKnown = null;
    try {
      lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
    } catch (_) {}

    // 2. Fetch fresh position with bounded 3.5s timeout for emergency responsiveness
    const freshPositionPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced, // Fast, high reliability without stalling on cold GPS lock
    });

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3500));
    const pos = (await Promise.race([freshPositionPromise, timeoutPromise])) || lastKnown;

    const lat = pos?.coords?.latitude ?? DEFAULT_COORDS.latitude;
    const lng = pos?.coords?.longitude ?? DEFAULT_COORDS.longitude;
    const accuracy = pos?.coords?.accuracy || 15;

    let address = 'Current Location';
    let areaName = '';

    // 3. Fast non-blocking or bounded geocoding (max 1.5s on native; skip on web where expo-location geocoding is removed in SDK 49+)
    if (Platform.OS !== 'web') {
      try {
        const geoPromise = Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const geoTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 1500));
        const geocoded = await Promise.race([geoPromise, geoTimeout]);

        if (geocoded && geocoded.length > 0) {
          const place = geocoded[0];

          // Format clean area name: near city or village, district (no house / street address)
          const locality = place.city || place.subregion || place.district || '';
          const district = place.region || (place.district !== locality ? place.district : '') || '';
          const areaParts = [locality, district].filter(Boolean);
          const uniqueAreaParts = [...new Set(areaParts)];
          if (uniqueAreaParts.length > 0) {
            areaName = uniqueAreaParts.join(', ');
          }

          const parts = [
            place.name,
            place.street,
            place.district || place.subregion || place.city,
            place.region,
          ].filter(Boolean);
          if (parts.length > 0) {
            address = parts.join(', ');
          }
        }
      } catch (geoErr) {
        console.warn('[locationService] Reverse geocode error:', geoErr);
      }
    }

    const result = {
      lat,
      lng,
      accuracy,
      address,
      areaName: areaName || address,
      altitude: pos?.coords?.altitude || null,
      speed: pos?.coords?.speed || null,
      timestamp: pos?.timestamp || Date.now(),
    };

    cachedLatestLocation = result;

    // Asynchronously update user's live location heartbeat in Firestore for Trusted Circle tracking
    if (auth.currentUser?.uid) {
      updateDoc(doc(db, 'users', auth.currentUser.uid), {
        lastLocation: {
          latitude: lat,
          longitude: lng,
          speed: pos?.coords?.speed ?? null,
          heading: pos?.coords?.heading ?? null,
          isMoving: (pos?.coords?.speed || 0) > 0.8,
          updatedAt: serverTimestamp(),
        },
      }).catch(() => {});
    }

    return result;
  } catch (error) {
    console.warn('[locationService] getCurrentCoordinates error, using fallback:', error);
    const fallback = cachedLatestLocation || {
      lat: DEFAULT_COORDS.latitude,
      lng: DEFAULT_COORDS.longitude,
      accuracy: null,
      address: DEFAULT_COORDS.address,
      areaName: 'Colombo, Western Province',
    };
    return fallback;
  }
}

/**
 * Reverse geocodes given lat/lng to readable address
 */
export async function reverseGeocodeLocation(lat, lng) {
  if (Platform.OS === 'web') {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  try {
    const geocoded = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (geocoded && geocoded.length > 0) {
      const place = geocoded[0];
      return [
        place.name,
        place.street,
        place.district || place.subregion || place.city,
        place.region,
      ]
        .filter(Boolean)
        .join(', ');
    }
  } catch (e) {
    console.warn('[locationService] reverseGeocodeLocation error:', e);
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Watches real, fresh foreground fixes for an active journey. Call the returned
 * cleanup immediately on cancellation, unmount, or leaving the foreground.
 * Setup and loss of valid fixes are bounded to 30 seconds. Cached fixes older
 * than 15 seconds, future fixes beyond 5 seconds, and mocked fixes are ignored.
 * This deliberately does not use the legacy SOS fallback coordinates.
 */
export function watchForegroundJourneyLocation(onLocation, onError) {
  let stopped = false;
  let cancelled = false;
  let errorDelivered = false;
  let subscription;
  let setupTimer;
  let watchdogTimer;
  let errorTimer;
  let lastTimestamp = -Infinity;

  const removeSubscription = () => {
    const current = subscription;
    subscription = undefined;
    try {
      current?.remove();
    } catch (_) {
      // A native subscription may already have been removed by the OS.
    }
  };

  const clearTimers = () => {
    clearTimeout(setupTimer);
    clearTimeout(watchdogTimer);
    clearTimeout(errorTimer);
  };

  const servicesDisabled = {
    status: 'services-disabled',
    message: 'Turn on device location services, then retry journey tracking.',
  };

  const emitError = (error) => {
    if (cancelled || errorDelivered) return;
    errorDelivered = true;
    clearTimeout(errorTimer);
    onError?.(error);
  };

  const fail = (error, inspectServices = false) => {
    if (stopped) return;
    stopped = true;
    clearTimers();
    removeSubscription();
    if (!inspectServices) {
      emitError(error);
      return;
    }

    // Do not let an unresponsive native services check hide the original error.
    errorTimer = setTimeout(() => emitError(error), 1500);
    Promise.resolve()
      .then(() => Location.hasServicesEnabledAsync())
      .then(
        (enabled) => emitError(enabled ? error : servicesDisabled),
        () => emitError(error),
      );
  };

  const resetWatchdog = () => {
    clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => fail({
      status: 'location-error',
      message: 'No fresh GPS position was received for 30 seconds. Move to an open area and retry tracking.',
    }, true), 30000);
  };

  const receivePosition = (position) => {
    if (stopped) return;
    const { latitude, longitude, accuracy } = position?.coords ?? {};
    const timestamp = position?.timestamp;
    const age = Date.now() - timestamp;
    if (
      position?.mocked === true ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(timestamp) || timestamp <= lastTimestamp ||
      age > 15000 || age < -5000
    ) return;

    lastTimestamp = timestamp;
    resetWatchdog();
    onLocation({
      status: 'success', latitude, longitude,
      accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
      timestamp,
    });
  };

  setupTimer = setTimeout(() => fail({
    status: 'location-error',
    message: 'Starting GPS took too long. Check location access and retry tracking.',
  }), 30000);

  const start = async () => {
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (stopped) return;
      if (permission.status !== 'granted' && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
        if (stopped) return;
      }
      if (permission.status !== 'granted') {
        fail({
          status: 'permission-denied',
          canAskAgain: Boolean(permission.canAskAgain),
          message: permission.canAskAgain
            ? 'Allow location access, then retry journey tracking.'
            : 'Allow location access in app settings, then retry journey tracking.',
        });
        return;
      }

      const enabled = await Location.hasServicesEnabledAsync();
      if (stopped) return;
      if (!enabled) {
        fail(servicesDisabled);
        return;
      }

      resetWatchdog();
      const watcher = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 3000,
        // Stationary fixes still confirm arrival and keep the watchdog alive.
        distanceInterval: 0,
      }, receivePosition, () => fail({
        status: 'location-error',
        message: 'Journey GPS tracking stopped. Check location access and retry tracking.',
      }, true));

      subscription = watcher;
      if (stopped) {
        removeSubscription();
        return;
      }
      clearTimeout(setupTimer);
    } catch (_) {
      fail({
        status: 'location-error',
        message: 'Unable to start journey GPS tracking. Check location access and retry.',
      }, true);
    }
  };
  start();

  return () => {
    cancelled = true;
    stopped = true;
    clearTimers();
    removeSubscription();
  };
}
