/**
 * GuardianCircle — ForgotPasswordScreen.js
 * Matches the LoginScreen design language: dark-green gradient header
 * with curved bottom, white form card, and green accent colors.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const { resetPassword } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  // Animations (matching LoginScreen)
  const headerHeight   = useRef(new Animated.Value(0)).current;
  const formOpacity    = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(40)).current;
  const buttonScale    = useRef(new Animated.Value(1)).current;
  const errorShake     = useRef(new Animated.Value(0)).current;
  const iconOpacity    = useRef(new Animated.Value(0)).current;
  const iconScale      = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(headerHeight, {
        toValue: 1, duration: 500, useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.spring(iconScale, {
          toValue: 1, tension: 70, friction: 6, useNativeDriver: true,
        }),
        Animated.timing(iconOpacity, {
          toValue: 1, duration: 350, useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1, duration: 400, useNativeDriver: true,
        }),
        Animated.spring(formTranslateY, {
          toValue: 0, tension: 60, friction: 8, useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  function shakeError() {
    Animated.sequence([
      Animated.timing(errorShake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  function onPressIn() {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
  }

  function onPressOut() {
    Animated.spring(buttonScale, {
      toValue: 1, tension: 200, friction: 5, useNativeDriver: true,
    }).start();
  }

  async function handleReset() {
    setError('');
    if (!email.trim()) {
      setError('Please enter your registered email address.');
      shakeError();
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase());
      Alert.alert(
        'Email Sent',
        'A password reset link has been sent to your email address. Please check your inbox.',
        [
          {
            text: 'Back to Login',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (err) {
      let message = 'Failed to send reset email. Please try again.';
      if (err.code === 'auth/user-not-found') {
        message = 'No account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      }
      setError(message);
      shakeError();
    } finally {
      setLoading(false);
    }
  }

  const headerHeightInterpolated = headerHeight.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '38%'],
  });

  const styles = getStyles(colors);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.darkGreen} />

      {/* Green gradient header — same as LoginScreen */}
      <Animated.View style={[styles.headerWrapper, { height: headerHeightInterpolated }]}>
        <LinearGradient
          colors={[colors.darkGreen, colors.darkGreenMid]}
          style={[styles.headerGradient, { paddingTop: insets.top + 10 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Back button */}
          <TouchableOpacity
            style={[styles.backButton, { top: insets.top + 10 }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Icon */}
          <Animated.View
            style={[
              styles.logoArea,
              { transform: [{ scale: iconScale }], opacity: iconOpacity },
            ]}
          >
            <View style={styles.logoCircle}>
              <Ionicons name="lock-open-outline" size={32} color="#fff" />
            </View>
            <Text style={styles.logoText}>Reset Password</Text>
          </Animated.View>
        </LinearGradient>

        <View style={styles.headerCurve} />
      </Animated.View>

      {/* Form area */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.formCard,
              SHADOWS.card,
              {
                opacity: formOpacity,
                transform: [{ translateY: formTranslateY }],
              },
            ]}
          >
            <Text style={styles.welcomeText}>Forgot password?</Text>
            <Text style={styles.subText}>
              Enter the email address associated with your account and we'll send you a link to reset your password.
            </Text>

            {/* Error message */}
            {error ? (
              <Animated.View
                style={[
                  styles.errorBox,
                  { transform: [{ translateX: errorShake }] },
                ]}
              >
                <Ionicons name="warning-outline" size={16} color="#B91C1C" style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            {/* Email field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email address</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={focusedField === 'email' ? colors.darkGreenMid : colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleReset}
                />
              </View>
            </View>

            {/* Reset button */}
            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleReset}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                activeOpacity={1}
                disabled={loading}
              >
                <LinearGradient
                  colors={[colors.darkGreenMid, colors.darkGreen]}
                  style={styles.primaryButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Back to login */}
            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>Remember your password? </Text>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.loginLink}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  // Header — mirrors LoginScreen exactly
  headerWrapper: { width: '100%', overflow: 'hidden' },
  headerGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCurve: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  backButton: {
    position: 'absolute',
    top: 0,
    left: SPACING.base,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Logo area — same style as LoginScreen
  logoArea: { alignItems: 'center', gap: SPACING.sm },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  logoText: {
    fontSize: FONTS.md,
    fontWeight: FONTS.bold,
    color: '#fff',
    letterSpacing: 0.4,
  },

  // Scroll and card — same as LoginScreen
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  formCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
  },

  welcomeText: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    color: colors.textPrimary,
    marginBottom: SPACING.xs,
  },
  subText: {
    fontSize: FONTS.sm,
    color: colors.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },

  // Error — same as LoginScreen
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.dangerRed,
  },
  errorText: {
    flex: 1,
    fontSize: FONTS.sm,
    color: '#B91C1C',
    fontWeight: FONTS.medium,
  },

  // Fields — same as LoginScreen
  fieldGroup: { marginBottom: SPACING.lg },
  fieldLabel: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.semiBold,
    color: colors.textPrimary,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    height: 52,
  },
  inputWrapperFocused: {
    borderColor: colors.darkGreenMid,
    backgroundColor: colors.darkGreenSurface,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: {
    flex: 1,
    fontSize: FONTS.base,
    color: colors.textPrimary,
    height: '100%',
  },

  // Button — same as LoginScreen
  primaryButton: { borderRadius: RADIUS.md, overflow: 'hidden' },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: '#fff',
    letterSpacing: 0.3,
  },

  // Login link — same as LoginScreen register row
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.lg },
  loginPrompt: { fontSize: FONTS.sm, color: colors.textSecondary },
  loginLink: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: colors.darkGreenMid,
  },
});
