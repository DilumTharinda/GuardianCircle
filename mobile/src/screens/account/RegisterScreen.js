/**
 * GuardianCircle — RegisterScreen.js
 * Member 6 owns this screen (UI built by Member 1 as part of the shell).
 *
 * Animations:
 *  1. Header slides down on mount
 *  2. Form steps fade + slide in (multi-step form)
 *  3. Role selector cards animate on selection
 *  4. Progress bar fills as steps complete
 *  5. Submit button scales on press
 *  6. Success checkmark animates before navigating
 *
 * Place at: mobile/src/screens/account/RegisterScreen.js
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
import { SELECTABLE_ROLES, ROLES } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 3;

// Role display config — icons instead of emoji
const ROLE_CONFIG = {
  [ROLES.PRIMARY_USER]: {
    iconLib: 'Ionicons', icon: 'person-outline',
    label: 'Personal User', desc: 'Safety, journeys & lost/found',
  },
  [ROLES.PARENT_GUARDIAN]: {
    iconLib: 'Ionicons', icon: 'people-outline',
    label: 'Parent / Guardian', desc: "Monitor your child's safety",
  },
  [ROLES.CHILD_DEPENDENT]: {
    iconLib: 'Ionicons', icon: 'happy-outline',
    label: 'Child / Dependent', desc: 'Simplified safety features',
  },
  [ROLES.PET_OWNER]: {
    iconLib: 'MaterialCommunity', icon: 'paw-outline',
    label: 'Pet Owner', desc: 'Track pets & valuables',
  },
  [ROLES.TRUSTED_CONTACT]: {
    iconLib: 'MaterialCommunity', icon: 'shield-account-outline',
    label: 'Trusted Contact', desc: 'Receive safety alerts',
  },
};

function RoleIcon({ iconLib, icon, size, color }) {
  if (iconLib === 'MaterialCommunity') {
    return <MaterialCommunityIcons name={icon} size={size} color={color} />;
  }
  return <Ionicons name={icon} size={size} color={color} />;
}

export default function RegisterScreen() {
  const navigation = useNavigation();
  const { register, loginWithGoogle } = useAuth();

  // Form state
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState(ROLES.PRIMARY_USER);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  // Animations
  const headerAnim    = useRef(new Animated.Value(0)).current;
  const formOpacity   = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(30)).current;
  const progressWidth = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;
  const buttonScale   = useRef(new Animated.Value(1)).current;
  const errorShake    = useRef(new Animated.Value(0)).current;
  const stepSlide     = useRef(new Animated.Value(0)).current;
  const successScale  = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(headerAnim, {
        toValue: 1, duration: 450, useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1, duration: 380, useNativeDriver: true,
        }),
        Animated.spring(formTranslateY, {
          toValue: 0, tension: 65, friction: 8, useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // Animate progress bar when step changes
  useEffect(() => {
    Animated.timing(progressWidth, {
      toValue: step / TOTAL_STEPS,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [step]);

  function animateStepTransition(direction = 1) {
    Animated.sequence([
      Animated.timing(stepSlide, {
        toValue: -30 * direction, duration: 150, useNativeDriver: true,
      }),
      Animated.timing(stepSlide, {
        toValue: 0, duration: 200, useNativeDriver: true,
      }),
    ]).start();
  }

  function shakeError() {
    Animated.sequence([
      Animated.timing(errorShake, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 7, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -7, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }

  function onButtonPressIn() {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
  }

  function onButtonPressOut() {
    Animated.spring(buttonScale, { toValue: 1, tension: 200, friction: 5, useNativeDriver: true }).start();
  }

  function validateStep1() {
    if (!displayName.trim()) return 'Please enter your full name.';
    if (displayName.trim().length < 2) return 'Name must be at least 2 characters.';
    return null;
  }

  function validateStep2() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) return 'Please enter your email address.';
    if (!emailRegex.test(email.trim())) return 'Please enter a valid email address.';
    if (!password) return 'Please enter a password.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  function handleNext() {
    setError('');
    let validationError = null;
    if (step === 1) validationError = validateStep1();
    if (step === 2) validationError = validateStep2();

    if (validationError) {
      setError(validationError);
      shakeError();
      return;
    }

    animateStepTransition(1);
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError('');
    animateStepTransition(-1);
    setStep((s) => s - 1);
  }

  async function handleRegister() {
    setError('');
    setLoading(true);
    try {
      await register(
        email.trim().toLowerCase(),
        password,
        displayName.trim(),
        selectedRole
      );

      // Success animation before navigating
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1, tension: 60, friction: 6, useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 1, duration: 300, useNativeDriver: true,
        }),
      ]).start();

      // AppNavigator will auto-navigate on auth state change
    } catch (err) {
      let message = 'Registration failed. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Try signing in instead.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Password is too weak. Please use at least 8 characters.';
      } else if (err.message) {
        message = err.message;
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
      // AppNavigator will auto-navigate on auth state change
    } catch (err) {
      setError('Google Sign-In failed. Please try again.');
      shakeError();
    } finally {
      setLoading(false);
    }
  }

  const headerHeightAnim = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '28%'],
  });

  const progressBarWidth = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.darkGreen} />

      {/* Animated dark green header */}
      <Animated.View style={[styles.headerWrapper, { height: headerHeightAnim }]}>
        <LinearGradient
          colors={[COLORS.darkGreen, COLORS.darkGreenMid]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => step > 1 ? handleBack() : navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create account</Text>
            <Text style={styles.headerStep}>{step} of {TOTAL_STEPS}</Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: progressBarWidth }]}
            />
          </View>
        </LinearGradient>
        <View style={styles.headerCurve} />
      </Animated.View>

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
                transform: [
                  { translateY: formTranslateY },
                  { translateX: stepSlide },
                ],
              },
            ]}
          >
            {/* Error box */}
            {error ? (
              <Animated.View
                style={[styles.errorBox, { transform: [{ translateX: errorShake }] }]}
              >
                <Ionicons name="warning-outline" size={16} color="#B91C1C" style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            {/* ── STEP 1: Name ── */}
            {step === 1 && (
              <View>
                <Text style={styles.stepTitle}>What's your name?</Text>
                <Text style={styles.stepSubtitle}>
                  This is how your trusted circle will see you.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Full name</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedField === 'name' && styles.inputWrapperFocused,
                  ]}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={focusedField === 'name' ? COLORS.darkGreenMid : COLORS.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Amal Perera"
                      placeholderTextColor={COLORS.textMuted}
                      value={displayName}
                      onChangeText={setDisplayName}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={handleNext}
                    />
                  </View>
                </View>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Google sign up */}
                <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} disabled={loading}>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 2: Email + Password ── */}
            {step === 2 && (
              <View>
                <Text style={styles.stepTitle}>Account details</Text>
                <Text style={styles.stepSubtitle}>
                  Hi {displayName.split(' ')[0]}! Set up your login credentials.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email address</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedField === 'email' && styles.inputWrapperFocused,
                  ]}>
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

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedField === 'password' && styles.inputWrapperFocused,
                  ]}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={focusedField === 'password' ? COLORS.darkGreenMid : COLORS.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Min. 8 chars, 1 uppercase, 1 number"
                      placeholderTextColor={COLORS.textMuted}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!showPassword}
                      returnKeyType="next"
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

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Confirm password</Text>
                  <View style={[
                    styles.inputWrapper,
                    focusedField === 'confirm' && styles.inputWrapperFocused,
                    confirmPassword && password !== confirmPassword && styles.inputWrapperError,
                  ]}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={focusedField === 'confirm' ? COLORS.darkGreenMid : COLORS.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Re-enter your password"
                      placeholderTextColor={COLORS.textMuted}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setFocusedField('confirm')}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!showPassword}
                      returnKeyType="done"
                      onSubmitEditing={handleNext}
                    />
                    {confirmPassword && password === confirmPassword && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                    )}
                  </View>
                </View>

                {/* Password strength hint */}
                {password.length > 0 && (
                  <PasswordStrengthBar password={password} />
                )}
              </View>
            )}

            {/* ── STEP 3: Role Selection ── */}
            {step === 3 && (
              <View>
                <Text style={styles.stepTitle}>How will you use it?</Text>
                <Text style={styles.stepSubtitle}>
                  Choose the role that best describes you. You can change this later.
                </Text>

                <View style={styles.rolesGrid}>
                  {SELECTABLE_ROLES.map((roleItem) => {
                    const config = ROLE_CONFIG[roleItem.value];
                    const isSelected = selectedRole === roleItem.value;
                    return (
                      <RoleCard
                        key={roleItem.value}
                        iconLib={config.iconLib}
                        icon={config.icon}
                        label={config.label}
                        desc={config.desc}
                        selected={isSelected}
                        onPress={() => setSelectedRole(roleItem.value)}
                      />
                    );
                  })}
                </View>
              </View>
            )}

            {/* Next / Register button */}
            <Animated.View
              style={[styles.buttonWrapper, { transform: [{ scale: buttonScale }] }]}
            >
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={step < TOTAL_STEPS ? handleNext : handleRegister}
                onPressIn={onButtonPressIn}
                onPressOut={onButtonPressOut}
                activeOpacity={1}
                disabled={loading}
              >
                <LinearGradient
                  colors={[COLORS.darkGreenMid, COLORS.darkGreen]}
                  style={styles.primaryButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <View style={styles.primaryButtonInner}>
                      <Text style={styles.primaryButtonText}>
                        {step < TOTAL_STEPS ? 'Continue' : 'Create account'}
                      </Text>
                      {step < TOTAL_STEPS && (
                        <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
                      )}
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Login link */}
            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate(ROUTES.LOGIN)}>
                <Text style={styles.loginLink}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function RoleCard({ iconLib, icon, label, desc, selected, onPress }) {
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const borderAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(borderAnim, {
      toValue: selected ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();

    if (selected) {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: false }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 150, friction: 5, useNativeDriver: false }),
      ]).start();
    }
  }, [selected]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.darkGreenMid],
  });

  const backgroundColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.cardBackground, COLORS.darkGreenSurface],
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Animated.View
        style={[
          styles.roleCard,
          SHADOWS.small,
          {
            transform: [{ scale: scaleAnim }],
            borderColor,
            backgroundColor,
          },
        ]}
      >
        <View style={[styles.roleIconBg, selected && styles.roleIconBgSelected]}>
          <RoleIcon
            iconLib={iconLib}
            icon={icon}
            size={22}
            color={selected ? COLORS.darkGreenMid : COLORS.textMuted}
          />
        </View>
        <View style={styles.roleTextBlock}>
          <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>
            {label}
          </Text>
          <Text style={styles.roleDesc}>{desc}</Text>
        </View>
        {selected && (
          <View style={styles.roleCheckmark}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

function PasswordStrengthBar({ password }) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const barColors = ['', '#EF4444', '#F59E0B', '#3B82F6', COLORS.darkGreenMid];

  return (
    <View style={styles.strengthContainer}>
      <View style={styles.strengthBars}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.strengthSegment,
              { backgroundColor: i <= strength ? barColors[strength] : COLORS.border },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color: barColors[strength] }]}>
        {labels[strength]}
      </Text>
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
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.lg,
    justifyContent: 'space-between',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONTS.md,
    fontWeight: FONTS.bold,
    color: '#fff',
  },
  headerStep: {
    fontSize: FONTS.sm,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FONTS.medium,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: RADIUS.full,
    marginTop: SPACING.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: RADIUS.full,
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

  // Scroll + Card
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

  // Step content
  stepTitle: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  stepSubtitle: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 20,
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
  inputWrapperError: {
    borderColor: COLORS.dangerRed,
    backgroundColor: '#FEF2F2',
  },
  inputIcon: { marginRight: SPACING.sm },
  input: {
    flex: 1,
    fontSize: FONTS.base,
    color: COLORS.textPrimary,
    height: '100%',
  },

  // Password strength
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: {
    fontSize: FONTS.xs,
    fontWeight: FONTS.semiBold,
    minWidth: 40,
    textAlign: 'right',
  },

  // Roles
  rolesGrid: { gap: SPACING.sm, marginBottom: SPACING.lg },
  roleCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  roleIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIconBgSelected: { backgroundColor: COLORS.safeGreenLight },
  roleTextBlock: { flex: 1 },
  roleLabel: {
    fontSize: FONTS.base,
    fontWeight: FONTS.semiBold,
    color: COLORS.textPrimary,
  },
  roleLabelSelected: { color: COLORS.darkGreen },
  roleDesc: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  roleCheckmark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.darkGreenMid,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Button
  buttonWrapper: { marginTop: SPACING.lg, marginBottom: SPACING.md },
  primaryButton: { borderRadius: RADIUS.md, overflow: 'hidden' },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: '#fff',
    letterSpacing: 0.3,
  },

  // Login link
  loginRow: { flexDirection: 'row', justifyContent: 'center' },
  loginPrompt: { fontSize: FONTS.sm, color: COLORS.textSecondary },
  loginLink: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.darkGreenMid },
});