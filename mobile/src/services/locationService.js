import * as Location from 'expo-location';

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
        }, 15000);
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

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout: 10000,
    });

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy || 10;

    let address = 'Current Location';
    try {
      const geocoded = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (geocoded && geocoded.length > 0) {
        const place = geocoded[0];
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

    return {
      lat,
      lng,
      accuracy,
      address,
      altitude: pos.coords.altitude || null,
      speed: pos.coords.speed || null,
      timestamp: pos.timestamp,
    };
  } catch (error) {
    console.warn('[locationService] getCurrentCoordinates error, using fallback:', error);
    return {
      lat: DEFAULT_COORDS.latitude,
      lng: DEFAULT_COORDS.longitude,
      accuracy: null,
      address: DEFAULT_COORDS.address,
    };
  }
}

/**
 * Reverse geocodes given lat/lng to readable address
 */
export async function reverseGeocodeLocation(lat, lng) {
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
