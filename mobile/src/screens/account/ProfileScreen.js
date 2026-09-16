/**
 * GuardianCircle — ProfileScreen.js
 * Member 6 owns this screen.
 *
 * Animations:
 *  1. Dark green header fades + scales in
 *  2. Info cards slide up with stagger
 *  3. Logout button presses down
 */

import React, { useRef, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

function formatRole(role) {
  if (!role) return 'User';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfileScreen() {
  const { userProfile, logout } = useAuth();
  const navigation = useNavigation();

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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.darkGreen} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Dark green gradient header ── */}
        <Animated.View style={{ opacity: headerAnim }}>
          <LinearGradient
            colors={[COLORS.darkGreen, COLORS.darkGreenMid]}
            style={styles.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Avatar */}
            <Animated.View
              style={[styles.avatarWrapper, { transform: [{ scale: avatarScale }] }]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              {/* Online indicator */}
              <View style={styles.onlineDot} />
            </Animated.View>

            <Text style={styles.headerName}>
              {userProfile?.displayName || 'User Name'}
            </Text>
            <Text style={styles.headerEmail}>
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
            icon={<MaterialCommunityIcons name="star-outline" size={22} color={COLORS.darkGreenMid} />}
            value={userProfile?.karma || 0}
            label="Karma"
          />
          <View style={styles.statDivider} />
          <StatBlock
            icon={<Ionicons name="people-outline" size={22} color={COLORS.darkGreenMid} />}
            value={userProfile?.trustedCount || 0}
            label="Circle"
          />
          <View style={styles.statDivider} />
          <StatBlock
            icon={<Ionicons name="walk-outline" size={22} color={COLORS.darkGreenMid} />}
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
            icon={<Ionicons name="person-outline" size={18} color={COLORS.darkGreenMid} />}
            label="Display Name"
            value={userProfile?.displayName || '—'}
          />
          <InfoRow
            icon={<Ionicons name="mail-outline" size={18} color={COLORS.darkGreenMid} />}
            label="Email"
            value={userProfile?.email || '—'}
          />
          <InfoRow
            icon={<MaterialCommunityIcons name="shield-account-outline" size={18} color={COLORS.darkGreenMid} />}
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
            icon={<Ionicons name="create-outline" size={18} color={COLORS.darkGreenMid} />}
            label="Edit Profile"
            onPress={() => {}}
          />
          <MenuRow
            icon={<Ionicons name="notifications-outline" size={18} color={COLORS.darkGreenMid} />}
            label="Notifications"
            onPress={() => {}}
          />
          <MenuRow
            icon={<Ionicons name="lock-closed-outline" size={18} color={COLORS.darkGreenMid} />}
            label="Privacy & Safety"
            onPress={() => {}}
          />
          <MenuRow
            icon={<Ionicons name="help-circle-outline" size={18} color={COLORS.darkGreenMid} />}
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
            <Ionicons name="log-out-outline" size={20} color={COLORS.dangerRed} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function StatBlock({ icon, value, label }) {
  return (
    <View style={styles.statBlock}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, isLast }) {
  return (
    <View style={[styles.infoRow, isLast && styles.infoRowLast]}>
      <View style={styles.infoRowIcon}>{icon}</View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function MenuRow({ icon, label, onPress, isLast }) {
  return (
    <TouchableOpacity
      style={[styles.menuRow, isLast && styles.menuRowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.infoRowIcon}>{icon}</View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Header
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 32,
    alignItems: 'center',
    gap: 6,
  },
  avatarWrapper: {
    marginBottom: 8,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarText: {
    fontSize: 38,
    fontWeight: FONTS.bold,
    color: '#fff',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.accentGreen,
    borderWidth: 2,
    borderColor: COLORS.darkGreenMid,
  },
  headerName: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    color: '#fff',
  },
  headerEmail: {
    fontSize: FONTS.sm,
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
    fontSize: FONTS.xs,
    fontWeight: FONTS.semiBold,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },

  // Stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.border,
  },
  statValue: {
    fontSize: FONTS.lg,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: FONTS.xs,
    color: COLORS.textSecondary,
    fontWeight: FONTS.medium,
  },

  // Section
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: FONTS.xs,
    fontWeight: FONTS.bold,
    color: COLORS.textMuted,
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
    borderBottomColor: COLORS.divider,
    gap: SPACING.sm,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoRowIcon: {
    width: 30,
    alignItems: 'center',
  },
  infoLabel: {
    flex: 1,
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.semiBold,
    color: COLORS.textPrimary,
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
    borderBottomColor: COLORS.divider,
    gap: SPACING.sm,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuLabel: {
    flex: 1,
    fontSize: FONTS.base,
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
  },
  logoutText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.dangerRed,
  },
});
