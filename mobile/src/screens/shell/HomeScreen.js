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
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { isChild, ROLES } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';
import { FONTS, SPACING, RADIUS } from '../../constants/theme';
import { getPendingRequests, acceptLinkRequest } from '../../services/parentChildService';
import NotificationBell from '../../components/common/NotificationBell';
import ThemeToggle from '../../components/ThemeToggle';
import { getCurrentCoordinates } from '../../services/locationService';
import { subscribeToNearbyActivities } from '../../services/nearbyActivityService';
import { subscribeUserCircles } from '../../services/trustedCircleGroupService';
import SosButton from '../../components/SosButton';
import EmergencyAlertModal from '../../components/emergency/EmergencyAlertModal';
import BackgroundPermissionModal from '../../components/emergency/BackgroundPermissionModal';
import { useEmergencyAlert } from '../../context/EmergencyAlertContext';
import { scale, verticalScale, normalize } from '../../utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// ── SOS button geometry ──────────────────────────────────────────
const SOS_SIZE  = scale(160);           // Diameter of the red button
const RING1_D   = SOS_SIZE + scale(64); // Inner pulse ring diameter
const RING2_D   = SOS_SIZE + scale(116);// Outer pulse ring diameter
const CONTAINER = RING2_D + scale(20);  // Container that holds everything

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
  const insets = useSafeAreaInsets();
  const { isEmergencyActive, activeSOS, acknowledgeAndStopSOS, viewOnMap } = useEmergencyAlert();

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
  const [currentLocationText, setCurrentLocationText] = useState(userProfile?.location || 'Acquiring location...');
  const [currentUserCoords, setCurrentUserCoords] = useState(null);
  const [nearbyActivities, setNearbyActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [showWelcomeUsernamePrompt, setShowWelcomeUsernamePrompt] = useState(false);
  const [userCircles, setUserCircles] = useState([]);
  const [activeCircleIndex, setActiveCircleIndex] = useState(0);
  const circleScrollRef = useRef(null);

  // Subscribe to user's Trusted Circles in real time
  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeUserCircles(userProfile.uid, (circles) => {
      setUserCircles(circles || []);
      setActiveCircleIndex(0);
    });
    return () => unsub?.();
  }, [userProfile?.uid]);

  // Auto-cycle / rotate through circles every 4 seconds (right to left carousel)
  useEffect(() => {
    if (userCircles.length <= 1) return;

    const autoTimer = setInterval(() => {
      setActiveCircleIndex((prev) => {
        const next = (prev + 1) % userCircles.length;
        const cardWidth = width - SPACING.xl * 2;
        if (circleScrollRef.current) {
          circleScrollRef.current.scrollTo({
            x: next * cardWidth,
            animated: true,
          });
        }
        return next;
      });
    }, 4000);

    return () => clearInterval(autoTimer);
  }, [userCircles.length]);

  // Check if user is on default generated username and show welcome prompt once
  useEffect(() => {
    async function checkWelcomePrompt() {
      if (!userProfile?.username || !userProfile?.uid) return;
      const key = `@shown_username_welcome_${userProfile.uid}`;
      const shown = await AsyncStorage.getItem(key);
      if (!shown) {
        setShowWelcomeUsernamePrompt(true);
      }
    }
    checkWelcomePrompt();
  }, [userProfile?.username, userProfile?.uid]);

  const dismissWelcomePrompt = async (goToEdit = false) => {
    if (userProfile?.uid) {
      await AsyncStorage.setItem(`@shown_username_welcome_${userProfile.uid}`, 'true');
    }
    setShowWelcomeUsernamePrompt(false);
    if (goToEdit) {
      navigation.navigate(ROUTES.EDIT_PROFILE);
    }
  };

  // Automatically fetch live GPS location and update header (city/village & district)
  useEffect(() => {
    let isMounted = true;

    async function fetchLiveLocation() {
      try {
        const coords = await getCurrentCoordinates();
        const displayLocation = coords?.areaName || coords?.address;
        if (isMounted && displayLocation) {
          setCurrentLocationText(displayLocation);
          if (typeof coords.lat === 'number' && typeof coords.lng === 'number') {
            setCurrentUserCoords({ latitude: coords.lat, longitude: coords.lng });
          }
        }
      } catch (err) {
        console.warn('[HomeScreen] Location update error:', err);
      }
    }

    fetchLiveLocation();
    // Refresh location every 45s
    const locInterval = setInterval(fetchLiveLocation, 45000);

    return () => {
      isMounted = false;
      clearInterval(locInterval);
    };
  }, []);

  // Real-time subscription to nearby activities based on live coordinates & trusted circle updates
  useEffect(() => {
    setLoadingActivities(true);

    const unsubscribe = subscribeToNearbyActivities(
      currentUserCoords,
      (items) => {
        setNearbyActivities(items);
        setLoadingActivities(false);
      },
      5,
      userProfile?.uid || null
    );

    return () => {
      unsubscribe();
    };
  }, [currentUserCoords, userProfile?.uid]);

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
    <View style={[styles.root, { backgroundColor: isEmergencyActive ? '#B71C1C' : colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={isEmergencyActive ? '#B71C1C' : colors.darkGreen} />

      {/* ── Header: turns Emergency Red when active circle SOS is triggered ── */}
      <Animated.View style={[styles.header, { opacity: headerAnim }]}>
        <LinearGradient
          colors={isEmergencyActive ? ['#D32F2F', '#B71C1C'] : [colors.darkGreen, colors.darkGreenMid]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerRow}>
            {/* Left: greeting */}
            <View style={styles.headerLeft}>
              <Text style={styles.greetingSmall} numberOfLines={1}>{getGreeting()}</Text>
              <Text style={styles.greetingName} numberOfLines={1} ellipsizeMode="tail">{firstName}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.75)" />
                <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
                  {currentLocationText}
                </Text>
              </View>
            </View>
            {/* Right: theme toggle + bell */}
            <View style={styles.headerRight}>
              <ThemeToggle iconColor="#fff" />
              <NotificationBell iconColor="#fff" size={20} />
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

          {/* ══════════════════════════════════════════════
              Safety SOS Button Hub & Radar Animation (matching Safety Screen)
          ══════════════════════════════════════════════ */}
          <View style={styles.sosSection}>
            <SosButton
              size="large"
              onAlertTriggered={(alertId) => {
                navigation.navigate(ROUTES.SAFETY);
              }}
            />

            <Text style={[styles.sosHint, { color: colors.textSecondary }]}>
              Tap to broadcast emergency to your trusted circle
            </Text>
          </View>
          {/* ══════════════════════════════════════════════ */}

          {/* ══════════════════════════════════════════════
              Trusted Circle Priority Section (Auto-scrolling / Right-to-Left carousel)
          ══════════════════════════════════════════════ */}
          {!childMode && (
            <View style={styles.trustedCircleSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="security" size={20} color={colors.darkGreenMid} />
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
                    Trusted Circle
                  </Text>
                  {userCircles.length > 1 && (
                    <View style={[styles.circleCountBadge, { backgroundColor: isDark ? colors.darkGreenSurface : '#E8F5E9' }]}>
                      <Text style={[styles.circleCountText, { color: colors.darkGreenMid }]}>
                        {activeCircleIndex + 1}/{userCircles.length}
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate(ROUTES.TRUSTED_CIRCLE)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                >
                  <Text style={[styles.seeAllText, { color: colors.darkGreenMid }]}>Manage</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.darkGreenMid} />
                </TouchableOpacity>
              </View>

              {userCircles.length === 0 ? (
                /* Empty state when no circle exists yet */
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[
                    styles.circleHeroCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      width: width - SPACING.xl * 2,
                    },
                  ]}
                  onPress={() => navigation.navigate(ROUTES.TRUSTED_CIRCLE)}
                >
                  <View style={styles.circleHeroHeader}>
                    <View style={[styles.circleHeroIconBadge, { backgroundColor: isDark ? 'rgba(6,117,106,0.22)' : colors.safeGreenLight }]}>
                      <Ionicons name="people" size={22} color={colors.darkGreenMid} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.circleHeroTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        No Circle Created Yet
                      </Text>
                      <Text style={[styles.circleHeroSub, { color: colors.textSecondary }]}>
                        Tap to form your personal safety network
                      </Text>
                    </View>
                    <View style={[styles.liveDotPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F5F5' }]}>
                      <View style={[styles.liveDot, { backgroundColor: '#9E9E9E' }]} />
                      <Text style={[styles.liveDotText, { color: colors.textSecondary }]}>Setup</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                /* Horizontal auto-sliding carousel displaying each circle right to left */
                <View style={styles.carouselOuterWrapper}>
                  <ScrollView
                    ref={circleScrollRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={width - SPACING.xl * 2}
                    snapToAlignment="center"
                    contentContainerStyle={styles.carouselContentContainer}
                    onMomentumScrollEnd={(e) => {
                      const cardW = width - SPACING.xl * 2;
                      const nextIndex = Math.round(e.nativeEvent.contentOffset.x / cardW);
                      if (nextIndex >= 0 && nextIndex < userCircles.length) {
                        setActiveCircleIndex(nextIndex);
                      }
                    }}
                  >
                    {userCircles.map((circle, idx) => {
                      const memberCount = circle.members?.length || circle.memberUids?.length || 1;
                      const cardWidth = width - SPACING.xl * 2;

                      return (
                        <TouchableOpacity
                          key={circle.id || `circle-${idx}`}
                          activeOpacity={0.88}
                          style={[
                            styles.circleHeroCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              width: cardWidth,
                            },
                          ]}
                          onPress={() => {
                            navigation.navigate('Main', {
                              screen: ROUTES.MAP,
                              params: {
                                selectedCircleId: circle.id,
                                selectedCircleName: circle.name,
                                memberUids: circle.memberUids || [],
                              },
                            });
                          }}
                        >
                          <View style={styles.circleHeroHeader}>
                            <View style={[styles.circleHeroIconBadge, { backgroundColor: isDark ? 'rgba(6,117,106,0.22)' : colors.safeGreenLight }]}>
                              <Ionicons name="people" size={22} color={colors.darkGreenMid} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.circleHeroTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                {circle.name || `Circle #${idx + 1}`}
                              </Text>
                              <Text style={[styles.circleHeroSub, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                                {`${memberCount} trusted member(s) active`}
                              </Text>
                            </View>
                            <View style={[styles.liveDotPill, { backgroundColor: isDark ? 'rgba(46,125,50,0.22)' : '#E8F5E9' }]}>
                              <View style={[styles.liveDot, { backgroundColor: '#2E7D32' }]} />
                              <Text style={[styles.liveDotText, { color: colors.darkGreenMid }]}>Live Map</Text>
                            </View>
                          </View>

                          {/* Member Avatars & Live Action Row */}
                          <View style={[styles.circleMembersRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : colors.divider || '#EEF2EE' }]}>
                            <View style={styles.circleAvatarGroup}>
                              {circle.members && circle.members.length > 0 ? (
                                circle.members.slice(0, 4).map((m, mIdx) => (
                                  <View
                                    key={m.uid || `member-${mIdx}`}
                                    style={[
                                      styles.circleMiniAvatar,
                                      {
                                        borderColor: colors.surface,
                                        backgroundColor: isDark ? colors.darkGreenSurface : '#E8F5E9',
                                        marginLeft: mIdx > 0 ? -8 : 0,
                                      },
                                    ]}
                                  >
                                    <Text style={[styles.circleMiniAvatarText, { color: colors.darkGreenMid }]}>
                                      {(m.displayName || m.username || 'M').charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                ))
                              ) : (
                                <Text style={[styles.circleEmptyNotice, { color: colors.textMuted }]}>No other members</Text>
                              )}
                              {circle.members && circle.members.length > 4 && (
                                <View
                                  style={[
                                    styles.circleMiniAvatar,
                                    styles.circleMiniAvatarPlus,
                                    { borderColor: colors.surface, backgroundColor: colors.darkGreenMid, marginLeft: -8 },
                                  ]}
                                >
                                  <Text style={{ fontSize: 10, color: '#FFF', fontWeight: 'bold' }}>
                                    +{circle.members.length - 4}
                                  </Text>
                                </View>
                              )}
                            </View>

                            <View style={[styles.trackOnMapBtn, { backgroundColor: isDark ? 'rgba(6,117,106,0.18)' : '#E0F2F1' }]}>
                              <Ionicons name="navigate" size={13} color={colors.darkGreenMid} style={{ marginRight: 4 }} />
                              <Text style={[styles.trackOnMapText, { color: colors.darkGreenMid }]}>
                                Track
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Carousel Pagination Dots */}
                  {userCircles.length > 1 && (
                    <View style={styles.carouselDotsRow}>
                      {userCircles.map((_, dotIdx) => (
                        <View
                          key={`dot-${dotIdx}`}
                          style={[
                            styles.carouselDot,
                            {
                              backgroundColor: dotIdx === activeCircleIndex ? colors.darkGreenMid : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'),
                              width: dotIdx === activeCircleIndex ? 16 : 6,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Quick access */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick access</Text>
          <View style={styles.quickGrid}>
            {!childMode && (
              <QuickCard colors={colors} iconName="walk-outline" label="Journey"
                onPress={() => navigation.navigate(ROUTES.MAP)} />
            )}
            <QuickCard colors={colors} iconName="map-outline" label="Safe map"
              onPress={() => navigation.navigate(ROUTES.MAP)} />
            <QuickCard colors={colors} iconName="search-outline" label="CircleFind"
              onPress={() => navigation.navigate(ROUTES.CIRCLE_FIND)} />
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
          </View>

          <View style={{ height: SPACING.sm }} />

          {/* Real Nearby Activities List */}
          {nearbyActivities.length > 0 ? (
            nearbyActivities.map((act) => {
              let iconElement = <Ionicons name="warning-outline" size={24} color={colors.warnOrange} />;
              if (act.type === 'sos') {
                iconElement = <Ionicons name="alert-circle" size={24} color={colors.dangerRed} />;
              } else if (act.type === 'circle_activity') {
                iconElement = <Ionicons name="chatbubbles" size={24} color={colors.darkGreenMid} />;
              } else if (act.type === 'circlefind') {
                const cat = (act.category || '').toLowerCase();
                if (cat.includes('pet') || cat.includes('dog') || cat.includes('cat')) {
                  iconElement = <MaterialCommunityIcons name="paw-outline" size={24} color={colors.missingPink} />;
                } else if (cat.includes('child')) {
                  iconElement = <MaterialIcons name="child-care" size={24} color={colors.dangerRed} />;
                } else {
                  iconElement = <Ionicons name="search-outline" size={24} color={colors.darkGreenMid} />;
                }
              }

              const handleItemPress = () => {
                if (act.type === 'sos') {
                  const loc = act.data?.location || {};
                  const lat = loc.lat || loc.latitude;
                  const lng = loc.lng || loc.longitude;
                  navigation.navigate(ROUTES.MAP, {
                    focusAlertId: act.data?.alertId,
                    targetLocation: (typeof lat === 'number' && typeof lng === 'number') ? {
                      latitude: lat,
                      longitude: lng,
                      title: act.title,
                      isEmergency: true,
                    } : undefined,
                  });
                } else if (act.type === 'circle_activity') {
                  navigation.navigate(ROUTES.CIRCLE_CHAT, {
                    circleId: act.data?.circleId,
                    circleName: act.data?.circleName,
                    circlePhotoURL: act.data?.circlePhotoURL,
                    members: act.data?.members || [],
                  });
                } else if (act.type === 'unsafe_hazard') {
                  const loc = act.data?.location || {};
                  navigation.navigate(ROUTES.MAP, {
                    focusHazardId: act.data?.hazardId,
                    targetLocation: (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') ? {
                      latitude: loc.latitude,
                      longitude: loc.longitude,
                      title: act.title,
                      isHazard: true,
                    } : undefined,
                  });
                } else if (act.type === 'circlefind') {
                  navigation.navigate(ROUTES.CIRCLE_FIND_DETAIL, {
                    reportId: act.data.reportId,
                  });
                }
              };

              return (
                <NearbyCard
                  key={act.id}
                  colors={colors}
                  icon={iconElement}
                  title={act.title}
                  sub={act.sub}
                  chip={act.chip}
                  chipType={act.chipType}
                  onPress={handleItemPress}
                />
              );
            })
          ) : (
            <NearbyCard
              colors={colors}
              icon={<Ionicons name="shield-checkmark-outline" size={24} color={colors.darkGreenMid} />}
              title="All clear in your area"
              sub="No active emergency alerts or reported hazards nearby."
              chip="Safe"
              chipType="safe"
              onPress={() => navigation.navigate(ROUTES.MAP)}
            />
          )}

          <View style={{ height: 32 }} />
        </Animated.View>
      </ScrollView>

      {/* Onboarding Welcome Username Modal Prompt */}
      <Modal
        visible={showWelcomeUsernamePrompt}
        transparent={true}
        animationType="fade"
        onRequestClose={() => dismissWelcomePrompt(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.welcomeModalCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.welcomeIconCircle, { backgroundColor: colors.safeGreenLight }]}>
              <MaterialCommunityIcons name="account-star-outline" size={32} color={colors.darkGreenMid} />
            </View>
            <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>Welcome to GuardianCircle!</Text>
            <Text style={[styles.welcomeMessage, { color: colors.textSecondary }]}>
              Your assigned temporary username is:
            </Text>
            <View style={[styles.usernamePillBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.usernamePillText, { color: colors.darkGreenMid }]}>
                @{userProfile?.username || 'user'}
              </Text>
            </View>
            <Text style={[styles.welcomeSubMessage, { color: colors.textMuted }]}>
              Would you like to pick a personalized unique username now?
            </Text>

            <View style={styles.welcomeModalButtons}>
              <TouchableOpacity
                style={[styles.welcomeSecondaryBtn, { borderColor: colors.border }]}
                onPress={() => dismissWelcomePrompt(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.welcomeSecondaryText, { color: colors.textSecondary }]}>Keep for now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.welcomePrimaryBtn, { backgroundColor: colors.darkGreenMid }]}
                onPress={() => dismissWelcomePrompt(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.welcomePrimaryText}>Pick Username</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Emergency SOS Active Modal from Trusted Circle ── */}
      <EmergencyAlertModal
        visible={isEmergencyActive}
        alertData={activeSOS}
        onAcknowledge={acknowledgeAndStopSOS}
        onViewMap={viewOnMap}
      />

      {/* ── First-time Background Execution & Notification Permission Onboarding ── */}
      <BackgroundPermissionModal />
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

function NearbyCard({ colors, icon, title, sub, chip, chipType, onPress }) {
  const chipColors = {
    safe:    { bg: colors.safeGreenLight,  text: colors.darkGreenMid },
    warn:    { bg: colors.warnOrangeLight, text: colors.warnOrange },
    missing: { bg: colors.missingPinkLight, text: colors.missingPink },
    sos:     { bg: '#FFEBEE', text: '#D32F2F' },
    circle:  { bg: colors.safeGreenLight,  text: colors.darkGreenMid },
  };
  const c = chipColors[chipType] || chipColors.safe;

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.8 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.nearbyCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
        <View style={[styles.nearbyIcon, { backgroundColor: colors.background }]}>
          {icon}
        </View>
        <View style={styles.nearbyText}>
          <Text style={[styles.nearbyTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.nearbySub, { color: colors.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <View style={[styles.nearbyChip, { backgroundColor: c.bg }]}>
          <Text style={[styles.nearbyChipText, { color: c.text }]}>{chip}</Text>
        </View>
      </View>
    </TouchableOpacity>
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

  // Welcome Username Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  welcomeModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  welcomeIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  welcomeTitle: {
    fontSize: FONTS.lg,
    fontWeight: FONTS.bold,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  welcomeMessage: {
    fontSize: FONTS.sm,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  usernamePillBox: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  usernamePillText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
  },
  welcomeSubMessage: {
    fontSize: FONTS.xs,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  welcomeModalButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    width: '100%',
  },
  welcomeSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  welcomeSecondaryText: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.semiBold,
  },
  welcomePrimaryBtn: {
    flex: 1.2,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  welcomePrimaryText: {
    color: '#fff',
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
  },

  // Trusted Circle Priority Section Styles
  trustedCircleSection: {
    marginBottom: SPACING.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  seeAllText: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.semiBold,
  },
  circleHeroCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md + 2,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginVertical: 2,
  },
  carouselOuterWrapper: {
    paddingVertical: 2,
  },
  carouselContentContainer: {
    paddingVertical: 2,
  },
  circleHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  circleHeroIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleHeroTitle: {
    fontSize: FONTS.base,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  circleHeroSub: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  liveDotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveDotText: {
    fontSize: 11,
    fontWeight: '700',
  },
  circleMembersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm + 4,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  circleAvatarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleEmptyNotice: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  circleMiniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleMiniAvatarPlus: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleMiniAvatarText: {
    fontSize: 11,
    fontWeight: '700',
  },
  trackOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.md,
  },
  trackOnMapText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  circleCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginLeft: 4,
  },
  circleCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  carouselDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  carouselDot: {
    height: 5,
    borderRadius: 3,
  },
});