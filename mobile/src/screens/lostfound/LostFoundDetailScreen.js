import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  Modal,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
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
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { awardKarma } from '../../services/karmaService';
import { ROLES, isAdmin } from '../../constants/roles';
import { RADIUS, SHADOWS } from '../../constants/theme';

const CATEGORIES = ['Electronics', 'Documents', 'Pet', 'Bag', 'Jewelry', 'Other'];

const STAGES = [
  { key: 'lost', label: 'Reported Active' },
  { key: 'sighted', label: 'Sighted / Matched' },
  { key: 'reunited', label: 'Reunited / Returned' },
];

const KARMA_FOR_HELPING = 10;

function getStageIndex(status) {
  const index = STAGES.findIndex((stage) => stage.key === status);
  return index === -1 ? 0 : index;
}

export default function LostFoundDetailScreen({ route, navigation }) {
  const { reportId } = route.params;
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit Modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('lost');
  const [savingEdit, setSavingEdit] = useState(false);

  const isUserAdmin =
    userProfile?.role === ROLES.ADMIN_MODERATOR ||
    userProfile?.role === 'admin' ||
    userProfile?.isAdmin === true ||
    isAdmin(userProfile?.role);

  useEffect(() => {
    const reportRef = doc(db, 'reports', reportId);

    const unsubscribe = onSnapshot(reportRef, (docSnap) => {
      if (docSnap.exists()) {
        setReport({ id: docSnap.id, ...docSnap.data() });
      } else {
        setReport(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [reportId]);

  async function findHelperUid() {
    const matchQuery = query(
      collection(db, 'matches'),
      where('lostReportId', '==', reportId),
      limit(1)
    );
    const snapshot = await getDocs(matchQuery);
    if (snapshot.empty) return null;

    return snapshot.docs[0].data().foundReporterId || null;
  }

  async function handleMarkReunited() {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'reunited',
      });

      const helperUid = await findHelperUid();
      if (helperUid) {
        await awardKarma(helperUid, KARMA_FOR_HELPING);
      }
      Alert.alert('Reunited!', 'Thank you for updating the community!');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setUpdating(false);
    }
  }

  // Delete Report (Author of report OR Admin can delete any post)
  function handleDeleteReport() {
    if (!report) return;
    const isOwner = report.reportedBy === user?.uid;
    const canDelete = isOwner || isUserAdmin;
    if (!canDelete) return;

    const title = !isOwner && isUserAdmin ? 'Admin: Delete Report' : 'Delete Report';
    const message =
      !isOwner && isUserAdmin
        ? 'As an Admin / Moderator, you are about to permanently remove this report from the community feed. Continue?'
        : 'Are you sure you want to permanently delete your report? This action cannot be undone.';

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            await deleteDoc(doc(db, 'reports', reportId));
            Alert.alert('Deleted', 'Report has been permanently removed.', [
              {
                text: 'OK',
                onPress: () => navigation.goBack(),
              },
            ]);
          } catch (err) {
            Alert.alert('Error', err.message);
            setDeleting(false);
          }
        },
      },
    ]);
  }

  // Open Edit Modal
  function handleOpenEdit() {
    if (!report) return;
    setEditCategory(report.category || 'Other');
    setEditDescription(report.description || '');
    setEditStatus(report.status || report.type || 'lost');
    setEditModalVisible(true);
  }

  // Save Edits to Firestore
  async function handleSaveEdit() {
    if (!editDescription.trim()) {
      Alert.alert('Description Required', 'Please enter a description for your report.');
      return;
    }

    setSavingEdit(true);
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, {
        category: editCategory,
        description: editDescription.trim(),
        status: editStatus,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditModalVisible(false);
      Alert.alert('Success', 'Your report has been updated.');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  const styles = getStyles(colors, isDark);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.darkGreenMid} size="large" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
        <Text style={styles.notFoundText}>Report has been removed or does not exist.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Return to Feed</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentStageIndex = getStageIndex(report.status);
  const isOwner = report.reportedBy === user?.uid;
  const canDelete = isOwner || isUserAdmin;
  const alreadyReunited = report.status === 'reunited';
  const isLost = (report.type || 'lost') === 'lost';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Photo */}
      {report.photoUrl && (
        <View style={styles.photoContainer}>
          <Image source={{ uri: report.photoUrl }} style={styles.photo} resizeMode="cover" />
        </View>
      )}

      {/* Main Details Card */}
      <View style={styles.card}>
        <View style={styles.badgeRow}>
          <View style={styles.badgeRowLeft}>
            <View style={[styles.typeBadge, isLost ? styles.typeBadgeLost : styles.typeBadgeFound]}>
              <Ionicons
                name={isLost ? 'alert-circle' : 'checkmark-circle'}
                size={14}
                color={isLost ? '#E53935' : '#2E7D32'}
              />
              <Text style={[styles.typeBadgeText, isLost ? styles.typeBadgeTextLost : styles.typeBadgeTextFound]}>
                {isLost ? 'LOST REPORT' : 'FOUND REPORT'}
              </Text>
            </View>

            {alreadyReunited && (
              <View style={styles.reunitedChip}>
                <Text style={styles.reunitedChipText}>🎉 Reunited</Text>
              </View>
            )}
          </View>

          {/* Quick Header Actions: Edit & Delete */}
          <View style={styles.headerActionRow}>
            {isOwner && (
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={handleOpenEdit}
                accessibilityLabel="Edit Report"
              >
                <Ionicons name="pencil" size={16} color={colors.darkGreenMid} />
              </TouchableOpacity>
            )}

            {canDelete && (
              <TouchableOpacity
                style={[styles.iconActionBtn, styles.iconDeleteBtn]}
                onPress={handleDeleteReport}
                disabled={deleting}
                accessibilityLabel={!isOwner && isUserAdmin ? 'Admin Delete Report' : 'Delete Report'}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#D32F2F" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#D32F2F" />
                    {!isOwner && isUserAdmin && (
                      <View style={styles.adminMiniBadge}>
                        <Text style={styles.adminMiniBadgeText}>Admin</Text>
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.categoryTitle}>{report.category || 'General Item'}</Text>
        <Text style={styles.description}>{report.description || 'No description provided.'}</Text>

        {report.confidenceScore > 0 && (
          <View style={styles.verifiedRow}>
            <Ionicons name="thumbs-up" size={14} color={colors.darkGreenMid} />
            <Text style={styles.verifiedText}>
              Verified by {report.confidenceScore} community member{report.confidenceScore > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Progress Timeline Card */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Reunion Progress</Text>
        <View style={styles.timeline}>
          {STAGES.map((stage, index) => {
            const isCompleted = index <= currentStageIndex;
            const isCurrent = index === currentStageIndex;

            return (
              <View key={stage.key} style={styles.timelineRow}>
                <View style={styles.timelineIndicatorColumn}>
                  <View
                    style={[
                      styles.timelineDot,
                      isCompleted && styles.timelineDotCompleted,
                      isCurrent && styles.timelineDotCurrent,
                    ]}
                  >
                    {isCompleted && <Ionicons name="checkmark" size={10} color="#FFF" />}
                  </View>
                  {index < STAGES.length - 1 && (
                    <View
                      style={[
                        styles.timelineLine,
                        index < currentStageIndex && styles.timelineLineCompleted,
                      ]}
                    />
                  )}
                </View>
                <View style={styles.timelineLabelBox}>
                  <Text
                    style={[
                      styles.timelineLabel,
                      isCurrent && styles.timelineLabelCurrent,
                    ]}
                  >
                    {stage.label}
                  </Text>
                  {isCurrent && (
                    <Text style={styles.timelineSubCurrent}>Current Stage</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Mark Reunited Action */}
      {isOwner && !alreadyReunited && (
        <TouchableOpacity
          style={styles.reunitedButton}
          onPress={handleMarkReunited}
          disabled={updating}
          activeOpacity={0.85}
        >
          {updating ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.reunitedButtonText}>✓ Mark as Reunited / Returned</Text>
          )}
        </TouchableOpacity>
      )}

      {alreadyReunited && (
        <View style={styles.reunitedBanner}>
          <Text style={styles.reunitedBannerText}>🎉 This item has been reunited!</Text>
        </View>
      )}

      {/* Management Card for Owner / Admin */}
      {(isOwner || isUserAdmin) && (
        <View style={styles.manageCard}>
          <Text style={styles.manageTitle}>
            {isOwner ? 'Manage Your Post' : 'Admin Moderation'}
          </Text>

          <View style={styles.manageButtonsRow}>
            {isOwner && (
              <TouchableOpacity
                style={styles.manageEditBtn}
                onPress={handleOpenEdit}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={16} color={colors.darkGreenMid} />
                <Text style={styles.manageEditBtnText}>Edit Details</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.manageDeleteBtn, !isOwner && { flex: 1 }]}
              onPress={handleDeleteReport}
              disabled={deleting}
              activeOpacity={0.8}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#FFF" />
                  <Text style={styles.manageDeleteBtnText}>
                    {isOwner ? 'Delete Post' : 'Delete Post (Admin)'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Edit Report Modal */}
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
            <Text style={styles.modalSheetTitle}>Edit Report Details</Text>

            {/* Category */}
            <Text style={styles.editInputLabel}>Category</Text>
            <View style={styles.editChipsRow}>
              {CATEGORIES.map((cat) => {
                const isSelected = editCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.editChip, isSelected && styles.editChipActive]}
                    onPress={() => setEditCategory(cat)}
                  >
                    <Text style={[styles.editChipText, isSelected && styles.editChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Status */}
            <Text style={styles.editInputLabel}>Status</Text>
            <View style={styles.editChipsRow}>
              {[
                { key: report?.type || 'lost', label: report?.type === 'found' ? 'Found (Active)' : 'Lost (Active)' },
                { key: 'sighted', label: '👀 Sighted' },
                { key: 'reunited', label: '🎉 Reunited' },
              ].map((st) => {
                const isSelected = editStatus === st.key;
                return (
                  <TouchableOpacity
                    key={st.key}
                    style={[styles.editChip, isSelected && styles.editChipActive]}
                    onPress={() => setEditStatus(st.key)}
                  >
                    <Text style={[styles.editChipText, isSelected && styles.editChipTextActive]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Description */}
            <Text style={styles.editInputLabel}>Description</Text>
            <TextInput
              style={styles.editTextArea}
              placeholder="Update description..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              value={editDescription}
              onChangeText={setEditDescription}
            />

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
              style={styles.editCancelBtn}
              onPress={() => setEditModalVisible(false)}
            >
              <Text style={styles.editCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 40 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 },
    notFoundText: { color: colors.textSecondary, fontSize: 15, marginTop: 12, textAlign: 'center' },
    backButton: {
      marginTop: 18,
      backgroundColor: colors.darkGreenMid,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: RADIUS.lg,
    },
    backButtonText: { color: '#FFF', fontWeight: 'bold' },
    photoContainer: {
      width: '100%',
      height: 220,
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.medium,
    },
    photo: { width: '100%', height: '100%' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      padding: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.small,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    badgeRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconActionBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F4F0',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    iconDeleteBtn: {
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
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 12,
      gap: 5,
    },
    typeBadgeLost: {
      backgroundColor: isDark ? 'rgba(229, 57, 53, 0.22)' : '#FFEBEE',
    },
    typeBadgeFound: {
      backgroundColor: isDark ? 'rgba(46, 125, 50, 0.22)' : '#E8F5E9',
    },
    typeBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    typeBadgeTextLost: { color: '#E53935' },
    typeBadgeTextFound: { color: '#2E7D32' },
    reunitedChip: {
      backgroundColor: isDark ? 'rgba(123, 31, 162, 0.22)' : '#F3E5F5',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    reunitedChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#7B1FA2',
    },
    categoryTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: 12,
    },
    verifiedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    verifiedText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.darkGreenMid,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 14,
    },
    timeline: { paddingLeft: 4 },
    timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
    timelineIndicatorColumn: { alignItems: 'center', width: 24 },
    timelineDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.borderDark,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timelineDotCompleted: {
      borderColor: colors.darkGreenMid,
      backgroundColor: colors.darkGreenMid,
    },
    timelineDotCurrent: {
      borderColor: colors.darkGreenLight,
      backgroundColor: colors.darkGreenLight,
    },
    timelineLine: {
      width: 2,
      flex: 1,
      minHeight: 32,
      backgroundColor: colors.border,
    },
    timelineLineCompleted: { backgroundColor: colors.darkGreenMid },
    timelineLabelBox: {
      marginLeft: 12,
      marginBottom: 24,
    },
    timelineLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    timelineLabelCurrent: {
      color: colors.darkGreenMid,
      fontWeight: '700',
    },
    timelineSubCurrent: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    reunitedButton: {
      backgroundColor: colors.darkGreenMid,
      borderRadius: RADIUS.lg,
      paddingVertical: 14,
      alignItems: 'center',
      ...SHADOWS.medium,
      marginBottom: 16,
    },
    reunitedButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
    reunitedBanner: {
      backgroundColor: isDark ? 'rgba(46, 125, 50, 0.22)' : '#E8F5E9',
      borderRadius: RADIUS.lg,
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.safeGreen,
      marginBottom: 16,
    },
    reunitedBannerText: { color: colors.safeGreen, fontWeight: 'bold', fontSize: 14 },
    manageCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      ...SHADOWS.small,
    },
    manageTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    manageButtonsRow: {
      flexDirection: 'row',
      gap: 10,
    },
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
    manageEditBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.darkGreenMid,
    },
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
    manageDeleteBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFF',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'flex-end',
    },
    editModalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 34,
      maxHeight: '90%',
    },
    modalHandle: {
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.borderDark,
      alignSelf: 'center',
      marginBottom: 16,
    },
    modalSheetTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
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
    editCancelBtn: {
      marginTop: 8,
      paddingVertical: 12,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFE9',
      alignItems: 'center',
    },
    editCancelBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
  });
