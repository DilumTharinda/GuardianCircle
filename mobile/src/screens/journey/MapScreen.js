import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';

let MapView = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default || Maps;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
  } catch (e) {
    console.warn('[MapScreen] react-native-maps not loaded, using fallback');
  }
}

export default function MapScreen() {
  const [journeyActive, setJourneyActive] = useState(false);

  return (
    <View style={styles.container}>
      {MapView && Platform.OS !== 'web' ? (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: 6.9271, // Colombo, Sri Lanka
            longitude: 79.8612,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        />
      ) : (
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackEmoji}>🗺️</Text>
          <Text style={styles.fallbackTitle}>Live Journey & Safe Routes (Sri Lanka)</Text>
          <Text style={styles.fallbackSub}>
            Tracking active along Colombo 05 ➔ Colombo 10 (Galle Road / High-Level Corridor)
          </Text>
          <View style={styles.routeCard}>
            <Text style={styles.routeItem}>🟢 Start: Havelock Town, Colombo 05</Text>
            <Text style={styles.routeItem}>📍 Checkpoint: Bambalapitiya Police Zone</Text>
            <Text style={styles.routeItem}>🏁 Destination: Ananda College, Colombo 10</Text>
          </View>
        </View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.text}>🇱🇰 Live Journey Tracking</Text>
        <TouchableOpacity
          style={[styles.journeyBtn, journeyActive && styles.journeyBtnActive]}
          onPress={() => setJourneyActive(!journeyActive)}
          activeOpacity={0.8}
        >
          <Text style={styles.journeyBtnText}>
            {journeyActive ? '⏹️ End Active Trip' : '🚀 Start Safe Journey'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  map: { flex: 1 },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  fallbackEmoji: { fontSize: 48, marginBottom: 12 },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 8,
  },
  fallbackSub: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  routeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 8,
  },
  routeItem: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
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
    gap: 10,
  },
  text: { fontSize: 16, fontWeight: 'bold', color: '#E53935' },
  journeyBtn: {
    backgroundColor: '#2E7D32',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  journeyBtnActive: {
    backgroundColor: '#C62828',
  },
  journeyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
