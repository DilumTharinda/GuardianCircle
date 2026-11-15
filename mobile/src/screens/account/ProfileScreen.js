/**
 * GuardianCircle — ProfileScreen.js
 * Member 6 owns this screen.
 *
 * Animations:
 *  1. Dark green header fades + scales in
 *  2. Info cards slide up with stagger
 *  3. Logout button presses down
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { ROUTES } from '../../constants/routes';
import { subscribeUserCircles } from '../../services/trustedCircleGroupService';
import ThemeToggle from '../../components/ThemeToggle';
import { scale, verticalScale, normalize } from '../../utils/responsive';

function formatRole(role) {
  if (!role) return 'User';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { userProfile, logout } = useAuth();
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [circlesCount, setCirclesCount] = useState(0);

  // Subscribe in real-time to user's Trusted Circles count
  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeUserCircles(userProfile.uid, (circles) => {
      setCirclesCount(Array.isArray(circles) ? circles.length : 0);
    });
    return () => unsub?.();
  }, [userProfile?.uid]);

  // Animations
  const headerAnim  = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(0.7)).current;
  const card1Anim   = useRef(new Animated.Value(0)).current;
  const card2Anim   = useRef(new Animated.Value(0)).current;
  const card1Slide  = useRef(new Animated.Value(24)).current;
  const card2Slide  = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.spring(avatarScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(card1Anim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(card1Slide, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(card2Anim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(card2Slide, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to log out?');
      if (confirmed) {
        try {
          await logout();
        } catch (error) {
          window.alert('Logout Failed: An error occurred while logging out.');
        }
      }
      return;
    }

    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (error) {
            Alert.alert('Logout Failed', 'An error occurred while logging out.');
          }
        },
      },
    ]);
  };

  const initial = userProfile?.displayName
    ? userProfile.displayName[0].toUpperCase()
    : 'U';

  const styles = getStyles(colors, insets);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.darkGreen} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Dark green gradient header ── */}
        <Animated.View style={{ opacity: headerAnim }}>
          <LinearGradient
            colors={[colors.darkGreen, colors.darkGreenMid]}
            style={styles.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={{ position: 'absolute', top: (insets?.top || 24) + 6, right: scale(15) }}>
              <ThemeToggle iconColor="#fff" />
            </View>

            {/* Avatar */}
            <Animated.View
              style={[styles.avatarWrapper, { transform: [{ scale: avatarScale }] }]}
            >
              {userProfile?.photoURL ? (
                <Image source={{ uri: userProfile.photoURL }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              )}
              {/* Online indicator */}
              <View style={styles.onlineDot} />
            </Animated.View>

            <Text style={styles.headerName} numberOfLines={1} ellipsizeMode="tail">
              {userProfile?.displayName || 'User Name'}
            </Text>
            <Text style={styles.headerUsername} numberOfLines={1} ellipsizeMode="tail">
              @{userProfile?.username || 'username'}
            </Text>
            <Text style={styles.headerEmail} numberOfLines={1} ellipsizeMode="tail">
              {userProfile?.email || 'email@example.com'}
            </Text>

            {/* Role badge */}
            <View style={styles.roleBadge}>
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={13}
                color="rgba(255,255,255,0.9)"
              />
              <Text style={styles.roleBadgeText}>{formatRole(userProfile?.role)}</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Stats row ── */}
        <Animated.View
          style={[
            styles.statsCard,
            SHADOWS.card,
            { opacity: card1Anim, transform: [{ translateY: card1Slide }] },
          ]}
        >
          <StatBlock
            colors={colors}
            icon={<MaterialCommunityIcons name="star-outline" size={22} color={colors.darkGreenMid} />}
            value={userProfile?.karma || 0}
            label="Karma"
          />
          <View style={styles.statDivider} />
          <StatBlock
            colors={colors}
            icon={<Ionicons name="people-outline" size={22} color={colors.darkGreenMid} />}
            value={circlesCount}
            label="Circle"
            onPress={() => navigation.navigate(ROUTES.TRUSTED_CIRCLE)}
          />
          <View style={styles.statDivider} />
          <StatBlock
            colors={colors}
            icon={<Ionicons name="walk-outline" size={22} color={colors.darkGreenMid} />}
            value={userProfile?.journeys || 0}
            label="Journeys"
          />
        </Animated.View>

        {/* ── Info rows ── */}
        <Animated.View
          style={[
            styles.section,
            SHADOWS.small,
            { opacity: card1Anim, transform: [{ translateY: card1Slide }] },
          ]}
        >
          <Text style={styles.sectionHeader}>Account</Text>
          <InfoRow
            colors={colors}
            icon={<Ionicons name="person-outline" size={18} color={colors.darkGreenMid} />}
            label="Display Name"
            value={userProfile?.displayName || '—'}
          />
          <InfoRow
            colors={colors}
            icon={<Ionicons name="at-outline" size={18} color={colors.darkGreenMid} />}
            label="Username"
            value={userProfile?.username || '—'}
          />
          <InfoRow
            colors={colors}
            icon={<Ionicons name="mail-outline" size={18} color={colors.darkGreenMid} />}
            label="Email"
            value={userProfile?.email || '—'}
          />
          <InfoRow
            colors={colors}
            icon={<MaterialCommunityIcons name="shield-account-outline" size={18} color={colors.darkGreenMid} />}
            label="Role"
            value={formatRole(userProfile?.role)}
            isLast
          />
        </Animated.View>

        {/* ── Settings rows ── */}
        <Animated.View
          style={[
            styles.section,
            SHADOWS.small,
            { opacity: card2Anim, transform: [{ translateY: card2Slide }] },
          ]}
        >
          <Text style={styles.sectionHeader}>Settings</Text>
          <MenuRow
            colors={colors}
            icon={<Ionicons name="create-outline" size={18} color={colors.darkGreenMid} />}
            label="Edit Profile"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuRow
            colors={colors}
            icon={<Ionicons name="notifications-outline" size={18} color={colors.darkGreenMid} />}
            label="Notifications"
            onPress={() => navigation.navigate(ROUTES.NOTIFICATION_SETTINGS)}
          />
          <MenuRow
            colors={colors}
            icon={<Ionicons name="lock-closed-outline" size={18} color={colors.darkGreenMid} />}
            label="Privacy & Safety"
            onPress={() => {}}
          />
          <MenuRow
            colors={colors}
            icon={<Ionicons name="help-circle-outline" size={18} color={colors.darkGreenMid} />}
            label="Help & Support"
            onPress={() => {}}
            isLast
          />
        </Animated.View>

        {/* ── Logout button ── */}
        <Animated.View style={{ opacity: card2Anim }}>
          <TouchableOpacity
            style={[styles.logoutButton, SHADOWS.small]}
            onPress={handleLogout}
            activeOpacity={0.75}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.dangerRed} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function StatBlock({ colors, icon, value, label, onPress }) {
  const styles = getStyles(colors);
  return (
    <TouchableOpacity
      style={styles.statBlock}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      {icon}
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({ colors, icon, label, value, isLast }) {
  const styles = getStyles(colors);
  return (
    <View style={[styles.infoRow, isLast && styles.infoRowLast]}>
      <View style={styles.infoRowIcon}>{icon}</View>
      <Text style={styles.infoLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">{value}</Text>
    </View>
  );
}

function MenuRow({ colors, icon, label, onPress, isLast }) {
  const styles = getStyles(colors);
  return (
    <TouchableOpacity
      style={[styles.menuRow, isLast && styles.menuRowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.infoRowIcon}>{icon}</View>
      <Text style={styles.menuLabel} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const getStyles = (colors, insets) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Math.max(insets?.bottom || 0, 32) + 20 },

  // Header
  headerGradient: {
    paddingTop: (insets?.top || 24) + verticalScale(20),
    paddingBottom: verticalScale(28),
    alignItems: 'center',
    gap: scale(6),
  },
  avatarWrapper: {
    marginBottom: 8,
  },
  avatar: {
    width: scale(88),
    height: scale(88),
    borderRadius: scale(44),
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarText: {
    fontSize: normalize(38),
    fontWeight: FONTS.bold,
    color: '#fff',
  },
  onlineDot: {
    position: 'absolute',
    bottom: scale(4),
    right: scale(4),
    width: scale(14),
    height: scale(14),
    borderRadius: scale(7),
    backgroundColor: colors.accentGreen,
    borderWidth: 2,
    borderColor: colors.darkGreenMid,
  },
  headerName: {
    fontSize: normalize(22),
    fontWeight: FONTS.bold,
    color: '#fff',
  },
  headerUsername: {
    fontSize: normalize(13),
    color: 'rgba(255,255,255,0.8)',
    fontWeight: FONTS.medium,
    marginBottom: 2,
  },
  headerEmail: {
    fontSize: normalize(13),
    color: 'rgba(255,255,255,0.75)',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: normalize(11),
    fontWeight: FONTS.semiBold,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },

  // Stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.xl,
    marginTop: -18,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize: normalize(18),
    fontWeight: FONTS.bold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: normalize(11),
    color: colors.textSecondary,
    fontWeight: FONTS.medium,
  },

  // Section
  section: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: normalize(11),
    fontWeight: FONTS.bold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: 6,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: SPACING.sm,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoRowIcon: {
    width: 30,
    alignItems: 'center',
  },
  infoLabel: {
    flex: 1,
    fontSize: normalize(13),
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: normalize(13),
    fontWeight: FONTS.semiBold,
    color: colors.textPrimary,
    maxWidth: '55%',
    textAlign: 'right',
  },

  // Menu rows
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: SPACING.sm,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuLabel: {
    flex: 1,
    fontSize: normalize(14),
    color: colors.textPrimary,
    fontWeight: FONTS.medium,
  },

  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
  },
  logoutText: {
    fontSize: normalize(14),
    fontWeight: FONTS.bold,
    color: colors.dangerRed,
  },
});
