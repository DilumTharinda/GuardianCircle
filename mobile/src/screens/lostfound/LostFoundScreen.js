import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Modal,
  Alert,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  increment,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ROUTES } from '../../constants/routes';
import { ROLES, isAdmin } from '../../constants/roles';
import { getKarmaScore, awardKarma } from '../../services/karmaService';
import { FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import ThemeToggle from '../../components/ThemeToggle';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const KARMA_FOR_CONFIRMED_REPORT = 1;
const CATEGORIES = ['Electronics', 'Documents', 'Pet', 'Bag', 'Jewelry', 'Other'];

// Haversine distance calculator in kilometers
function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' ||
    typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lon2 !== 'number'
  ) {
    return null;
  }
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(distKm) {
  if (distKm === null || isNaN(distKm)) return null;
  if (distKm < 0.1) return 'Near you (< 100m)';
  if (distKm < 1) return `${Math.round(distKm * 1000)}m away`;
  return `${distKm.toFixed(1)} km away`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  let date;
  if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else if (timestamp?.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }
  if (isNaN(date?.getTime?.())) return '';

  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getCategoryIcon(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('electronic') || c.includes('phone') || c.includes('laptop')) return 'phone-portrait-outline';
  if (c.includes('doc') || c.includes('id') || c.includes('card') || c.includes('passport')) return 'card-outline';
  if (c.includes('pet') || c.includes('dog') || c.includes('cat')) return 'paw-outline';
  if (c.includes('bag') || c.includes('wallet') || c.includes('purse')) return 'briefcase-outline';
  if (c.includes('jewel') || c.includes('watch') || c.includes('ring')) return 'watch-outline';
  if (c.includes('key')) return 'key-outline';
  return 'cube-outline';
}

