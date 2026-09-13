import * as Location from 'expo-location';

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
