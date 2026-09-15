import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getForegroundLocationSnapshot } from '../../services/locationService';

let MapView = null;
let Marker = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default || Maps;
    Marker = Maps.Marker;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
  } catch (e) {
    console.warn('[MapScreen] react-native-maps not loaded, using fallback');
  }
}

export default function MapScreen() {
  const [locationState, setLocationState] = useState({ status: 'loading' });
  const requestId = useRef(0);
  const mapAvailable = MapView && Marker && Platform.OS !== 'web';

  const loadLocation = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLocationState({ status: 'loading' });

    const result = await getForegroundLocationSnapshot();
    // Ignore results after blur/unmount, or after a newer request has started.
    if (currentRequest === requestId.current) {
      setLocationState(result);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!mapAvailable) return;

      loadLocation();
      return () => {
        requestId.current += 1;
      };
    }, [loadLocation, mapAvailable])
  );

  async function openSettings() {
    const currentRequest = requestId.current;
    try {
      await Linking.openSettings();
    } catch (error) {
      if (currentRequest === requestId.current) {
        setLocationState((previous) => ({
          ...previous,
          message: 'Could not open Settings. Open your device settings manually, allow location access, then tap Retry.',
        }));
      }
    }
  }

  if (!mapAvailable) {
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Map unavailable</Text>
        <Text style={styles.statusMessage}>
          Open this screen in a supported Android or iOS app to view the map.
        </Text>
      </View>
    );
  }

  if (locationState.status !== 'success') {
    const loading = locationState.status === 'loading';
    const permissionDenied = locationState.status === 'permission-denied';
    const title = permissionDenied
      ? 'Location permission needed'
      : locationState.status === 'services-disabled'
        ? 'Location services are off'
        : 'Location unavailable';

    return (
      <View style={styles.statusContainer} accessibilityLiveRegion="polite">
        {loading ? (
          <>
            <ActivityIndicator size="large" color="#E53935" />
            <Text style={styles.loadingText}>Getting your location...</Text>
          </>
        ) : (
          <>
            <Text style={styles.statusTitle}>{title}</Text>
            <Text style={styles.statusMessage}>{locationState.message}</Text>
            {permissionDenied && locationState.canAskAgain === false && (
              <TouchableOpacity
                style={styles.button}
                onPress={openSettings}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Open Settings</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.button}
              onPress={loadLocation}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Retry</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  const { latitude, longitude, accuracy, timestamp } = locationState;

  return (
    <View style={styles.container}>
      {/* Mount after GPS succeeds so initialRegion uses this snapshot. */}
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker
          coordinate={{ latitude, longitude }}
          title="Your current location"
          description="One-time location snapshot"
        />
      </MapView>

      <View style={styles.overlay}>
        <Text style={styles.text}>Current location</Text>
        <Text style={styles.snapshotText}>
          Captured at {new Date(timestamp).toLocaleTimeString()}
        </Text>
        {accuracy !== null && (
          <Text style={styles.snapshotText}>Accuracy: about {Math.round(accuracy)} m</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  map: { flex: 1 },
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#424242',
    marginTop: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  overlay: {
    position: 'absolute',
    top: 20,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    gap: 8,
  },
  text: { fontSize: 16, fontWeight: 'bold', color: '#E53935' },
  snapshotText: { fontSize: 13, color: '#424242', textAlign: 'center' },
});
