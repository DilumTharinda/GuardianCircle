/**
 * GuardianCircle — HomeScreen.js
 * Member 1 owns the shell. Dark green UI theme.
 *
 * Features:
 *  1. Dark green gradient header (greeting, location, bell, theme toggle)
 *  2. Search bar
 *  3. "You're marked safe" status card
 *  4. Animated circular SOS button (hold 2 sec) — centred with dual pulse rings
 *  5. Quick access icon cards
 *  6. Nearby activity cards with status chips
 *  7. Dark / Light mode toggle via ThemeContext
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  StatusBar,
  Vibration,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { isChild, ROLES } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';
import { FONTS, SPACING, RADIUS } from '../../constants/theme';
import { getPendingRequests, acceptLinkRequest } from '../../services/parentChildService';

const { width } = Dimensions.get('window');

// ── SOS button geometry ──────────────────────────────────────────
const SOS_SIZE  = 160;           // Diameter of the red button
const RING1_D   = SOS_SIZE + 64; // Inner pulse ring diameter
const RING2_D   = SOS_SIZE + 116;// Outer pulse ring diameter
const CONTAINER = RING2_D + 20;  // Container that holds everything

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const { userProfile } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();

  const childMode = userProfile && isChild(userProfile.role);
  const isParent  =
    !userProfile ||
    userProfile?.role === ROLES.PARENT_GUARDIAN ||
    userProfile?.role === ROLES.PRIMARY_USER;

  // ── Entry animations (all useNativeDriver: true — only transform/opacity) ──
  const headerAnim   = useRef(new Animated.Value(0)).current;
  const contentAnim  = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(22)).current;
  const bellAnim     = useRef(new Animated.Value(1)).current;

  // ── SOS rings (useNativeDriver: true — only scale/opacity) ──
  const ring1Scale   = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.35)).current;
  const ring2Scale   = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.18)).current;
  const sosScale     = useRef(new Animated.Value(1)).current;

  // ── SOS hold progress (useNativeDriver: false — drives `width`) ──
  const sosProgress  = useRef(new Animated.Value(0)).current;
  const [sosHeld, setSosHeld] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);

  useEffect(() => {
    if (childMode && userProfile?.uid) {
      const loadRequests = async () => {
        try {
          const reqs = await getPendingRequests(userProfile.uid);
          setPendingRequests(reqs);
        } catch (e) {
          console.warn('Failed to load pending requests', e);
        }
      };
      loadRequests();
      const interval = setInterval(loadRequests, 10000); // Check every 10s
      return () => clearInterval(interval);
    }
  }, [childMode, userProfile]);

  const handleAcceptRequest = async (linkId) => {
    try {
      await acceptLinkRequest(linkId);
      setPendingRequests(prev => prev.filter(r => r.id !== linkId));
    } catch (e) {
      console.warn('Failed to accept request', e);
    }
  };

  useEffect(() => {
    // 1. Entry sequence
    Animated.sequence([
      Animated.timing(headerAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(contentAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(contentSlide, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]),
    ]).start();

    // 2. Bell wiggle
    setTimeout(() => {
      Animated.sequence([
        Animated.timing(bellAnim, { toValue: 1.25, duration: 120, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: 0.9,  duration: 120, useNativeDriver: true }),
        Animated.spring(bellAnim, { toValue: 1, useNativeDriver: true }),
      ]).start();
    }, 900);

    // 3. SOS pulse rings — two rings offset by 550ms
    const pulseSOS = () => {
      Animated.parallel([
        // Ring 1 (inner) — scale + fade
        Animated.sequence([
          Animated.timing(ring1Scale,   { toValue: 1.50, duration: 1100, useNativeDriver: true }),
          Animated.timing(ring1Scale,   { toValue: 1,    duration: 1100, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ring1Opacity, { toValue: 0,    duration: 1100, useNativeDriver: true }),
          Animated.timing(ring1Opacity, { toValue: 0.35, duration: 1100, useNativeDriver: true }),
        ]),
        // Ring 2 (outer) — delayed by 550ms
        Animated.sequence([
          Animated.delay(550),
          Animated.timing(ring2Scale,   { toValue: 1.40, duration: 1100, useNativeDriver: true }),
          Animated.timing(ring2Scale,   { toValue: 1,    duration: 1100, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(550),
          Animated.timing(ring2Opacity, { toValue: 0,    duration: 1100, useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 0.18, duration: 1100, useNativeDriver: true }),
        ]),
      ]).start(() => pulseSOS());
    };
    setTimeout(pulseSOS, 800);
  }, []);

  // ── SOS hold-to-activate ────────────────────────────────────────
  function onSOSPressIn() {
    Vibration.vibrate(40);
    setSosHeld(true);
    // Scale down button (native driver — only transform)
    Animated.spring(sosScale, { toValue: 0.88, useNativeDriver: true }).start();
    // Fill progress over 2 sec (JS driver — width change)
    sosProgress.setValue(0);
    Animated.timing(sosProgress, { toValue: 1, duration: 2000, useNativeDriver: false })
      .start(({ finished }) => {
        if (finished) {
          Vibration.vibrate([0, 80, 80, 80]);
          navigation.navigate(ROUTES.SAFETY);
        }
      });
  }

  function onSOSPressOut() {
    setSosHeld(false);
    sosProgress.stopAnimation();
    sosProgress.setValue(0);
    Animated.spring(sosScale, { toValue: 1, tension: 200, friction: 5, useNativeDriver: true }).start();
  }

  // sosProgress → width % (JS driver, used only in a View child)
  const sosProgressWidth = sosProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const firstName = userProfile?.displayName?.split(' ')[0] || 'Guardian';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.darkGreen} />

      {/* ── Dark green header ── */}
      <Animated.View style={[styles.header, { opacity: headerAnim }]}>
        <LinearGradient
          colors={[colors.darkGreen, colors.darkGreenMid]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerRow}>
            {/* Left: greeting */}
            <View style={styles.headerLeft}>
              <Text style={styles.greetingSmall}>{getGreeting()}</Text>
              <Text style={styles.greetingName}>{firstName}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.75)" />
                <Text style={styles.locationText}>
                  {userProfile?.location || 'Colombo, Western Province'}
                </Text>
              </View>
            </View>
            {/* Right: theme toggle + bell */}
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={toggleTheme}
                accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <Ionicons
                  name={isDark ? 'sunny-outline' : 'moon-outline'}
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} accessibilityLabel="Notifications">
                <Animated.View style={{ transform: [{ scale: bellAnim }] }}>
                  <Ionicons name="notifications-outline" size={22} color="#fff" />
                </Animated.View>
                <View style={[styles.notifDot, { borderColor: colors.darkGreenMid }]} />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── Scrollable body ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: contentAnim,
            transform: [{ translateY: contentSlide }],
          }}
        >
          {/* Search bar */}
          <TouchableOpacity
            style={[styles.searchBar, { backgroundColor: colors.surface }]}
            activeOpacity={0.8}
          >
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <Text style={[styles.searchText, { color: colors.textMuted }]}>
              Search area or contact...
            </Text>
            <Ionicons name="options-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Pending Link Requests Banner */}
          {childMode && pendingRequests.length > 0 && (
            <View style={[styles.pendingCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
              <View style={[styles.safeCardIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="link-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.safeCardText}>
                <Text style={[styles.safeCardTitle, { color: colors.textPrimary }]}>
                  Tracking Request
                </Text>
                <Text style={[styles.safeCardSub, { color: colors.textSecondary }]}>
                  {pendingRequests[0].ownerName} wants to link with your account.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.safeViewBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleAcceptRequest(pendingRequests[0].id)}
              >
                <Text style={styles.safeViewBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* You're marked safe card */}
          <View style={[styles.safeCard, { backgroundColor: colors.surface, borderLeftColor: colors.darkGreenMid }]}>
            <View style={[styles.safeCardIcon, { backgroundColor: colors.safeGreenLight }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={22} color={colors.darkGreenMid} />
            </View>
            <View style={styles.safeCardText}>
              <Text style={[styles.safeCardTitle, { color: colors.textPrimary }]}>
                You're marked safe
              </Text>
              <Text style={[styles.safeCardSub, { color: colors.darkGreenMid }]}>
                No active journey · trusted circle: 4 people
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.safeViewBtn, { backgroundColor: colors.darkGreenMid }]}
              onPress={() => navigation.navigate(ROUTES.SAFETY)}
            >
              <Text style={styles.safeViewBtnText}>View</Text>
            </TouchableOpacity>
          </View>

          {/* ══════════════════════════════════════════════
              Animated SOS Button — centred in explicit container
          ══════════════════════════════════════════════ */}
          <View style={styles.sosSection}>
            {/* Fixed-size container so rings don't overflow */}
            <View style={styles.sosContainer}>

              {/* Outer pulse ring (ring 2) — anchored at centre */}
              <Animated.View
                style={[
                  styles.sosRingBase,
                  {
                    width: RING2_D,
                    height: RING2_D,
                    borderRadius: RING2_D / 2,
                    top: (CONTAINER - RING2_D) / 2,
                    left: (CONTAINER - RING2_D) / 2,
                    backgroundColor: colors.sosRing,
                    transform: [{ scale: ring2Scale }],
                    opacity: ring2Opacity,
                  },
                ]}
              />

              {/* Inner pulse ring (ring 1) */}
              <Animated.View
                style={[
                  styles.sosRingBase,
                  {
                    width: RING1_D,
                    height: RING1_D,
                    borderRadius: RING1_D / 2,
                    top: (CONTAINER - RING1_D) / 2,
                    left: (CONTAINER - RING1_D) / 2,
                    backgroundColor: colors.sosRing,
                    transform: [{ scale: ring1Scale }],
                    opacity: ring1Opacity,
                  },
                ]}
              />

              {/* SOS button — centred in container */}
              <Animated.View
                style={[
                  styles.sosBtnWrapper,
                  {
                    top: (CONTAINER - SOS_SIZE) / 2,
                    left: (CONTAINER - SOS_SIZE) / 2,
                    shadowColor: colors.primary,
                    transform: [{ scale: sosScale }],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.sosBtnTouch}
                  onPress={() => navigation.navigate(ROUTES.SAFETY)}
                  onPressIn={onSOSPressIn}
                  onPressOut={onSOSPressOut}
                  activeOpacity={0.9}
                  accessibilityLabel="Emergency SOS — tap to open, hold to activate"
                  accessibilityRole="button"
                >
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    style={styles.sosBtnGradient}
                  >
                    <Ionicons name="alert-circle-outline" size={40} color="#fff" />
                    <Text style={styles.sosBtnLabel}>SOS</Text>
                  </LinearGradient>

                  {/* Hold progress bar at bottom of button */}
                  {sosHeld && (
                    <View style={styles.sosProgressTrack}>
                      <Animated.View
                        style={[styles.sosProgressFill, { width: sosProgressWidth }]}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>

            </View>{/* end sosContainer */}

            <Text style={[styles.sosHint, { color: colors.textSecondary }]}>
              Hold 2 seconds to alert your trusted circle
            </Text>
          </View>
          {/* ══════════════════════════════════════════════ */}

          {/* Quick access */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick access</Text>
          <View style={styles.quickGrid}>
            {!childMode && (
              <QuickCard colors={colors} iconName="walk-outline" label="Journey"
                onPress={() => navigation.navigate(ROUTES.MAP)} />
            )}
            <QuickCard colors={colors} iconName="map-outline" label="Safe map"
              onPress={() => navigation.navigate(ROUTES.MAP)} />
            <QuickCard colors={colors} iconName="search-outline" label="Lost&found"
              onPress={() => navigation.navigate(ROUTES.LOST_FOUND)} />
            {!childMode && (
              <QuickCard colors={colors} iconName="people-outline" label="Circle"
                onPress={() => navigation.navigate(ROUTES.TRUSTED_CIRCLE)} />
            )}
          </View>

          {/* Nearby activity */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
              Nearby activity
            </Text>
            <TouchableOpacity>
              <Text style={[styles.seeAll, { color: colors.darkGreenMid }]}>See all</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: SPACING.sm }} />

          {isParent && (
            <NearbyCard
              colors={colors}
              icon={<Ionicons name="people-circle-outline" size={24} color={colors.darkGreenMid} />}
              title="Trusted circle"
              sub="4 members active"
              chip="Active"
              chipType="safe"
            />
          )}
          <NearbyCard
            colors={colors}
            icon={<Ionicons name="warning-outline" size={24} color={colors.warnOrange} />}
            title="Unsafe area · Galle Road"
            sub="Poor lighting · 400m away"
            chip="Caution"
            chipType="warn"
          />
          <NearbyCard
            colors={colors}
            icon={<MaterialCommunityIcons name="paw-outline" size={24} color={colors.missingPink} />}
            title="Possible match found"
            sub="Lost dog reported near Nugegoda"
            chip="Missing"
            chipType="missing"
          />

          <View style={{ height: 32 }} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function QuickCard({ colors, iconName, label, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cardW = Math.floor((width - SPACING.xl * 2 - SPACING.sm * 3) / 4);

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.91, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 5, useNativeDriver: true }).start()}
      activeOpacity={1}
    >
      <Animated.View
        style={[
          styles.quickCard,
          {
            width: cardW,
            backgroundColor: colors.surface,
            shadowColor: colors.shadow,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={[styles.quickCardIcon, { backgroundColor: colors.safeGreenLight }]}>
          <Ionicons name={iconName} size={22} color={colors.darkGreenMid} />
        </View>
        <Text style={[styles.quickCardLabel, { color: colors.textSecondary }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function NearbyCard({ colors, icon, title, sub, chip, chipType }) {
  const chipColors = {
    safe:    { bg: colors.safeGreenLight,  text: colors.darkGreenMid },
    warn:    { bg: colors.warnOrangeLight, text: colors.warnOrange },
    missing: { bg: colors.missingPinkLight, text: colors.missingPink },
  };
  const c = chipColors[chipType];

  return (
    <View style={[styles.nearbyCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
      <View style={[styles.nearbyIcon, { backgroundColor: colors.background }]}>
        {icon}
      </View>
      <View style={styles.nearbyText}>
        <Text style={[styles.nearbyTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.nearbySub, { color: colors.textSecondary }]}>{sub}</Text>
      </View>
      <View style={[styles.nearbyChip, { backgroundColor: c.bg }]}>
        <Text style={[styles.nearbyChipText, { color: c.text }]}>{chip}</Text>
      </View>
    </View>
  );
}

// ── Static styles (no colors — colors injected inline above) ────
const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 10,
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  greetingSmall: { fontSize: FONTS.sm, color: 'rgba(255,255,255,0.78)', fontWeight: FONTS.medium },
  greetingName:  { fontSize: FONTS.xxl, fontWeight: FONTS.bold, color: '#fff', marginTop: 2 },
  locationRow:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  locationText:  { fontSize: 11, color: 'rgba(255,255,255,0.72)' },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute', top: 7, right: 7,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#E53935',
    borderWidth: 1.5,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },

  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, height: 46,
    gap: SPACING.sm, marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  searchText: { flex: 1, fontSize: FONTS.base },

  // Safe card
  safeCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.lg,
    gap: SPACING.sm,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  safeCardIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  safeCardText: { flex: 1 },
  safeCardTitle: { fontSize: FONTS.base, fontWeight: FONTS.semiBold },
  safeCardSub:   { fontSize: 11, marginTop: 2, fontWeight: FONTS.medium },
  safeViewBtn:   { borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 7 },
  safeViewBtnText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: '#fff' },

  // Pending card
  pendingCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },

  // ── SOS section ─────────────────────────────────────────────
  sosSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  // Fixed container — sized to fit the outermost ring
  sosContainer: {
    width: CONTAINER,
    height: CONTAINER,
    position: 'relative',
  },
  sosRingBase: {
    position: 'absolute',
  },
  sosBtnWrapper: {
    position: 'absolute',
    width: SOS_SIZE,
    height: SOS_SIZE,
    borderRadius: SOS_SIZE / 2,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  sosBtnTouch: {
    width: '100%', height: '100%',
  },
  sosBtnGradient: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    gap: 3,
  },
  sosBtnLabel: {
    fontSize: FONTS.md + 2,
    fontWeight: FONTS.bold,
    color: '#fff',
    letterSpacing: 2,
  },
  sosProgressTrack: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  sosProgressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  sosHint: {
    marginTop: SPACING.md,
    fontSize: FONTS.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Section headers
  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.base, fontWeight: FONTS.semiBold,
    marginBottom: SPACING.sm,
  },
  seeAll: { fontSize: FONTS.sm, fontWeight: FONTS.medium },

  // Quick grid
  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: SPACING.sm, marginBottom: SPACING.lg,
  },
  quickCard: {
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center', gap: 6,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  quickCardIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  quickCardLabel: {
    fontSize: 10, fontWeight: FONTS.semiBold, textAlign: 'center',
  },

  // Nearby cards
  nearbyCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    gap: SPACING.md,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  nearbyIcon: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  nearbyText: { flex: 1 },
  nearbyTitle: { fontSize: FONTS.sm, fontWeight: FONTS.semiBold },
  nearbySub:   { fontSize: 11, marginTop: 2 },
  nearbyChip:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full },
  nearbyChipText: { fontSize: 11, fontWeight: FONTS.bold },
});