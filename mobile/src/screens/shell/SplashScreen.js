/**
 * GuardianCircle — SplashScreen.js
 * Member 1 builds this screen.
 *
 * Animations:
 *  1. Logo shield fades + scales in (0 → 600ms)
 *  2. App name slides up and fades in (400 → 900ms)
 *  3. Tagline fades in (700 → 1100ms)
 *  4. Pulsing ring around shield (loops while waiting)
 *  5. Navigates to Auth or Main after auth state resolves
 *
 * Place at: mobile/src/screens/shell/SplashScreen.js
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  // Animation values
  const shieldScale = useRef(new Animated.Value(0.4)).current;
  const shieldOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(28)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    // Step 1: Shield appears
    Animated.parallel([
      Animated.spring(shieldScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(shieldOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Step 2: Title slides up
    Animated.sequence([
      Animated.delay(350),
      Animated.parallel([
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 480,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Step 3: Tagline fades in
    Animated.sequence([
      Animated.delay(650),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Step 4: Pulse ring loop
    const pulse = () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.55,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => pulse());
    };

    setTimeout(pulse, 600);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary, COLORS.primaryMid]}
        style={styles.gradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      >
        {/* Shield icon with pulse ring */}
        <View style={styles.logoContainer}>
          {/* Outer pulse ring */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />

          {/* Shield circle */}
          <Animated.View
            style={[
              styles.shieldCircle,
              {
                transform: [{ scale: shieldScale }],
                opacity: shieldOpacity,
              },
            ]}
          >
            {/* Shield SVG-style using text emoji fallback */}
            <Text style={styles.shieldIcon}>🛡️</Text>
          </Animated.View>
        </View>

        {/* App name */}
        <Animated.Text
          style={[
            styles.appName,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            },
          ]}
        >
          GuardianCircle
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text
          style={[styles.tagline, { opacity: taglineOpacity }]}
        >
          Your safety, always connected
        </Animated.Text>

        {/* Bottom loader dots */}
        <Animated.View
          style={[styles.dotsContainer, { opacity: taglineOpacity }]}
        >
          <LoadingDots />
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

// Animated loading dots
function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(800 - delay),
        ])
      ).start();
    };

    animateDot(dot1, 0);
    animateDot(dot2, 200);
    animateDot(dot3, 400);
  }, []);

  return (
    <View style={styles.dots}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { opacity: dot }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
  },

  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    width: 140,
    height: 140,
  },

  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  shieldCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },

  shieldIcon: {
    fontSize: 46,
  },

  appName: {
    fontSize: FONTS.xxl,
    fontWeight: FONTS.bold,
    color: COLORS.white,
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },

  tagline: {
    fontSize: FONTS.base,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: FONTS.regular,
    letterSpacing: 0.2,
  },

  dotsContainer: {
    position: 'absolute',
    bottom: 60,
  },

  dots: {
    flexDirection: 'row',
    gap: 8,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});