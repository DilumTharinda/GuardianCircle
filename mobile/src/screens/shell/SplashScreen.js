/**
 * GuardianCircle — SplashScreen.js
 * Member 1 builds this screen.
 *
 * Modern animations:
 *  1. Dark green gradient background fades in
 *  2. Outer rotating ring (continuous slow spin)
 *  3. Inner pulse ring (scale + opacity loop)
 *  4. Shield icon springs in with scale + opacity
 *  5. Shimmer accent lines spread outward
 *  6. App name slides up and fades in
 *  7. Tagline fades in
 *  8. Progress bar fills left → right
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING } from '../../constants/theme';

const { width, height } = Dimensions.get('window');
const RING_SIZE = 180;
const SHIELD_SIZE = 100;

export default function SplashScreen() {
  // Background
  const bgOpacity    = useRef(new Animated.Value(0)).current;

  // Shield
  const shieldScale   = useRef(new Animated.Value(0.35)).current;
  const shieldOpacity = useRef(new Animated.Value(0)).current;

  // Rotating ring
  const rotateAnim    = useRef(new Animated.Value(0)).current;

  // Inner pulse ring
  const pulseScale    = useRef(new Animated.Value(1)).current;
  const pulseOpacity  = useRef(new Animated.Value(0.5)).current;

  // Shimmer lines (4 directional)
  const shim1 = useRef(new Animated.Value(0)).current;
  const shim2 = useRef(new Animated.Value(0)).current;
  const shim3 = useRef(new Animated.Value(0)).current;
  const shim4 = useRef(new Animated.Value(0)).current;

  // Text
  const titleTranslate = useRef(new Animated.Value(30)).current;
  const titleOpacity   = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  // Progress bar
  const progressWidth  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Fade in background
    Animated.timing(bgOpacity, {
      toValue: 1, duration: 300, useNativeDriver: true,
    }).start();

    // 2. Shield springs in
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(shieldScale, {
          toValue: 1, tension: 55, friction: 6, useNativeDriver: true,
        }),
        Animated.timing(shieldOpacity, {
          toValue: 1, duration: 450, useNativeDriver: true,
        }),
      ]),
    ]).start();

    // 3. Rotating ring — continuous spin
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1, duration: 6000, useNativeDriver: true,
      })
    ).start();

    // 4. Inner pulse loop
    const doPulse = () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.45, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.5, duration: 900, useNativeDriver: true }),
        ]),
      ]).start(() => doPulse());
    };
    setTimeout(doPulse, 400);

    // 5. Shimmer lines spread
    const shimmerDelay = 550;
    Animated.sequence([
      Animated.delay(shimmerDelay),
      Animated.parallel([
        Animated.spring(shim1, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
        Animated.spring(shim2, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
        Animated.spring(shim3, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
        Animated.spring(shim4, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
      ]),
    ]).start();

    // 6. App name slides up
    Animated.sequence([
      Animated.delay(750),
      Animated.parallel([
        Animated.timing(titleTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(titleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();

    // 7. Tagline fades in
    Animated.sequence([
      Animated.delay(1050),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // 8. Progress bar fills
    Animated.sequence([
      Animated.delay(1200),
      Animated.timing(progressWidth, {
        toValue: 1, duration: 1800, useNativeDriver: false,
      }),
    ]).start();
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const shimTranslate = (anim, offsetX, offsetY) => ({
    opacity: anim,
    transform: [
      {
        translateX: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, offsetX],
        }),
      },
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, offsetY],
        }),
      },
    ],
  });

  const progressBarWidth = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.darkGreen} />

      <Animated.View style={[styles.fill, { opacity: bgOpacity }]}>
        <LinearGradient
          colors={[COLORS.darkGreen, COLORS.darkGreenMid, '#1A4B1F']}
          style={styles.fill}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
        >
          {/* ── Center logo cluster ── */}
          <View style={styles.logoCluster}>
            {/* Rotating outer ring */}
            <Animated.View
              style={[
                styles.rotatingRing,
                { transform: [{ rotate: spin }] },
              ]}
            />

            {/* Static outer ring (solid) */}
            <View style={styles.staticRing} />

            {/* Inner pulse ring */}
            <Animated.View
              style={[
                styles.pulseRing,
                { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
              ]}
            />

            {/* Shimmer accent lines */}
            <Animated.View style={[styles.shimLine, styles.shimTop, shimTranslate(shim1, 0, -60)]} />
            <Animated.View style={[styles.shimLine, styles.shimBottom, shimTranslate(shim2, 0, 60)]} />
            <Animated.View style={[styles.shimLine, styles.shimLeft, shimTranslate(shim3, -60, 0)]} />
            <Animated.View style={[styles.shimLine, styles.shimRight, shimTranslate(shim4, 60, 0)]} />

            {/* Shield icon */}
            <Animated.View
              style={[
                styles.shieldCircle,
                {
                  transform: [{ scale: shieldScale }],
                  opacity: shieldOpacity,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="shield-check"
                size={52}
                color="#fff"
              />
            </Animated.View>
          </View>

          {/* App name */}
          <Animated.Text
            style={[
              styles.appName,
              {
                opacity: titleOpacity,
                transform: [{ translateY: titleTranslate }],
              },
            ]}
          >
            GuardianCircle
          </Animated.Text>

          {/* Tagline */}
          <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
            Your safety, always connected
          </Animated.Text>

          {/* Progress bar */}
          <Animated.View style={[styles.progressContainer, { opacity: taglineOpacity }]}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[styles.progressFill, { width: progressBarWidth }]}
              />
            </View>
          </Animated.View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkGreen },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Logo cluster ──
  logoCluster: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },

  rotatingRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderStyle: 'dashed',
  },

  staticRing: {
    position: 'absolute',
    width: RING_SIZE - 24,
    height: RING_SIZE - 24,
    borderRadius: (RING_SIZE - 24) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  pulseRing: {
    position: 'absolute',
    width: SHIELD_SIZE + 16,
    height: SHIELD_SIZE + 16,
    borderRadius: (SHIELD_SIZE + 16) / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Shimmer accent lines
  shimLine: {
    position: 'absolute',
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  shimTop: { transform: [{ rotate: '0deg' }] },
  shimBottom: { transform: [{ rotate: '180deg' }] },
  shimLeft: { width: 20, height: 3, transform: [{ rotate: '90deg' }] },
  shimRight: { width: 20, height: 3, transform: [{ rotate: '270deg' }] },

  shieldCircle: {
    width: SHIELD_SIZE,
    height: SHIELD_SIZE,
    borderRadius: SHIELD_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },

  appName: {
    fontSize: FONTS.xxl + 2,
    fontWeight: FONTS.bold,
    color: '#fff',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },

  tagline: {
    fontSize: FONTS.base,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FONTS.medium,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // Progress bar
  progressContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 70 : 55,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  progressTrack: {
    width: 140,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 2,
  },
});