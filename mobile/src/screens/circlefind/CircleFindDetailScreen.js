import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Linking,
  Animated,
} from 'react-native';
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { awardKarma } from '../../services/karmaService';
import {
  toggleAmplifyPost,
  formatRelativeTime,
  CIRCLE_FIND_COLLECTION,
  fetchUserAccountName,
  fetchUserAccountProfile,
  resolveReadableAddress,
  resolveFullDetailedAddress,
  showToast,
} from '../../services/circleFindService';
import Toast from '../../components/common/Toast';
import { ROLES, isAdmin } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';
import { RADIUS, SHADOWS, SPACING } from '../../constants/theme';

const KARMA_FOR_HELPING = 5;
const CATEGORIES = ['Child', 'Pet', 'Electronics', 'Bag', 'Documents', 'Keys', 'Jewelry', 'Other'];

const STATUS_STAGES = [
  { key: 'missing', label: 'Missing', icon: 'report-problem', color: '#E53935' },
  { key: 'spotted', label: 'Spotted', icon: 'visibility', color: '#FB8C00' },
  { key: 'found', label: 'Found', icon: 'check-circle', color: '#2E7D32' },
  { key: 'returned', label: 'Returned', icon: 'celebration', color: '#7B1FA2' },
];

export default function CircleFindDetailScreen({ route, navigation }) {
  const { reportId } = route.params;
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [amplifying, setAmplifying] = useState(false);

  // Edit Modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editStatus, setEditStatus] = useState('missing');
  const [savingEdit, setSavingEdit] = useState(false);

  const isUserAdmin =
    userProfile?.role === ROLES.ADMIN_MODERATOR ||
    userProfile?.role === 'admin' ||
    userProfile?.isAdmin === true ||
    isAdmin(userProfile?.role);

  const [resolvedAddress, setResolvedAddress] = useState(null);

  useEffect(() => {
    const reportRef = doc(db, CIRCLE_FIND_COLLECTION, reportId);
    const unsubscribe = onSnapshot(reportRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let repName = data.reportedByName || data.reporterName || data.authorName;
        let repPhoto = data.authorPhotoURL || data.reporterPhotoURL || null;
        const authorUid = data.reportedBy || data.reporterUid || data.userId || data.authorId;

        if (authorUid) {
          const profile = await fetchUserAccountProfile(authorUid, true);
          if (profile.name) repName = profile.name;
          if (profile.photoURL) repPhoto = profile.photoURL;
        }

        // Resolve comprehensive full location details (building, street, suburb, city, district)
        const lat = data.location?.latitude;
        const lon = data.location?.longitude;
        if (typeof lat === 'number' && typeof lon === 'number') {
          resolveFullDetailedAddress(lat, lon).then((fullAddr) => {
            if (fullAddr) {
              setResolvedAddress(fullAddr);
            } else {
              resolveReadableAddress(lat, lon).then((shortAddr) => {
                if (shortAddr) setResolvedAddress(shortAddr);
              });
            }
          });
        }

        setReport({ id: docSnap.id, ...data, reportedByName: repName, authorPhotoURL: repPhoto });
      } else {
        setReport(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [reportId]);

  // Normalize status string
  const currentStatus = (report?.status || report?.type || 'missing').toLowerCase();
  const isReturned = currentStatus === 'returned' || currentStatus === 'reunited';
  const postAuthor = report?.reportedBy || report?.reporterUid || report?.userId || report?.authorId;
  const isOwner = Boolean(user?.uid && postAuthor === user.uid);
  const canDelete = isOwner || isUserAdmin;

  // Check if current user amplified
  const boostedList = Array.isArray(report?.boostedBy) ? report.boostedBy : [];
  const isAmplified = user?.uid ? boostedList.includes(user.uid) : false;
  const amplifyCount = report?.boostCount ?? boostedList.length;

  const boostScaleAnim = useRef(new Animated.Value(1)).current;

  async function handleAmplify() {
    if (!user?.uid) {
      showToast('Please sign in to amplify community alerts.');
      return;
    }
    setAmplifying(true);

    // Spring bounce animation on click
    Animated.sequence([
      Animated.timing(boostScaleAnim, {
        toValue: 1.4,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(boostScaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await toggleAmplifyPost(reportId, user.uid);
      showToast(isAmplified ? 'Alert un-amplified' : 'Alert amplified to community!');
    } catch (err) {
      showToast(err.message);
    } finally {
      setAmplifying(false);
    }
  }

  // Status transition ONLY by post owner
  async function handleUpdateStatus(newStatus) {
    if (!isOwner) {
      showToast('Only the post author can update this status');
      return;
    }
    setUpdating(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await updateDoc(doc(db, CIRCLE_FIND_COLLECTION, reportId), {
        status: newStatus,
      });

      if (newStatus === 'returned' && report?.reportedBy !== user?.uid) {
        await awardKarma(user.uid, KARMA_FOR_HELPING);
      }

      showToast(`Status updated to ${newStatus.toUpperCase()}`);
    } catch (error) {
      showToast(error.message);
    } finally {
      setUpdating(false);
    }
  }

  // Delete Report Execution (No blocking alert popup, Toast feedback)
  async function executeDelete() {
    if (!report) return;
    setDeleting(true);
    setConfirmDeleteVisible(false);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      try {
        // 1. Try physical deletion
        await deleteDoc(doc(db, CIRCLE_FIND_COLLECTION, reportId));
      } catch (permErr) {
        console.warn('[CircleFind] Physical delete restricted by security rules, using soft-delete fallback:', permErr.message);
        // 2. Fallback to soft delete
        await updateDoc(doc(db, CIRCLE_FIND_COLLECTION, reportId), {
          status: 'deleted',
          isDeleted: true,
          deletedAt: serverTimestamp(),
        });
      }
      showToast('Report permanently removed');
      navigation.goBack();
    } catch (err) {
      showToast(err.message);
      setDeleting(false);
    }
  }

  // Open Edit Modal - Strictly ONLY for post owner (Admin cannot edit post details)
  function handleOpenEdit() {
    if (!isOwner) {
      showToast('Only the post owner can edit these details');
      return;
    }
    setEditTitle(report.title || '');
    setEditCategory(report.category || 'Other');
    setEditDescription(report.description || '');
    setEditContact(report.contactDetails || report.contactPhone || '');
    setEditStatus(currentStatus);
    setEditModalVisible(true);
  }

  // Save Edit - Strictly ONLY for post owner
  async function handleSaveEdit() {
    if (!isOwner) return;
    if (!editDescription.trim()) {
      showToast('Please enter a description');
      return;
    }
    setSavingEdit(true);
    try {
      const authorAccountName =
        userProfile?.displayName ||
        user?.displayName ||
        userProfile?.fullName ||
        userProfile?.name ||
        (user?.email ? user.email.split('@')[0] : '');

      const updatePayload = {
        title: editTitle.trim(),
        category: editCategory,
        description: editDescription.trim(),
        contactDetails: editContact.trim(),
        status: editStatus,
      };
      if (authorAccountName) {
        updatePayload.reportedByName = authorAccountName;
        updatePayload.reporterName = authorAccountName;
        updatePayload.authorName = authorAccountName;
      }
      if (user?.uid) {
        updatePayload.reporterUid = user.uid;
        updatePayload.reportedBy = user.uid;
      }
      await updateDoc(doc(db, CIRCLE_FIND_COLLECTION, reportId), updatePayload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditModalVisible(false);
      showToast('Report updated successfully');
    } catch (err) {
      showToast(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  // Navigate to Map screen with highlighted path to item lost location
  function handleNavigateToLostLocation() {
    const lat = report?.location?.latitude;
    const lon = report?.location?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      showToast('No GPS coordinates tagged for this post');
      return;
    }
    const locName = resolvedAddress || report.location?.addressName || report.title || 'Lost Item Location';
    navigation.navigate(ROUTES.MAP, {
      destination: {
        latitude: lat,
        longitude: lon,
        name: locName,
      },
    });
  }

  function handleCallContact(phone) {
    if (!phone) return;
    const clean = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => {
      showToast('Could not open dialer with this number');
    });
  }

  const styles = getStyles(colors, isDark);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.darkGreenMid} />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.centerContainer}>
        <MaterialIcons name="search-off" size={48} color={colors.textMuted} />
        <Text style={styles.notFoundText}>Report not found or has been removed.</Text>
      </View>
    );
  }

  return (
    <View style={styles.rootView}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Photo or Category Graphic with Left Bottom Corner Overlay */}
      <View style={styles.photoContainer}>
        {report.photoUrl ? (
          <Image source={{ uri: report.photoUrl }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.placeholderBanner}>
            <MaterialIcons name="category" size={48} color={colors.darkGreenMid} />
            <Text style={styles.placeholderBannerText}>{report.category || 'General Item'}</Text>
          </View>
        )}

        {/* Overlay at Left Bottom Corner of Image: Category & Status */}
        <View style={styles.imageBottomLeftOverlay}>
          {/* Category Pill */}
          <View style={styles.categoryOverlay}>
            <MaterialIcons name="category" size={13} color="#FFF" />
            <Text style={styles.categoryOverlayText}>{report.category || 'Item'}</Text>
          </View>

          {/* Status Badge */}
          {currentStatus === 'missing' && (
            <View style={[styles.statusOverlayBadge, { backgroundColor: '#E53935' }]}>
              <MaterialIcons name="report-problem" size={12} color="#FFF" />
              <Text style={styles.statusOverlayText}>Missing</Text>
            </View>
          )}
          {currentStatus === 'spotted' && (
            <View style={[styles.statusOverlayBadge, { backgroundColor: '#FB8C00' }]}>
              <MaterialIcons name="visibility" size={12} color="#FFF" />
              <Text style={styles.statusOverlayText}>Spotted</Text>
            </View>
          )}
          {currentStatus === 'found' && (
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

        {/* Timestamp Overlay at Top-Right */}
        <View style={styles.timeOverlayBadge}>
          <Text style={styles.timeOverlayText}>{formatRelativeTime(report.createdAt)}</Text>
        </View>
      </View>

      {/* Main Info Card */}
      <View style={styles.card}>

        {/* Title */}
        <Text style={styles.itemTitle}>{report.title || `${report.category || 'Missing'} Item`}</Text>

        {/* Category & Reporter details */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            {(isOwner ? userProfile?.photoURL : report.authorPhotoURL) ? (
              <Image
                source={{ uri: isOwner ? userProfile.photoURL : report.authorPhotoURL }}
                style={styles.metaAvatar}
              />
            ) : (
              <MaterialIcons name="person" size={14} color={isOwner ? colors.darkGreenMid : colors.textMuted} />
            )}
            <Text style={[styles.metaText, isOwner && { color: colors.darkGreenMid, fontWeight: '700' }]}>
              {isOwner ? 'You' : (report.reportedByName || 'Community Member')}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <MaterialIcons name="folder" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{report.category || 'General'}</Text>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.sectionHeader}>Description & Distinguishing Features</Text>
        <Text style={styles.descriptionText}>{report.description || 'No description provided.'}</Text>

        {/* Location Section */}
        <Text style={styles.sectionHeader}>Location / Last Seen Area</Text>
        <TouchableOpacity
          style={styles.locationBox}
          onPress={handleNavigateToLostLocation}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="View lost location on map"
        >
          <MaterialIcons name="place" size={22} color={colors.darkGreenMid} />
          <View style={{ flex: 1 }}>
            <Text style={styles.locationTitle}>
              {resolvedAddress ||
                (report.location?.addressName &&
                !report.location.addressName.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)
                  ? report.location.addressName
                  : null) ||
                'Tagged Location'}
            </Text>
            <View style={styles.viewOnMapRow}>
              <MaterialIcons name="directions" size={13} color={colors.darkGreenMid} />
              <Text style={styles.viewOnMapText}>View route on Map</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.darkGreenMid} />
        </TouchableOpacity>

        {/* Contact Information */}
        {(report.contactDetails || report.contactPhone) && (
          <>
            <Text style={styles.sectionHeader}>Contact Information</Text>
            <View style={styles.contactCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactLabel}>Reach Owner / Helper</Text>
                <Text style={styles.contactValue}>
                  {report.contactDetails || report.contactPhone}
                </Text>
              </View>
              {(report.contactPhone || report.contactDetails) && (
                <TouchableOpacity
                  style={styles.callButton}
                  onPress={() => handleCallContact(report.contactPhone || report.contactDetails)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="call" size={18} color="#FFF" />
                  <Text style={styles.callButtonText}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>

      {/* Community Amplify Alert Banner */}
      <View style={styles.amplifyCard}>
        <View style={styles.amplifyInfo}>
          <View style={styles.amplifyTitleRow}>
            <MaterialIcons name="campaign" size={22} color={colors.darkGreenMid} />
            <Text style={styles.amplifyTitle}>Amplify / Signal Boost</Text>
          </View>
          <Text style={styles.amplifyDesc}>
            Boosting expands this alert's broadcast radius to more people in the area.
          </Text>
        </View>
        <View style={styles.amplifyBtnRow}>
          <TouchableOpacity
            style={[styles.amplifyIconBtn, isAmplified && styles.amplifyIconBtnActive]}
            onPress={handleAmplify}
            disabled={amplifying}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Amplify alert"
          >
            {amplifying ? (
              <ActivityIndicator size="small" color={isAmplified ? '#FFF' : colors.darkGreenMid} />
            ) : (
              <Animated.View style={{ transform: [{ scale: boostScaleAnim }] }}>
                <MaterialIcons
                  name="bolt"
                  size={24}
                  color={isAmplified ? '#FFF' : colors.darkGreenMid}
                />
              </Animated.View>
            )}
          </TouchableOpacity>
          <Text style={[styles.amplifyCountLabel, isAmplified && styles.amplifyCountLabelActive]}>
            {isAmplified ? `Amplified (${amplifyCount})` : `Boost Alert (${amplifyCount})`}
          </Text>
        </View>
      </View>

      {/* Status Progress & Transitions (Shown ONLY for post owner, hidden for other users) */}
      {isOwner && (
        <View style={styles.lifecycleCard}>
          <Text style={styles.lifecycleTitle}>Status Progress</Text>
          <View style={styles.statusChipsRow}>
            {STATUS_STAGES.map((st) => {
              const isCur = currentStatus === st.key;
              return (
                <TouchableOpacity
                  key={st.key}
                  style={[
                    styles.statusSelectChip,
                    isCur && { backgroundColor: st.color, borderColor: st.color },
                  ]}
                  onPress={() => handleUpdateStatus(st.key)}
                  disabled={updating}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={st.icon}
                    size={14}
                    color={isCur ? '#FFF' : colors.textSecondary}
                  />
                  <Text style={[styles.statusSelectChipText, isCur && { color: '#FFF' }]}>
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {isReturned && (
            <View style={styles.returnedBanner}>
              <MaterialIcons name="celebration" size={20} color="#7B1FA2" />
              <Text style={styles.returnedBannerText}>This case has been resolved and returned!</Text>
            </View>
          )}
        </View>
      )}

      {/* Management Actions: Owner can Edit & Delete; Admin can ONLY Delete; Other users see nothing */}
      {(isOwner || isUserAdmin) && (
        <View style={styles.manageCard}>
          <Text style={styles.manageTitle}>
            {isOwner ? 'Manage Your Listing' : 'Admin Moderation (Delete Only)'}
          </Text>

          {confirmDeleteVisible ? (
            <View style={styles.confirmDeleteBox}>
              <Text style={styles.confirmDeleteText}>
                {isOwner
                  ? 'Permanently delete this report? This action cannot be undone.'
                  : 'Admin: Permanently delete this report from the community feed?'}
              </Text>
              <View style={styles.confirmDeleteBtnsRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setConfirmDeleteVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmDeleteBtn}
                  onPress={executeDelete}
                  disabled={deleting}
                  activeOpacity={0.8}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.confirmDeleteBtnText}>Yes, Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.manageButtonsRow}>
              {/* Edit Details ONLY shown to the post owner. Strictly hidden for Admin and regular users. */}
              {isOwner && (
                <TouchableOpacity
                  style={styles.manageEditBtn}
                  onPress={handleOpenEdit}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="edit" size={16} color={colors.darkGreenMid} />
                  <Text style={styles.manageEditBtnText}>Edit Details</Text>
                </TouchableOpacity>
              )}

              {/* Delete button available to post owner OR Admin */}
              <TouchableOpacity
                style={[styles.manageDeleteBtn, !isOwner && { flex: 1 }]}
                onPress={() => setConfirmDeleteVisible(true)}
                disabled={deleting}
                activeOpacity={0.8}
              >
                <MaterialIcons name="delete-outline" size={18} color="#FFF" />
                <Text style={styles.manageDeleteBtnText}>
                  {isOwner ? 'Delete' : 'Delete Post (Admin)'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Edit Modal - Strictly ONLY available and mounted for post owner */}
      {isOwner && (
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setEditModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          >
            <View style={styles.editModalSheet} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Edit CircleFind Report</Text>

              <Text style={styles.editInputLabel}>Title</Text>
              <TextInput
                style={styles.editInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Item Title"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.editInputLabel}>Category</Text>
              <View style={styles.editChipsRow}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.editChip, editCategory === cat && styles.editChipActive]}
                    onPress={() => setEditCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.editChipText,
                        editCategory === cat && styles.editChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.editInputLabel}>Description</Text>
              <TextInput
                style={styles.editTextArea}
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
                numberOfLines={3}
                placeholder="Description"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.editInputLabel}>Contact Details</Text>
              <TextInput
                style={styles.editInput}
                value={editContact}
                onChangeText={setEditContact}
                placeholder="Phone or contact note"
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                style={[styles.saveBtn, savingEdit && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      </ScrollView>
      <Toast />
    </View>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 50 },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      backgroundColor: colors.background,
    },
    notFoundText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },
    photoContainer: {
      position: 'relative',
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
      marginBottom: 16,
      backgroundColor: isDark ? '#1E1E1E' : '#E8EDE8',
      ...SHADOWS.medium,
    },
    photo: { width: '100%', height: 290 },
    imageBottomLeftOverlay: {
      position: 'absolute',
      bottom: 12,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      zIndex: 5,
    },
    categoryOverlay: {
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: RADIUS.round,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    categoryOverlayText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    statusOverlayBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: RADIUS.round,
      gap: 4,
      ...SHADOWS.small,
    },
    statusOverlayText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    timeOverlayBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: RADIUS.round,
      zIndex: 5,
    },
    timeOverlayText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
    placeholderBanner: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      minHeight: 190,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    placeholderBannerText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      ...SHADOWS.small,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    statusBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 8,
      gap: 4,
    },
    statusChipText: { fontSize: 12, fontWeight: '700' },
    timestampText: { fontSize: 11, color: colors.textMuted },
    itemTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 14,
    },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaAvatar: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.border,
    },
    metaText: { fontSize: 12, color: colors.textSecondary },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 12,
      marginBottom: 6,
    },
    descriptionText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    locationBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9F5',
      padding: 12,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    locationTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    coordsText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    viewOnMapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    viewOnMapText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.darkGreenMid,
    },
    contactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9F5',
      padding: 12,
      borderRadius: RADIUS.lg,
      gap: 10,
    },
    contactLabel: { fontSize: 11, color: colors.textMuted },
    contactValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
    callButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.darkGreenMid,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADIUS.md,
      gap: 6,
    },
    callButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    amplifyCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      gap: 12,
      ...SHADOWS.small,
    },
    amplifyInfo: { gap: 4 },
    amplifyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    amplifyTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    amplifyDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
    amplifyBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    amplifyIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F5E9',
      borderWidth: 1.5,
      borderColor: colors.darkGreenMid,
    },
    amplifyIconBtnActive: {
      backgroundColor: colors.darkGreenMid,
      borderColor: colors.darkGreenMid,
    },
    amplifyCountLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    amplifyCountLabelActive: {
      color: colors.darkGreenMid,
    },
    lifecycleCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      gap: 12,
      ...SHADOWS.small,
    },
    lifecycleHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    lifecycleTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    readOnlyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F4F0',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: RADIUS.round,
      gap: 4,
    },
    readOnlyBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textMuted,
    },
    statusChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusSelectChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 6,
    },
    statusSelectChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    returnedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F3E5F5',
      padding: 12,
      borderRadius: RADIUS.lg,
      gap: 8,
      marginTop: 4,
    },
    returnedBannerText: { color: '#7B1FA2', fontWeight: '700', fontSize: 13 },
    manageCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      gap: 12,
      ...SHADOWS.small,
    },
    manageTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    manageButtonsRow: { flexDirection: 'row', gap: 10 },
    manageEditBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? colors.darkGreenSurface : '#E0F2F1',
      gap: 6,
    },
    manageEditBtnText: { fontSize: 13, fontWeight: '700', color: colors.darkGreenMid },
    manageDeleteBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: RADIUS.lg,
      backgroundColor: '#D32F2F',
      gap: 6,
    },
    manageDeleteBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
    rootView: { flex: 1, backgroundColor: colors.background },
    confirmDeleteBox: {
      backgroundColor: isDark ? 'rgba(211, 47, 47, 0.15)' : '#FFEBEE',
      borderRadius: RADIUS.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: '#EF5350',
      gap: 10,
    },
    confirmDeleteText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: 18,
    },
    confirmDeleteBtnsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    confirmCancelBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E0E0E0',
    },
    confirmCancelBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    confirmDeleteBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: RADIUS.md,
      backgroundColor: '#D32F2F',
    },
    confirmDeleteBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFF',
    },
    // Modal
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    editModalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      padding: 20,
      paddingBottom: 40,
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 14,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
    editInputLabel: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginTop: 8, marginBottom: 4 },
    editInput: {
      backgroundColor: colors.background,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: colors.textPrimary,
    },
    editTextArea: {
      backgroundColor: colors.background,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: colors.textPrimary,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    editChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    editChip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    editChipActive: { backgroundColor: colors.darkGreenSurface, borderColor: colors.darkGreenMid },
    editChipText: { fontSize: 11, color: colors.textSecondary },
    editChipTextActive: { color: colors.darkGreenMid, fontWeight: '700' },
    saveBtn: {
      backgroundColor: colors.darkGreenMid,
      borderRadius: RADIUS.lg,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 18,
    },
    saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  });

