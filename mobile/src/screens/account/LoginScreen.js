/**
 * GuardianCircle — LoginScreen.js
 * Member 6 owns this screen (UI built by Member 1 as part of the shell).
 *
 * Animations:
 *  1. Dark green header arc slides down on mount
 *  2. Form card fades + translates up
 *  3. Input fields focus ring animates in
 *  4. Login button scales on press
 *  5. Error message shakes horizontally
 *
 * Place at: mobile/src/screens/account/LoginScreen.js
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
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login, loginWithGoogle, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  // Animation refs
  const headerHeight    = useRef(new Animated.Value(0)).current;
  const formOpacity     = useRef(new Animated.Value(0)).current;
  const formTranslateY  = useRef(new Animated.Value(40)).current;
  const buttonScale     = useRef(new Animated.Value(1)).current;
  const errorShake      = useRef(new Animated.Value(0)).current;
  const logoScale       = useRef(new Animated.Value(0.7)).current;
  const logoOpacity     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequence: header → logo → form
    Animated.sequence([
      Animated.timing(headerHeight, {
        toValue: 1, duration: 500, useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1, tension: 70, friction: 6, useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
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

  async function handleLogin() {
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      shakeError();
      return;
    }

    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // Navigation handled automatically by AppNavigator auth state listener
    } catch (err) {
      let message = 'Login failed. Please try again.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'Incorrect email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Try again later.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      }
      setError(message);
      shakeError();
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError('Google Sign-In failed. Please try again.');
      shakeError();
    } finally {
      setLoading(false);
    }
  }

  const headerHeightInterpolated = headerHeight.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '38%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.darkGreen} />

      {/* Animated dark green header */}
      <Animated.View style={[styles.headerWrapper, { height: headerHeightInterpolated }]}>
        <LinearGradient
          colors={[COLORS.darkGreen, COLORS.darkGreenMid]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Logo */}
          <Animated.View
            style={[
              styles.logoArea,
              { transform: [{ scale: logoScale }], opacity: logoOpacity },
            ]}
          >
            <View style={styles.logoCircle}>
              <MaterialCommunityIcons name="shield-check" size={34} color="#fff" />
            </View>
            <Text style={styles.logoText}>GuardianCircle</Text>
          </Animated.View>
        </LinearGradient>

        {/* Curved bottom of header */}
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
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.subText}>Sign in to your account</Text>

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
                  color={focusedField === 'email' ? COLORS.darkGreenMid : COLORS.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Password field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={focusedField === 'password' ? COLORS.darkGreenMid : COLORS.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot password */}
            <TouchableOpacity style={styles.forgotRow} onPress={() => navigation.navigate(ROUTES.FORGOT_PASSWORD)} disabled={loading}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Login button */}
            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                activeOpacity={1}
                disabled={loading}
              >
                <LinearGradient
                  colors={[COLORS.darkGreenMid, COLORS.darkGreen]}
                  style={styles.loginButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.loginButtonText}>Sign in</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google sign in */}
            <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} disabled={loading}>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* Register link */}
            <View style={styles.registerRow}>
              <Text style={styles.registerPrompt}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate(ROUTES.REGISTER)}>
                <Text style={styles.registerLink}>Create one</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },

  // Header
  headerWrapper: { width: '100%', overflow: 'hidden' },
  headerGradient: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCurve: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  // Logo
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

  // Scroll and card
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  formCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
  },

  welcomeText: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  subText: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.dangerRed,
  },
  errorText: {
    flex: 1,
    fontSize: FONTS.sm,
    color: '#B91C1C',
    fontWeight: FONTS.medium,
  },

  // Fields
  fieldGroup: { marginBottom: SPACING.md },
  fieldLabel: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.semiBold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    height: 52,
  },
  inputWrapperFocused: {
    borderColor: COLORS.darkGreenMid,
    backgroundColor: COLORS.darkGreenSurface,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: {
    flex: 1,
    fontSize: FONTS.base,
    color: COLORS.textPrimary,
    height: '100%',
  },

  forgotRow: { alignItems: 'flex-end', marginBottom: SPACING.lg },
  forgotText: {
    fontSize: FONTS.sm,
    color: COLORS.darkGreenMid,
    fontWeight: FONTS.semiBold,
  },

  // Login button
  loginButton: { borderRadius: RADIUS.md, overflow: 'hidden' },
  loginButtonDisabled: { opacity: 0.7 },
  loginButtonGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: '#fff',
    letterSpacing: 0.3,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: FONTS.sm, color: COLORS.textMuted },

  // Google
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  googleIcon: {
    fontSize: FONTS.md,
    fontWeight: FONTS.bold,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.medium,
    color: COLORS.textPrimary,
  },

  // Register link
  registerRow: { flexDirection: 'row', justifyContent: 'center' },
  registerPrompt: { fontSize: FONTS.sm, color: COLORS.textSecondary },
  registerLink: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: COLORS.darkGreenMid,
  },
});