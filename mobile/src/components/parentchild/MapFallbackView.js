import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { COLORS, SHADOWS, RADIUS, SPACING } from '../../constants/theme';

export default function MapFallbackView({ child, safeZones = [], onSelectZone }) {
  const [zoomLevel, setZoomLevel] = useState(1);

  if (!child) return null;

  return (
    <View style={styles.container}>
      {/* Map Header Status */}
      <View style={styles.mapGrid}>
        {/* Decorative Grid Lines */}
        <View style={styles.gridLineHorizontal1} />
        <View style={styles.gridLineHorizontal2} />
        <View style={styles.gridLineVertical1} />
        <View style={styles.gridLineVertical2} />

        {/* Compass & Mode Badge */}
        <View style={styles.topBadgeRow}>
          <View style={styles.modeBadge}>
            <Text style={styles.modeText}>🛰️ SIMULATED GPS RADAR</Text>
          </View>
          <View style={styles.zoomControlBox}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoomLevel(Math.min(zoomLevel + 0.2, 1.6))}
            >
              <Text style={styles.zoomBtnText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoomLevel(Math.max(zoomLevel - 0.2, 0.6))}
            >
              <Text style={styles.zoomBtnText}>−</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Center Radar Circles (Safe Zones Overlay) */}
        <View style={[styles.radarCenter, { transform: [{ scale: zoomLevel }] }]}>
          {safeZones.map((zone, idx) => {
            const size = Math.max(100, Math.min(260, (zone.radius || 200) * 0.7));
            const isInside = zone.isInside;
            return (
              <TouchableOpacity
                key={zone.id || idx}
                style={[
                  styles.safeZoneCircle,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderColor: zone.color || COLORS.safeGreen,
                    backgroundColor: `${zone.color || COLORS.safeGreen}18`,
                  },
                ]}
                onPress={() => onSelectZone && onSelectZone(zone)}
                activeOpacity={0.7}
              >
                <View style={styles.zoneTagPill}>
                  <Text style={[styles.zoneTagText, { color: zone.color || COLORS.safeGreen }]}>
                    {zone.icon || '📍'} {zone.name} ({zone.radius}m)
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Child GPS Pin (Center Pulsing Marker) */}
          <View style={styles.childPinWrapper}>
            <View style={styles.pulseRing} />
            <View style={[styles.childMarker, child.sosActive && styles.childMarkerSOS]}>
              <Text style={styles.markerAvatar}>{child.avatarEmoji || '🧒'}</Text>
            </View>
            <View style={styles.childNameCallout}>
              <Text style={styles.childNameCalloutText}>{child.targetName}</Text>
              <Text style={styles.childStatusCalloutText}>
                {child.sosActive ? '🚨 SOS ACTIVE' : '📍 ' + (child.currentZoneName || 'Online')}
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom Coordinates Readout */}
        <View style={styles.bottomCoordsBar}>
          <Text style={styles.coordsText}>
            Lat: {child.lastLocation?.latitude?.toFixed(4) || '6.9147'}° N • Lon:{' '}
            {child.lastLocation?.longitude?.toFixed(4) || '79.8732'}° E • Accuracy: ±4m
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8EDF2',
    minHeight: 340,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    ...SHADOWS.medium,
  },
  mapGrid: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
  },
  gridLineHorizontal1: {
    position: 'absolute',
    top: '33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  gridLineHorizontal2: {
    position: 'absolute',
    top: '66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  gridLineVertical1: {
    position: 'absolute',
    left: '33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#CBD5E1',
  },
  gridLineVertical2: {
    position: 'absolute',
    left: '66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#CBD5E1',
  },
  topBadgeRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  modeBadge: {
    backgroundColor: 'rgba(33, 33, 33, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.md,
  },
  modeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  zoomControlBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  zoomBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  radarCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 300,
    height: 300,
  },
  safeZoneCircle: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  zoneTagPill: {
    backgroundColor: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginTop: 6,
    ...SHADOWS.small,
  },
  zoneTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  childPinWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(229, 57, 53, 0.25)',
  },
  childMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    ...SHADOWS.medium,
  },
  childMarkerSOS: {
    backgroundColor: COLORS.dangerRed,
    borderColor: '#FFCDD2',
    transform: [{ scale: 1.15 }],
  },
  markerAvatar: {
    fontSize: 22,
  },
  childNameCallout: {
    backgroundColor: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    marginTop: 6,
    alignItems: 'center',
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  childNameCalloutText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  childStatusCalloutText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  bottomCoordsBar: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  coordsText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
});