export default function LostFoundScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Admin permission check
  const isUserAdmin =
    userProfile?.role === ROLES.ADMIN_MODERATOR ||
    userProfile?.role === 'admin' ||
    userProfile?.isAdmin === true ||
    isAdmin(userProfile?.role);

  // Feed states
  const [reports, setReports] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [karmaScore, setKarmaScore] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  // Filter & Navigation states
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'matches'
  const [sortMode, setSortMode] = useState('latest'); // 'latest' | 'popular' | 'nearby'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'lost' | 'found'
  const [searchQuery, setSearchQuery] = useState('');
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Edit Report Modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('lost');
  const [savingEdit, setSavingEdit] = useState(false);

  // 1. Fetch live user GPS location for "Nearby" sorting
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

  // 2. Load all community reports
  const fetchReports = useCallback(async () => {
    try {
      const reportsRef = collection(db, 'reports');
      const q = query(reportsRef, limit(60));
      const snap = await getDocs(q);

      const loaded = snap.docs.map((docSnap) => {
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
      });

      setReports(loaded);
    } catch (err) {
      console.warn('[LostFoundScreen] fetchReports error:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 3. Load user's private matches
  const fetchMyMatches = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const lostQuery = query(
        collection(db, 'matches'),
        where('lostReporterId', '==', user.uid),
        limit(15)
      );
      const foundQuery = query(
        collection(db, 'matches'),
        where('foundReporterId', '==', user.uid),
        limit(15)
      );

      const [lostSnap, foundSnap] = await Promise.all([
        getDocs(lostQuery),
        getDocs(foundQuery),
      ]);

      const map = new Map();
      lostSnap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
      foundSnap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));

      const sorted = Array.from(map.values()).sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setMatches(sorted);
    } catch (e) {
      console.warn('[LostFoundScreen] fetchMyMatches error:', e?.message || e);
    }
  }, [user]);

  // 4. Load Karma score
  const fetchKarma = useCallback(async () => {
    if (!user?.uid) return;
    const score = await getKarmaScore(user.uid);
    setKarmaScore(score);
  }, [user]);

  // Reload everything on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchReports();
      fetchMyMatches();
      fetchKarma();
      acquireLocation();
    }, [fetchReports, fetchMyMatches, fetchKarma, acquireLocation])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReports();
    fetchMyMatches();
    fetchKarma();
    acquireLocation();
  };

  // Upvote / Confirm report
  const handleConfirm = async (report) => {
    if (!user?.uid) return;

    if (report.reportedBy === user.uid) {
      Alert.alert('Your Report', 'You cannot confirm your own report.');
      return;
    }

    const alreadyConfirmed =
      Array.isArray(report.confirmedBy) && report.confirmedBy.includes(user.uid);
    if (alreadyConfirmed) {
      Alert.alert('Already Confirmed', 'You have already verified this report.');
      return;
    }

    setConfirmingId(report.id);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const reportRef = doc(db, 'reports', report.id);
      await updateDoc(reportRef, {
        confidenceScore: increment(1),
        confirmedBy: arrayUnion(user.uid),
      });

      if (report.reportedBy) {
        await awardKarma(report.reportedBy, KARMA_FOR_CONFIRMED_REPORT);
      }

      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? {
                ...r,
                confidenceScore: (r.confidenceScore || 0) + 1,
                confirmedBy: [...(r.confirmedBy || []), user.uid],
              }
            : r
        )
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  // Delete Report (Author of report OR Admin can delete any post)
  const handleDeleteReport = (report) => {
    const isOwn = report.reportedBy === user?.uid;
    const canDelete = isOwn || isUserAdmin;
    if (!canDelete) return;

    const title = !isOwn && isUserAdmin ? 'Admin: Delete Report' : 'Delete Report';
    const message =
      !isOwn && isUserAdmin
        ? 'As an Admin / Moderator, you are about to permanently remove this report from the community feed. Continue?'
        : 'Are you sure you want to permanently delete your report? This action cannot be undone.';

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            await deleteDoc(doc(db, 'reports', report.id));
            setReports((prev) => prev.filter((r) => r.id !== report.id));
            Alert.alert('Deleted', 'Report has been permanently removed.');
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // Open Edit Modal for own report
  const handleOpenEditModal = (report) => {
    const isOwn = report.reportedBy === user?.uid;
    if (!isOwn) {
      Alert.alert('Not Allowed', 'You can only edit your own report posts.');
      return;
    }
    setEditingReport(report);
    setEditCategory(report.category || 'Other');
    setEditDescription(report.description || '');
    setEditStatus(report.status || report.type || 'lost');
    setEditModalVisible(true);
  };

  // Save Edits to Firestore
  const handleSaveEdit = async () => {
    if (!editingReport) return;
    if (!editDescription.trim()) {
      Alert.alert('Description Required', 'Please enter a description for your report.');
      return;
    }

    setSavingEdit(true);
    try {
      const reportRef = doc(db, 'reports', editingReport.id);
      await updateDoc(reportRef, {
        category: editCategory,
        description: editDescription.trim(),
        status: editStatus,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setReports((prev) =>
        prev.map((r) =>
          r.id === editingReport.id
            ? {
                ...r,
                category: editCategory,
                description: editDescription.trim(),
                status: editStatus,
              }
            : r
        )
      );

      setEditModalVisible(false);
      Alert.alert('Success', 'Your report has been updated.');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Filter and Sort reports dynamically
  const filteredReports = useMemo(() => {
    let list = [...reports];

    // 1. Filter by Type
    if (typeFilter !== 'all') {
      list = list.filter((r) => (r.type || 'lost').toLowerCase() === typeFilter);
    }

    // 2. Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const cat = (r.category || '').toLowerCase();
        const desc = (r.description || '').toLowerCase();
        return cat.includes(q) || desc.includes(q);
      });
    }

    // 3. Sort Mode
    if (sortMode === 'latest') {
      list.sort((a, b) => (b._createdMillis || 0) - (a._createdMillis || 0));
    } else if (sortMode === 'popular') {
      list.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
    } else if (sortMode === 'nearby') {
      if (userLocation) {
        list.sort((a, b) => {
          const distA = getDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            a.location?.latitude,
            a.location?.longitude
          ) ?? 999999;
          const distB = getDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            b.location?.latitude,
            b.location?.longitude
          ) ?? 999999;
          return distA - distB;
        });
      } else {
        list.sort((a, b) => (b._createdMillis || 0) - (a._createdMillis || 0));
      }
    }

    return list;
  }, [reports, sortMode, typeFilter, searchQuery, userLocation]);

  const styles = getStyles(colors, isDark, insets);

  // Render Post Item Card
  const renderReportItem = ({ item }) => {
    const isLost = (item.type || 'lost').toLowerCase() === 'lost';
    const isReunited = (item.status || '').toLowerCase() === 'reunited';
    const isSighted = (item.status || '').toLowerCase() === 'sighted';
    const isOwn = item.reportedBy === user?.uid;
    const canEdit = isOwn;
    const canDelete = isOwn || isUserAdmin;
    const isConfirmed = Array.isArray(item.confirmedBy) && item.confirmedBy.includes(user?.uid);

    let distanceText = null;
    if (userLocation && item.location?.latitude && item.location?.longitude) {
      const dist = getDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        item.location.latitude,
        item.location.longitude
      );
      distanceText = formatDistance(dist);
    }

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => navigation.navigate(ROUTES.LOST_FOUND_DETAIL, { reportId: item.id })}
      >
        {/* Top Badges Row */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardBadgesLeft}>
            {/* Lost / Found Chip */}
            <View style={[styles.typeBadge, isLost ? styles.typeBadgeLost : styles.typeBadgeFound]}>
              <Ionicons
                name={isLost ? 'alert-circle' : 'checkmark-circle'}
                size={13}
                color={isLost ? '#E53935' : '#2E7D32'}
              />
              <Text style={[styles.typeBadgeText, isLost ? styles.typeBadgeTextLost : styles.typeBadgeTextFound]}>
                {isLost ? 'LOST ITEM' : 'FOUND ITEM'}
              </Text>
            </View>

            {/* Status Chip if Reunited / Sighted */}
            {isReunited ? (
              <View style={styles.statusBadgeReunited}>
                <Text style={styles.statusBadgeReunitedText}>🎉 Reunited</Text>
              </View>
            ) : isSighted ? (
              <View style={styles.statusBadgeSighted}>
                <Text style={styles.statusBadgeSightedText}>👀 Sighted</Text>
              </View>
            ) : null}
          </View>

          {/* Right Header Actions: Time + Edit/Delete Buttons */}
          <View style={styles.cardBadgesRight}>
            <Text style={styles.cardTimeText}>{formatRelativeTime(item.createdAt)}</Text>

            {canEdit && (
              <TouchableOpacity
                style={styles.cardActionIconButton}
                onPress={() => handleOpenEditModal(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Edit Report"
              >
                <Ionicons name="pencil" size={13} color={colors.darkGreenMid} />
              </TouchableOpacity>
            )}

            {canDelete && (
              <TouchableOpacity
                style={[styles.cardActionIconButton, styles.cardActionDeleteButton]}
                onPress={() => handleDeleteReport(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={!isOwn && isUserAdmin ? 'Admin Delete Report' : 'Delete Report'}
              >
                <Ionicons name="trash-outline" size={13} color="#D32F2F" />
                {!isOwn && isUserAdmin && (
                  <View style={styles.adminMiniBadge}>
                    <Text style={styles.adminMiniBadgeText}>Admin</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Media or Category Box */}
        {item.photoUrl ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: item.photoUrl }} style={styles.cardImage} resizeMode="cover" />
            <View style={styles.imageOverlayCategory}>
              <Ionicons name={getCategoryIcon(item.category)} size={14} color="#FFF" />
              <Text style={styles.imageOverlayCategoryText}>{item.category || 'Item'}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.placeholderImageBox}>
            <View style={styles.placeholderIconCircle}>
              <Ionicons name={getCategoryIcon(item.category)} size={28} color={colors.darkGreenMid} />
            </View>
            <Text style={styles.placeholderCategoryName}>{item.category || 'General Item'}</Text>
          </View>
        )}

        {/* Card Body */}
        <View style={styles.cardBody}>
          <Text style={styles.cardCategoryTitle}>{item.category || 'Uncategorized'}</Text>
          <Text style={styles.cardDescription} numberOfLines={3}>
            {item.description || 'No description provided.'}
          </Text>

          {/* Location Badge */}
          {distanceText ? (
            <View style={styles.distanceBadgeRow}>
              <Ionicons name="location-sharp" size={14} color={colors.darkGreenMid} />
              <Text style={styles.distanceBadgeText}>{distanceText}</Text>
            </View>
          ) : item.location ? (
            <View style={styles.distanceBadgeRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.distanceBadgeText}>Location tagged</Text>
            </View>
          ) : null}
        </View>

        {/* Card Footer Actions */}
        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[
              styles.confirmButton,
              isConfirmed && styles.confirmButtonActive,
              isOwn && styles.confirmButtonDisabled,
            ]}
            onPress={() => handleConfirm(item)}
            disabled={isOwn || isConfirmed || confirmingId === item.id}
            activeOpacity={0.75}
          >
            {confirmingId === item.id ? (
              <ActivityIndicator size="small" color={colors.darkGreenMid} />
            ) : (
              <>
                <Ionicons
                  name={isConfirmed ? 'checkmark-done' : 'thumbs-up-outline'}
                  size={15}
                  color={isConfirmed ? colors.safeGreen : isOwn ? colors.textMuted : colors.darkGreenMid}
                />
                <Text
                  style={[
                    styles.confirmButtonText,
                    isConfirmed && styles.confirmButtonTextActive,
                    isOwn && styles.confirmButtonTextDisabled,
                  ]}
                >
                  {isConfirmed
                    ? `Verified (${item.confidenceScore || 1})`
                    : `Confirm (${item.confidenceScore || 0})`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.detailLink}>
            <Text style={styles.detailLinkText}>View Details</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.darkGreenMid} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Render Match Item Card
  const renderMatchItem = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => navigation.navigate(ROUTES.MATCH_CHAT, { matchId: item.id })}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.typeBadgeFound}>
            <Ionicons name="sparkles" size={13} color="#2E7D32" />
            <Text style={styles.typeBadgeTextFound}>POTENTIAL MATCH</Text>
          </View>
          <Text style={styles.cardTimeText}>{formatRelativeTime(item.createdAt)}</Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardCategoryTitle}>Item Match Identified</Text>
          <Text style={styles.cardDescription}>
            A report was matched with your listing. Tap below to chat securely with the owner/finder and verify.
          </Text>
          <View style={styles.matchStatusRow}>
            <Text style={styles.matchStatusLabel}>Status: </Text>
            <Text style={styles.matchStatusVal}>{item.status || 'suggested'}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.openChatBtn}>
            <Ionicons name="chatbubbles" size={16} color="#FFF" />
            <Text style={styles.openChatBtnText}>Open Secure Chat</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.darkGreen} />

      {/* 1. Header with Dark Green Gradient matching GuardianCircle Shell */}
      <LinearGradient
        colors={[colors.darkGreen, colors.darkGreenLight]}
        style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Lost & Found</Text>
            <Text style={styles.headerSubtitle}>Community reports & live reunites</Text>
          </View>

          <View style={styles.headerRightActions}>
            {/* Karma Score Chip */}
            <TouchableOpacity
              style={styles.karmaChip}
              activeOpacity={0.8}
              onPress={() =>
                Alert.alert(
                  'Community Karma',
                  `You have ${karmaScore || 0} karma points! You earn karma by confirming reports and helping reunite lost items with owners.`
                )
              }
            >
              <Text style={styles.karmaStar}>⭐</Text>
              <Text style={styles.karmaChipText}>{karmaScore === null ? '...' : karmaScore} pts</Text>
            </TouchableOpacity>

            {/* Theme Toggle */}
            <ThemeToggle iconColor="#FFF" style={styles.themeToggleBtn} />
          </View>
        </View>

        {/* View Switcher: Community Feed vs My Matches */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'feed' && styles.tabButtonActive]}
            onPress={() => setActiveTab('feed')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="globe-outline"
              size={16}
              color={activeTab === 'feed' ? colors.darkGreenMid : 'rgba(255,255,255,0.8)'}
            />
            <Text style={[styles.tabButtonText, activeTab === 'feed' && styles.tabButtonTextActive]}>
              Community Feed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'matches' && styles.tabButtonActive]}
            onPress={() => setActiveTab('matches')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="chatbubbles-outline"
              size={16}
              color={activeTab === 'matches' ? colors.darkGreenMid : 'rgba(255,255,255,0.8)'}
            />
            <Text style={[styles.tabButtonText, activeTab === 'matches' && styles.tabButtonTextActive]}>
              My Matches
            </Text>
            {matches.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{matches.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* 2. Main Body */}
      {activeTab === 'feed' ? (
        <View style={styles.container}>
          {/* Search Bar */}
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search items, categories, descriptions..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Sort Tabs & Filter Pills Row */}
          <View style={styles.filterSection}>
            {/* Sort Segments: Latest | Most Liked | Nearby */}
            <View style={styles.sortSegmentsContainer}>
              <TouchableOpacity
                style={[styles.sortSegment, sortMode === 'latest' && styles.sortSegmentActive]}
                onPress={() => setSortMode('latest')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={sortMode === 'latest' ? colors.darkGreenMid : colors.textSecondary}
                />
                <Text style={[styles.sortSegmentText, sortMode === 'latest' && styles.sortSegmentTextActive]}>
                  Latest
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sortSegment, sortMode === 'popular' && styles.sortSegmentActive]}
                onPress={() => setSortMode('popular')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="heart-outline"
                  size={14}
                  color={sortMode === 'popular' ? colors.darkGreenMid : colors.textSecondary}
                />
                <Text style={[styles.sortSegmentText, sortMode === 'popular' && styles.sortSegmentTextActive]}>
                  Most Liked
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sortSegment, sortMode === 'nearby' && styles.sortSegmentActive]}
                onPress={() => {
                  setSortMode('nearby');
                  if (!userLocation) acquireLocation();
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="navigate-outline"
                  size={14}
                  color={sortMode === 'nearby' ? colors.darkGreenMid : colors.textSecondary}
                />
                <Text style={[styles.sortSegmentText, sortMode === 'nearby' && styles.sortSegmentTextActive]}>
                  Nearby
                </Text>
              </TouchableOpacity>
            </View>

            {/* Type Filter Pills: All | Lost | Found */}
            <View style={styles.typePillsRow}>
              <TouchableOpacity
                style={[styles.typePill, typeFilter === 'all' && styles.typePillActive]}
                onPress={() => setTypeFilter('all')}
              >
                <Text style={[styles.typePillText, typeFilter === 'all' && styles.typePillTextActive]}>
                  All ({reports.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typePill, typeFilter === 'lost' && styles.typePillActive]}
                onPress={() => setTypeFilter('lost')}
              >
                <Text style={[styles.typePillText, typeFilter === 'lost' && styles.typePillTextActive]}>
                  🔍 Lost
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typePill, typeFilter === 'found' && styles.typePillActive]}
                onPress={() => setTypeFilter('found')}
              >
                <Text style={[styles.typePillText, typeFilter === 'found' && styles.typePillTextActive]}>
                  ✨ Found
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Posts Feed List */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.darkGreenMid} />
              <Text style={styles.loadingText}>Loading community reports...</Text>
            </View>
          ) : filteredReports.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="search-outline" size={42} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No matching reports found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'Try searching with different keywords.'
                  : 'Be the first in your community to publish a lost or found item!'}
              </Text>
              <TouchableOpacity style={styles.emptyActionButton} onPress={() => setReportModalVisible(true)}>
                <Text style={styles.emptyActionButtonText}>+ Create Report</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredReports}
              keyExtractor={(item) => item.id}
              renderItem={renderReportItem}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.darkGreenMid]} />}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      ) : (
        /* My Matches View */
        <View style={styles.container}>
          {matches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="chatbubbles-outline" size={42} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No matches yet</Text>
              <Text style={styles.emptySubtitle}>
                When someone reports an item matching your lost or found listing, a private match connection will appear here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={matches}
              keyExtractor={(item) => item.id}
              renderItem={renderMatchItem}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.darkGreenMid]} />}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* 3. Floating Action Button for Reporting (No clunky button list) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setReportModalVisible(true)}
        activeOpacity={0.88}
        accessibilityLabel="Create Report"
      >
        <LinearGradient
          colors={[colors.darkGreen, colors.darkGreenLight]}
          style={styles.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="add" size={24} color="#FFF" />
          <Text style={styles.fabText}>Report</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* 4. Report Selection Modal Sheet */}
      <Modal
        visible={reportModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setReportModalVisible(false)}
        >
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Report an Item</Text>
            <Text style={styles.modalSubtitle}>
              Help reconnect lost belongings with owners in our community
            </Text>

            {/* Option 1: Report Lost Item */}
            <TouchableOpacity
              style={styles.modalOptionCard}
              onPress={() => {
                setReportModalVisible(false);
                navigation.navigate(ROUTES.REPORT_LOST);
              }}
              activeOpacity={0.85}
            >
              <View style={[styles.modalOptionIconBox, { backgroundColor: '#FFEBEE' }]}>
                <Ionicons name="alert-circle" size={24} color="#D32F2F" />
              </View>
              <View style={styles.modalOptionTextContainer}>
                <Text style={styles.modalOptionTitle}>Report Lost Item</Text>
                <Text style={styles.modalOptionDesc}>
                  I lost something and want the community to help locate it
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Option 2: Report Found Item */}
            <TouchableOpacity
              style={styles.modalOptionCard}
              onPress={() => {
                setReportModalVisible(false);
                navigation.navigate(ROUTES.REPORT_FOUND);
              }}
              activeOpacity={0.85}
            >
              <View style={[styles.modalOptionIconBox, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="checkmark-circle" size={24} color="#2E7D32" />
              </View>
              <View style={styles.modalOptionTextContainer}>
                <Text style={styles.modalOptionTitle}>Report Found Item</Text>
                <Text style={styles.modalOptionDesc}>
                  I found an item and want to match it with its rightful owner
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setReportModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 5. Edit Report Modal Sheet */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setEditModalVisible(false)}
        >
          <View style={styles.editModalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Your Report</Text>
            <Text style={styles.modalSubtitle}>Update details or current status of your listing</Text>

            {/* Category selection */}
            <Text style={styles.editInputLabel}>Category</Text>
            <View style={styles.editChipsRow}>
              {CATEGORIES.map((cat) => {
                const isSelected = editCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.editChip, isSelected && styles.editChipActive]}
                    onPress={() => setEditCategory(cat)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.editChipText, isSelected && styles.editChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Status selection */}
            <Text style={styles.editInputLabel}>Report Status</Text>
            <View style={styles.editChipsRow}>
              {[
                { key: editingReport?.type || 'lost', label: editingReport?.type === 'found' ? 'Found (Active)' : 'Lost (Active)' },
                { key: 'sighted', label: '👀 Sighted' },
                { key: 'reunited', label: '🎉 Reunited' },
              ].map((st) => {
                const isSelected = editStatus === st.key;
                return (
                  <TouchableOpacity
                    key={st.key}
                    style={[styles.editChip, isSelected && styles.editChipActive]}
                    onPress={() => setEditStatus(st.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.editChipText, isSelected && styles.editChipTextActive]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Description editing */}
            <Text style={styles.editInputLabel}>Description</Text>
            <TextInput
              style={styles.editTextArea}
              placeholder="Update description, details, or contact notes..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              value={editDescription}
              onChangeText={setEditDescription}
            />

            {/* Action Buttons */}
            <TouchableOpacity
              style={[styles.editSaveBtn, savingEdit && { opacity: 0.6 }]}
              onPress={handleSaveEdit}
              disabled={savingEdit}
              activeOpacity={0.85}
            >
              {savingEdit ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.editSaveBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setEditModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const getStyles = (colors, isDark, insets) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 18,
      paddingBottom: 14,
      ...SHADOWS.medium,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    headerTitleContainer: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontSize: 12,
      color: 'rgba(255, 255, 255, 0.85)',
      marginTop: 2,
    },
    headerRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    karmaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.35)',
    },
    karmaStar: {
      fontSize: 12,
      marginRight: 4,
    },
    karmaChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    themeToggleBtn: {
      marginLeft: 4,
    },
    tabSwitcher: {
      flexDirection: 'row',
      backgroundColor: 'rgba(0, 0, 0, 0.16)',
      borderRadius: RADIUS.lg,
      padding: 4,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: RADIUS.md,
      gap: 6,
    },
    tabButtonActive: {
      backgroundColor: colors.surface,
      ...SHADOWS.small,
    },
    tabButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.85)',
    },
    tabButtonTextActive: {
      color: colors.darkGreenMid,
      fontWeight: '700',
    },
    tabBadge: {
      backgroundColor: '#E53935',
      borderRadius: 9,
      paddingHorizontal: 5,
      paddingVertical: 1,
      marginLeft: 2,
    },
    tabBadgeText: {
      color: '#FFF',
      fontSize: 10,
      fontWeight: 'bold',
    },
    container: {
      flex: 1,
    },
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.small,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    filterSection: {
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 6,
    },
    sortSegmentsContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFE9',
      borderRadius: 10,
      padding: 3,
      marginBottom: 8,
    },
    sortSegment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      borderRadius: 8,
      gap: 4,
    },
    sortSegmentActive: {
      backgroundColor: colors.surface,
      ...SHADOWS.small,
    },
    sortSegmentText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    sortSegmentTextActive: {
      color: colors.darkGreenMid,
      fontWeight: '700',
    },
    typePillsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    typePill: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typePillActive: {
      backgroundColor: isDark ? colors.darkGreenSurface : '#E0F2F1',
      borderColor: colors.darkGreenMid,
    },
    typePillText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    typePillTextActive: {
      color: colors.darkGreenMid,
      fontWeight: '700',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 90,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
      overflow: 'hidden',
      ...SHADOWS.medium,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
    },
    cardBadgesLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 8,
      gap: 4,
    },
    typeBadgeLost: {
      backgroundColor: isDark ? 'rgba(229, 57, 53, 0.22)' : '#FFEBEE',
    },
    typeBadgeFound: {
      backgroundColor: isDark ? 'rgba(46, 125, 50, 0.22)' : '#E8F5E9',
    },
    typeBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    typeBadgeTextLost: {
      color: '#E53935',
    },
    typeBadgeTextFound: {
      color: '#2E7D32',
    },
    statusBadgeReunited: {
      backgroundColor: isDark ? 'rgba(123, 31, 162, 0.22)' : '#F3E5F5',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    statusBadgeReunitedText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#7B1FA2',
    },
    statusBadgeSighted: {
      backgroundColor: isDark ? 'rgba(251, 140, 0, 0.22)' : '#FFF3E0',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    statusBadgeSightedText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FB8C00',
    },
    cardTimeText: {
      fontSize: 11,
      color: colors.textMuted,
    },
    cardBadgesRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cardActionIconButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F4F0',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    cardActionDeleteButton: {
      backgroundColor: isDark ? 'rgba(211, 47, 47, 0.18)' : '#FFEBEE',
    },
    adminMiniBadge: {
      position: 'absolute',
      top: -6,
      right: -8,
      backgroundColor: '#D32F2F',
      borderRadius: 6,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    adminMiniBadgeText: {
      color: '#FFF',
      fontSize: 8,
      fontWeight: 'bold',
    },
    imageContainer: {
      width: '100%',
      height: 180,
      position: 'relative',
    },
    cardImage: {
      width: '100%',
      height: '100%',
    },
    imageOverlayCategory: {
      position: 'absolute',
      bottom: 10,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 12,
      gap: 5,
    },
    imageOverlayCategoryText: {
      color: '#FFF',
      fontSize: 11,
      fontWeight: '600',
    },
    placeholderImageBox: {
      height: 90,
      backgroundColor: isDark ? colors.darkGreenSurface : '#E8F5E9',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 12,
    },
    placeholderIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOWS.small,
    },
    placeholderCategoryName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.darkGreenMid,
    },
    cardBody: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 8,
    },
    cardCategoryTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    cardDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 8,
    },
    distanceBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    distanceBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.darkGreenMid,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FAFCFA',
    },
    confirmButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.darkGreenSurface : '#E0F2F1',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 14,
      gap: 5,
      minHeight: 30,
    },
    confirmButtonActive: {
      backgroundColor: isDark ? 'rgba(46, 125, 50, 0.22)' : '#E8F5E9',
    },
    confirmButtonDisabled: {
      opacity: 0.65,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E0E0E0',
    },
    confirmButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.darkGreenMid,
    },
    confirmButtonTextActive: {
      color: colors.safeGreen,
      fontWeight: '700',
    },
    confirmButtonTextDisabled: {
      color: colors.textMuted,
    },
    detailLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    detailLinkText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.darkGreenMid,
    },
    matchStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
    },
    matchStatusLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    matchStatusVal: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.darkGreenMid,
      textTransform: 'capitalize',
    },
    openChatBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.darkGreenMid,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: RADIUS.md,
      gap: 6,
    },
    openChatBtnText: {
      color: '#FFF',
      fontWeight: '700',
      fontSize: 13,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    loadingText: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 10,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingTop: 40,
    },
    emptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F5E9',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 20,
    },
    emptyActionButton: {
      backgroundColor: colors.darkGreenMid,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: RADIUS.lg,
    },
    emptyActionButtonText: {
      color: '#FFF',
      fontWeight: '700',
      fontSize: 14,
    },
    fab: {
      position: 'absolute',
      bottom: 22,
      right: 20,
      borderRadius: 28,
      overflow: 'hidden',
      elevation: 6,
      ...SHADOWS.large,
    },
    fabGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 28,
      gap: 6,
    },
    fabText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: 'bold',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: Math.max(insets.bottom, 24),
    },
    modalHandle: {
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.borderDark,
      alignSelf: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    modalSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    modalOptionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: 12,
      gap: 12,
      ...SHADOWS.small,
    },
    modalOptionIconBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalOptionTextContainer: {
      flex: 1,
    },
    modalOptionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    modalOptionDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    modalCancelBtn: {
      marginTop: 8,
      paddingVertical: 14,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFE9',
      alignItems: 'center',
    },
    modalCancelBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    editModalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: Math.max(insets.bottom, 24),
      maxHeight: '90%',
    },
    editInputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 10,
      marginBottom: 6,
    },
    editChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 4,
    },
    editChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    editChipActive: {
      backgroundColor: isDark ? colors.darkGreenSurface : '#E0F2F1',
      borderColor: colors.darkGreenMid,
    },
    editChipText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    editChipTextActive: {
      color: colors.darkGreenMid,
      fontWeight: '700',
    },
    editTextArea: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 12,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FAFCFA',
      textAlignVertical: 'top',
      minHeight: 80,
    },
    editSaveBtn: {
      backgroundColor: colors.darkGreenMid,
      borderRadius: RADIUS.lg,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 18,
      ...SHADOWS.medium,
    },
    editSaveBtnText: {
      color: '#FFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
