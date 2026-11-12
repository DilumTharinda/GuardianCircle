import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

export default function UrgentSOSBanner({ activeChild, onViewLocation, onResolveSOS }) {
  if (!activeChild || !activeChild.sosActive) return null;

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
      <View style={styles.contentRow}>
        <View style={styles.iconBox}>
          <Text style={styles.iconText}>🚨</Text>
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>EMERGENCY SOS ALERT!</Text>
          <Text style={styles.subtitle}>
            <Text style={styles.childNameHighlight}>{activeChild.targetName}</Text> has triggered
            an emergency alert!
          </Text>
          <Text style={styles.locationText} numberOfLines={1}>
            📍 {activeChild.lastLocation?.address || 'Live location broadcasting'}
          </Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.primaryActionBtn}
          onPress={onViewLocation}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="View emergency live location"
        >
          <Text style={styles.primaryActionText}>🗺️ TRACK LIVE GPS</Text>
        </TouchableOpacity>

        {onResolveSOS && (
          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={onResolveSOS}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Resolve SOS Alert"
          >
            <Text style={styles.secondaryActionText}>Resolve</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.dangerRed,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.large,
    borderWidth: 2,
    borderColor: '#FF8A80',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: '#FFF',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#FFEBEE',
    lineHeight: 18,
  },
  childNameHighlight: {
    fontWeight: '700',
    color: '#FFF',
    textDecorationLine: 'underline',
  },
  locationText: {
    fontSize: 12,
    color: '#FFCDD2',
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: COLORS.dangerRed,
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryActionBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
