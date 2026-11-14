import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  TextInput,
  RefreshControl,
  Dimensions,
  Platform,
  StatusBar,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import {
  collection,
  query,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ROUTES } from '../../constants/routes';
import { getKarmaScore } from '../../services/karmaService';
import {
  calculateCircleFindScore,
  toggleAmplifyPost,
  getDistanceKm,
  formatDistance,
  formatRelativeTime,
  CIRCLE_FIND_COLLECTION,
  fetchUserAccountName,
  fetchUserAccountProfile,
  resolveReadableAddress,
  showToast,
} from '../../services/circleFindService';
import Toast from '../../components/common/Toast';
import { RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import ThemeToggle from '../../components/ThemeToggle';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 4 Feed filter tabs
const FEED_TABS = [
  { key: 'nearby', label: 'Nearby', icon: 'near-me' },
  { key: 'boosted', label: 'Boosted', icon: 'bolt' },
  { key: 'latest', label: 'Latest', icon: 'schedule' },
  { key: 'returned', label: 'Returned', icon: 'check-circle' },
];

function getCategoryIcon(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('child') || c.includes('kid') || c.includes('person')) return 'child-care';
  if (c.includes('electronic') || c.includes('phone') || c.includes('laptop')) return 'devices';
  if (c.includes('doc') || c.includes('id') || c.includes('card') || c.includes('passport')) return 'badge';
  if (c.includes('pet') || c.includes('dog') || c.includes('cat')) return 'pets';
  if (c.includes('bag') || c.includes('wallet') || c.includes('purse')) return 'shopping-bag';
  if (c.includes('jewel') || c.includes('watch') || c.includes('ring')) return 'watch';
  if (c.includes('key')) return 'vpn-key';
  return 'category';
}

