import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

export default function VerifyEmailScreen() {
  const { user, reloadUser, resendVerificationEmail, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  async function handleCheckVerification() {
    setLoading(true);
    try {
      const isVerified = await reloadUser();
      if (!isVerified) {
        Alert.alert(
          'Still Pending',
          'We checked, but your email is still not verified. Please click the link in the email we sent you.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to check verification status. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendEmail() {
    setResendLoading(true);
    try {
      await resendVerificationEmail();
      Alert.alert(
        'Email Sent',
        'A new verification link has been sent to your email address.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      // If they sent too many requests, Firebase will throw an error
      let message = 'Failed to resend verification email. Please try again later.';
      if (err.code === 'auth/too-many-requests') {
        message = 'Please wait a few minutes before requesting another email.';
      }
      Alert.alert('Error', message);
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.darkGreen} />
      
      <View style={styles.content}>
        <View style={[styles.card, SHADOWS.card]}>
          <View style={styles.iconContainer}>
            <Ionicons name="mail-unread-outline" size={60} color={COLORS.darkGreenMid} />
          </View>
          
          <Text style={styles.titleText}>Verify Your Email</Text>
          
          <Text style={styles.subText}>
            We've sent a verification link to:
          </Text>
          <Text style={styles.emailText}>{user?.email}</Text>
          
          <Text style={styles.instructionText}>
            Please check your inbox and click the link to verify your account. Once verified, click the button below to continue.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleCheckVerification}
            disabled={loading || resendLoading}
            activeOpacity={0.8}
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
                <Text style={styles.primaryButtonText}>I've Verified My Email</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton} 
            onPress={handleResendEmail}
            disabled={resendLoading || loading}
          >
            {resendLoading ? (
              <ActivityIndicator color={COLORS.darkGreenMid} size="small" />
            ) : (
              <Text style={styles.secondaryButtonText}>Resend Link</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.logoutRow} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color={COLORS.dangerRed} />
            <Text style={styles.logoutText}>Sign Out / Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.base,
  },
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.darkGreenSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  titleText: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  subText: {
    fontSize: FONTS.base,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emailText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.darkGreen,
    marginVertical: SPACING.xs,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginVertical: SPACING.lg,
  },
  primaryButton: { 
    width: '100%', 
    borderRadius: RADIUS.md, 
    overflow: 'hidden', 
    marginBottom: SPACING.md 
  },
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
  secondaryButton: {
    width: '100%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.darkGreenMid,
    marginBottom: SPACING.lg,
  },
  secondaryButtonText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.darkGreenMid,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.sm,
  },
  logoutText: {
    fontSize: FONTS.base,
    color: COLORS.dangerRed,
    fontWeight: FONTS.semiBold,
  },
});