export default function CircleFindScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [karmaScore, setKarmaScore] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [activeTab, setActiveTab] = useState('nearby'); // 'nearby' | 'boosted' | 'latest' | 'returned'
  const [searchQuery, setSearchQuery] = useState('');
  const [amplifyingId, setAmplifyingId] = useState(null);
  const boostAnimMap = useRef(new Map()).current;

  const getBoostAnim = (id) => {
    if (!boostAnimMap.has(id)) {
      boostAnimMap.set(id, new Animated.Value(1));
    }
    return boostAnimMap.get(id);
  };

  // 1. Fetch user location
  const acquireLocation = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (loc?.coords) {
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      }
    } catch (_) {}
  }, []);

  // 2. Fetch reports from Firestore
  const fetchReports = useCallback(async () => {
    try {
      const reportsRef = collection(db, CIRCLE_FIND_COLLECTION);
      const q = query(reportsRef, limit(80));
      const snap = await getDocs(q);

      const loaded = snap.docs
        .map((docSnap) => {
          const data = docSnap.data();
          let createdMillis = 0;
          if (data.createdAt?.toDate) {
            createdMillis = data.createdAt.toDate().getTime();
          } else if (data.createdAt?.seconds) {
            createdMillis = data.createdAt.seconds * 1000;
          } else if (data.createdAt) {
            createdMillis = new Date(data.createdAt).getTime() || 0;
          }

          return {
            id: docSnap.id,
            ...data,
            _createdMillis: createdMillis,
          };
        })
        .filter((item) => {
          // STRICT FILTER: Exclude Map unsafe hazard reports AND deleted items so they NEVER appear in CircleFind!
          const isDeleted = item.status === 'deleted' || item.isDeleted === true;
          return item.type !== 'unsafe_location' && !isDeleted;
        });

      // Always resolve author account profile (name + avatar) from users collection
      const authorUids = [
        ...new Set(
          loaded
            .map((r) => r.reportedBy || r.reporterUid || r.userId || r.authorId)
            .filter(Boolean)
        ),
      ];

      if (authorUids.length > 0) {
        const profileMap = {};
        await Promise.all(
          authorUids.map(async (uid) => {
            const profile = await fetchUserAccountProfile(uid, true);
            if (profile && (profile.name || profile.photoURL)) {
              profileMap[uid] = profile;
            }
          })
        );

        if (Object.keys(profileMap).length > 0) {
          loaded.forEach((r) => {
            const uid = r.reportedBy || r.reporterUid || r.userId || r.authorId;
            if (uid && profileMap[uid]) {
              const { name, photoURL } = profileMap[uid];
              if (name) {
                r.reportedByName = name;
                r.reporterName = name;
                r.authorName = name;
              }
              if (photoURL !== undefined) {
                r.authorPhotoURL = photoURL;
                r.reporterPhotoURL = photoURL;
              }
            }
          });
        }
      }

      // Resolve human-friendly location (city/village & district) for posts
      await Promise.all(
        loaded.map(async (r) => {
          const lat = r.location?.latitude;
          const lon = r.location?.longitude;
          const currentName = r.location?.addressName || '';
          const isGeneric =
            !currentName ||
            currentName === 'Tagged Area' ||
            currentName === 'Current GPS Location' ||
            currentName.toLowerCase().includes('selected on map') ||
            currentName.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/);
          if (isGeneric && typeof lat === 'number' && typeof lon === 'number') {
            const area = await resolveReadableAddress(lat, lon);
            if (area) {
              r.location = {
                ...r.location,
                addressName: area,
              };
            }
          }
        })
      );

      setReports(loaded);
    } catch (err) {
      console.warn('[CircleFindScreen] fetchReports error:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 3. Karma score fetch
  const fetchKarma = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const score = await getKarmaScore(user.uid);
      setKarmaScore(score);
    } catch (_) {}
  }, [user]);

  // Focus effect to refresh
  useFocusEffect(
    useCallback(() => {
      acquireLocation();
      fetchReports();
      fetchKarma();
    }, [acquireLocation, fetchReports, fetchKarma])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    acquireLocation();
    fetchReports();
    fetchKarma();
  }, [acquireLocation, fetchReports, fetchKarma]);

  // Handle Amplify/Boost toggle from card
  const handleToggleAmplify = async (item) => {
    if (!user?.uid) return;
    setAmplifyingId(item.id);

    // Spring bounce animation on click
    const anim = getBoostAnim(item.id);
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 1.45,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(anim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const res = await toggleAmplifyPost(item.id, user.uid);
      showToast(res.isBoosted ? 'Alert amplified!' : 'Alert un-amplified');
      setReports((prev) =>
        prev.map((r) => {
          if (r.id !== item.id) return r;
          const currentBoosted = Array.isArray(r.boostedBy) ? [...r.boostedBy] : [];
          const updatedBoosted = res.isBoosted
            ? [...currentBoosted, user.uid]
            : currentBoosted.filter((uid) => uid !== user.uid);
          return {
            ...r,
            boostedBy: updatedBoosted,
            boostCount: res.boostCount,
          };
        })
      );
    } catch (err) {
      console.warn('Amplify error:', err.message);
    } finally {
      setAmplifyingId(null);
    }
  };

  // Filter & Sort Logic based on Section 4 algorithm
  const filteredAndSortedReports = useMemo(() => {
    let list = [...reports];

    // Text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const titleMatch = (r.title || '').toLowerCase().includes(q);
        const catMatch = (r.category || '').toLowerCase().includes(q);
        const descMatch = (r.description || '').toLowerCase().includes(q);
        const locMatch = (r.location?.addressName || '').toLowerCase().includes(q);
        return titleMatch || catMatch || descMatch || locMatch;
      });
    }

    // Tab-based sorting & filtering
    if (activeTab === 'returned') {
      // Show only returned/reunited items
      list = list.filter((r) => {
        const s = (r.status || r.type || '').toLowerCase();
        return s === 'returned' || s === 'reunited';
      });
      list.sort((a, b) => (b._createdMillis || 0) - (a._createdMillis || 0));
    } else {
      // Exclude returned items from active tabs
      list = list.filter((r) => {
        const s = (r.status || r.type || '').toLowerCase();
        return s !== 'returned' && s !== 'reunited';
      });

      if (activeTab === 'nearby') {
        // Sort using Priority Score algorithm (combining distance, freshness & boosts)
        list.sort((a, b) => {
          const scoreA = calculateCircleFindScore(a, userLocation);
          const scoreB = calculateCircleFindScore(b, userLocation);
          return scoreB - scoreA;
        });
      } else if (activeTab === 'boosted') {
        // Sort by boost count descending
        list.sort((a, b) => {
          const boostsA = (a.boostedBy || []).length || a.boostCount || 0;
          const boostsB = (b.boostedBy || []).length || b.boostCount || 0;
          return boostsB - boostsA;
        });
      } else if (activeTab === 'latest') {
        // Sort by creation time descending
        list.sort((a, b) => (b._createdMillis || 0) - (a._createdMillis || 0));
      }
    }

    return list;
  }, [reports, searchQuery, activeTab, userLocation]);

  // Render Post Card
  const renderItem = ({ item }) => {
    const rawStatus = (item.status || item.type || 'missing').toLowerCase();
    const isMissing = rawStatus === 'missing' || rawStatus === 'lost';
    const isSpotted = rawStatus === 'spotted' || rawStatus === 'sighted';
    const isFound = rawStatus === 'found';
    const isReturned = rawStatus === 'returned' || rawStatus === 'reunited';

    // Calculate distance
    let distKm = null;
    const lat = item.location?.latitude ?? item.latitude;
    const lon = item.location?.longitude ?? item.longitude;
    if (userLocation && typeof lat === 'number' && typeof lon === 'number') {
      distKm = getDistanceKm(userLocation.latitude, userLocation.longitude, lat, lon);
    }
    const distanceText = formatDistance(distKm);

    // Boost state
    const boostedList = Array.isArray(item.boostedBy) ? item.boostedBy : [];
    const isAmplified = user?.uid ? boostedList.includes(user.uid) : false;
    const amplifyCount = item.boostCount ?? boostedList.length;

    // Publisher ownership check
    const isOwner = !!user?.uid && (
      item.reportedBy === user.uid ||
      item.reporterUid === user.uid ||
      item.userId === user.uid ||
      item.authorId === user.uid
    );
    const publisherName = isOwner
      ? 'You'
      : (item.reportedByName || item.reporterName || item.authorName || 'Community Member');

    const publisherPhoto = isOwner
      ? (userProfile?.photoURL || item.authorPhotoURL || item.reporterPhotoURL)
      : (item.authorPhotoURL || item.reporterPhotoURL || null);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => navigation.navigate(ROUTES.CIRCLE_FIND_DETAIL, { reportId: item.id })}
      >
        {/* Media or Visual Box */}
        <View style={styles.imageContainer}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderImageBox}>
              <MaterialIcons name={getCategoryIcon(item.category)} size={44} color={colors.darkGreenMid} />
              <Text style={styles.placeholderCategoryName}>{item.category || 'General Item'}</Text>
            </View>
          )}

          {/* Time Overlay Badge at Top-Right */}
          <View style={styles.timeOverlayBadge}>
            <Text style={styles.timeOverlayText}>{formatRelativeTime(item.createdAt)}</Text>
          </View>

          {/* Category & Status Overlay at Bottom-Left Corner of Image */}
          <View style={styles.imageBottomLeftOverlay}>
            {/* Category Pill */}
            <View style={styles.categoryOverlayPill}>
              <MaterialIcons name={getCategoryIcon(item.category)} size={13} color="#FFF" />
              <Text style={styles.categoryOverlayText}>{item.category || 'General'}</Text>
            </View>

            {/* Simple Status Badges */}
            {isMissing && (
              <View style={[styles.statusOverlayBadge, { backgroundColor: '#E53935' }]}>
                <MaterialIcons name="report-problem" size={12} color="#FFF" />
                <Text style={styles.statusOverlayText}>Missing</Text>
              </View>
            )}
            {isSpotted && (
              <View style={[styles.statusOverlayBadge, { backgroundColor: '#FB8C00' }]}>
                <MaterialIcons name="visibility" size={12} color="#FFF" />
                <Text style={styles.statusOverlayText}>Spotted</Text>
              </View>
            )}
            {isFound && (
              <View style={[styles.statusOverlayBadge, { backgroundColor: '#2E7D32' }]}>
                <MaterialIcons name="check-circle" size={12} color="#FFF" />
                <Text style={styles.statusOverlayText}>Found</Text>
              </View>
            )}
            {isReturned && (
              <View style={[styles.statusOverlayBadge, { backgroundColor: '#7B1FA2' }]}>
                <MaterialIcons name="celebration" size={12} color="#FFF" />
                <Text style={styles.statusOverlayText}>Returned</Text>
              </View>
            )}
          </View>
        </View>

        {/* Card Body */}
        <View style={styles.cardBody}>
          {/* Publisher Name Row directly under post image */}
          <View style={styles.publisherRow}>
            {publisherPhoto ? (
              <Image source={{ uri: publisherPhoto }} style={styles.publisherAvatar} />
            ) : (
              <MaterialIcons
                name="person"
                size={14}
                color={isOwner ? colors.darkGreenMid : colors.textMuted}
              />
            )}
            <Text style={[styles.publisherText, isOwner && styles.publisherTextYou]}>
              {publisherName}
            </Text>
          </View>

          <Text style={styles.cardItemTitle} numberOfLines={1}>
            {item.title || `${item.category || 'Missing'} Item`}
          </Text>
          <Text style={styles.cardDescription} numberOfLines={2}>
            {item.description || 'No description provided.'}
          </Text>

          {/* Location Badge */}
          <View style={styles.locationBadgeRow}>
            <MaterialIcons name="place" size={14} color={colors.darkGreenMid} />
            <Text style={styles.locationBadgeText} numberOfLines={1}>
              {distanceText ? `${distanceText} • ` : ''}
              {(item.location?.addressName &&
               item.location.addressName !== 'Tagged Area' &&
               item.location.addressName !== 'Current GPS Location' &&
               !item.location.addressName.toLowerCase().includes('selected on map') &&
               !item.location.addressName.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/))
                ? item.location.addressName
                : 'Nearby Location'}
            </Text>
          </View>
        </View>

        {/* Card Footer Actions (Amplify + View Details) */}
        <View style={styles.cardFooter}>
          {/* Booster Icon Button (Animated on click) */}
          <View style={styles.amplifyWrapper}>
            <TouchableOpacity
              style={[styles.amplifyIconBtn, isAmplified && styles.amplifyIconBtnActive]}
              onPress={() => handleToggleAmplify(item)}
              disabled={amplifyingId === item.id}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Amplify alert"
            >
              {amplifyingId === item.id ? (
                <ActivityIndicator size="small" color={isAmplified ? '#FFF' : colors.darkGreenMid} />
              ) : (
                <Animated.View style={{ transform: [{ scale: getBoostAnim(item.id) }] }}>
                  <MaterialIcons
                    name="bolt"
                    size={22}
                    color={isAmplified ? '#FFF' : colors.darkGreenMid}
                  />
                </Animated.View>
              )}
            </TouchableOpacity>
            {amplifyCount > 0 && (
              <Text style={[styles.amplifyCountText, isAmplified && styles.amplifyCountTextActive]}>
                {amplifyCount}
              </Text>
            )}
          </View>

          <View style={styles.detailLink}>
            <Text style={styles.detailLinkText}>View Details</Text>
            <MaterialIcons name="chevron-right" size={18} color={colors.darkGreenMid} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const styles = getStyles(colors, isDark, insets);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.screenTitle}>CircleFind</Text>
          <Text style={styles.screenSubtitle}>Community Item Recovery</Text>
        </View>
        <View style={styles.headerRightActions}>
          {karmaScore !== null && (
            <View style={styles.karmaChip}>
              <MaterialIcons name="star" size={14} color="#FFD700" />
              <Text style={styles.karmaText}>{karmaScore}</Text>
            </View>
          )}
          <ThemeToggle style={{ marginLeft: 6 }} />
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search missing items, categories, places..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="cancel" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 4 Filter Tabs */}
      <View style={styles.tabsRow}>
        {FEED_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setActiveTab(tab.key);
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name={tab.icon}
                size={14}
                color={isActive ? '#FFF' : colors.textSecondary}
              />
              <Text
                style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Post List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.darkGreenMid} />
          <Text style={styles.loadingText}>Locating CircleFind alerts...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedReports}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.darkGreenMid]}
              tintColor={colors.darkGreenMid}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="search-off" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No items found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'Try searching with different keywords.'
                  : activeTab === 'returned'
                  ? 'No returned items yet.'
                  : 'Be the first in your area to raise a CircleFind alert!'}
              </Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button (FAB) to Post Missing Item / Alert */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate(ROUTES.CIRCLE_FIND_REPORT)}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Report missing item"
      >
        <MaterialIcons name="report" size={22} color="#FFF" />
        <Text style={styles.fabText}>Report</Text>
      </TouchableOpacity>
      <Toast />
    </View>
  );
}

const getStyles = (colors, isDark, insets) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: Math.max(insets.top, 12) + 6,
      paddingBottom: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitleContainer: { flex: 1 },
    screenTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    screenSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    headerRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    karmaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,215,0,0.15)' : '#FFF9C4',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: RADIUS.round,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,215,0,0.3)' : '#FFE082',
      gap: 4,
    },
    karmaText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#FFD700' : '#F57F17',
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F4F0',
      borderRadius: RADIUS.lg,
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.textPrimary,
    },
    tabsRow: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 6,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 7,
      paddingHorizontal: 4,
      borderRadius: RADIUS.round,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0F4F0',
      gap: 3,
    },
    tabButtonActive: {
      backgroundColor: colors.darkGreenMid,
    },
    tabButtonText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabButtonTextActive: {
      color: '#FFF',
      fontWeight: '700',
    },
    listContent: {
      padding: 14,
      paddingBottom: 90,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 13,
      color: colors.textMuted,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
      overflow: 'hidden',
      ...SHADOWS.small,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerLeftBadges: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    categoryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.darkGreenSurface : '#E0F2F1',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: RADIUS.sm,
      gap: 4,
    },
    categoryPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.darkGreenMid,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: RADIUS.sm,
      gap: 4,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    cardTimeText: {
      fontSize: 11,
      color: colors.textMuted,
    },
    imageContainer: {
      width: '100%',
      height: 240,
      position: 'relative',
      backgroundColor: isDark ? '#1E1E1E' : '#E8EDE8',
      overflow: 'hidden',
    },
    cardImage: {
      width: '100%',
      height: '100%',
    },
    placeholderImageBox: {
      width: '100%',
      height: 170,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F0F4F0',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    placeholderCategoryName: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '600',
    },
    imageBottomLeftOverlay: {
      position: 'absolute',
      bottom: 10,
      left: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      zIndex: 5,
    },
    categoryOverlayPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: RADIUS.round,
      gap: 4,
    },
    categoryOverlayText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    statusOverlayBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: RADIUS.round,
      gap: 4,
      ...SHADOWS.small,
    },
    statusOverlayText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    timeOverlayBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: RADIUS.round,
      zIndex: 5,
    },
    timeOverlayText: {
      fontSize: 11,
      color: '#FFFFFF',
      fontWeight: '600',
    },
    cardBody: {
      padding: 14,
      gap: 6,
    },
    publisherRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    publisherAvatar: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.border,
    },
    publisherText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    publisherTextYou: {
      color: colors.darkGreenMid,
      fontWeight: '700',
    },
    cardItemTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cardDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    locationBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    locationBadgeText: {
      fontSize: 12,
      color: colors.darkGreenMid,
      fontWeight: '500',
      flex: 1,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FAFCFA',
    },
    amplifyWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    amplifyIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F5E9',
      borderWidth: 1,
      borderColor: colors.border,
    },
    amplifyIconBtnActive: {
      backgroundColor: colors.darkGreenMid,
      borderColor: colors.darkGreenMid,
    },
    amplifyCountText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    amplifyCountTextActive: {
      color: colors.darkGreenMid,
    },
    detailLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    detailLinkText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.darkGreenMid,
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.darkGreenMid,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: RADIUS.round,
      gap: 7,
      ...SHADOWS.large,
    },
    fabText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });

