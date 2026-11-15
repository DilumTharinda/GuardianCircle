import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
  Image,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  subscribeUserCircles,
  subscribePendingInvites,
  getCircleById,
  createTrustedCircle,
  deleteCircle,
  leaveCircle,
  removeCircleMember,
  acceptCircleInvitation,
  declineCircleInvitation,
  updateCircleDetails,
} from '../../services/trustedCircleGroupService';
import { uploadImageToCloudinary } from '../../services/imageUploadService';
import CircleInviteModal from '../../components/trusted/CircleInviteModal';
import ThemeToggle from '../../components/ThemeToggle';
import { ROUTES } from '../../constants/routes';
import { scale, verticalScale, normalize } from '../../utils/responsive';

export default function TrustedCircleScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [circles, setCircles] = useState([]);
  const [selectedCircleId, setSelectedCircleId] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'detail'
  const [loading, setLoading] = useState(true);

  // Pending invites for the current user
  const [pendingInvites, setPendingInvites] = useState([]);
  const [acceptingInviteId, setAcceptingInviteId] = useState(null);
  const [targetPendingCircle, setTargetPendingCircle] = useState(null);

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [circleNameInput, setCircleNameInput] = useState('');
  const [creating, setCreating] = useState(false);

  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  // Circle Edit (Rename & Photo) State
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const activeCircle = circles.find((c) => c.id === selectedCircleId) || circles[0];
  const isAdmin = activeCircle?.createdBy === user?.uid || (activeCircle?.adminUids || []).includes(user?.uid);

  // Configure navigation header options
  useEffect(() => {
    navigation.setOptions({
      headerTitleAlign: 'left',
      headerTitle: () => (
        <Text
          style={{
            color: '#FFF',
            fontWeight: 'bold',
            fontSize: 18,
            maxWidth: 150,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {viewMode === 'detail' && activeCircle ? activeCircle.name : 'Trusted Circle'}
        </Text>
      ),
      headerLeft:
        viewMode === 'detail'
          ? () => (
              <TouchableOpacity
                onPress={() => setViewMode('list')}
                style={{ marginLeft: 14, padding: 4 }}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
            )
          : undefined,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
          {/* + New Circle Button */}
          <TouchableOpacity
            onPress={() => setCreateModalVisible(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 16,
              marginRight: 8,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.35)',
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color="#FFF" style={{ marginRight: 2 }} />
            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>New</Text>
          </TouchableOpacity>

          {/* Theme Toggle Button */}
          <ThemeToggle iconColor="#fff" />
        </View>
      ),
    });
  }, [navigation, viewMode, activeCircle?.name]);

  // 1. Subscribe to User's Trusted Circles in real time
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeUserCircles(user.uid, (list) => {
      setCircles(list);
      setLoading(false);
      // Auto-select circle if coming from params or first circle if none selected
      const paramCircleId = route?.params?.circleId;
      if (paramCircleId && list.some((c) => c.id === paramCircleId)) {
        setSelectedCircleId(paramCircleId);
      } else if (list.length > 0 && !selectedCircleId) {
        setSelectedCircleId(list[0].id);
      } else if (list.length > 0 && !list.some((c) => c.id === selectedCircleId)) {
        setSelectedCircleId(list[0].id);
      }
    });

    return () => unsub?.();
  }, [user?.uid, route?.params?.circleId]);

  // 2. Subscribe to Pending Invitations for this user
  useEffect(() => {
    if (!user) return;
    const unsub = subscribePendingInvites(user, (invites) => {
      setPendingInvites(invites);
    });
    return () => unsub?.();
  }, [user]);

  // 3. Inspect route.params when navigating from a notification
  useEffect(() => {
    const paramCircleId = route?.params?.circleId;
    if (paramCircleId && user) {
      // Check if user is already a member
      const isAlreadyMember = circles.some(
        (c) =>
          c.id === paramCircleId &&
          (c.memberUids?.includes(user.uid) || c.createdBy === user.uid)
      );
      if (!isAlreadyMember) {
        // Fetch target circle metadata so the user can see invitation banner immediately
        getCircleById(paramCircleId)
          .then((c) => {
            if (c) {
              const userInTarget =
                (c.memberUids || []).includes(user.uid) || c.createdBy === user.uid;
              if (!userInTarget) {
                setTargetPendingCircle({
                  circleId: paramCircleId,
                  circleName: c.name || route?.params?.circleName || 'Trusted Circle',
                  inviteId: route?.params?.inviteId,
                  createdByName: c.createdByName || 'Admin',
                });
              } else {
                setSelectedCircleId(paramCircleId);
              }
            }
          })
          .catch(() => {});
      } else {
        setSelectedCircleId(paramCircleId);
      }
    }
  }, [route?.params?.circleId, circles, user]);

  const handleAcceptInvite = async (inv) => {
    if (!user) return;
    const invId = inv.inviteId || route?.params?.inviteId;
    setAcceptingInviteId(inv.circleId);
    try {
      await acceptCircleInvitation(inv.circleId, invId, user);
      setSelectedCircleId(inv.circleId);
      setTargetPendingCircle(null);
      alertOrPrompt('Joined!', `You are now a member of "${inv.circleName}".`);
    } catch (e) {
      alertOrPrompt('Error', e.message || 'Failed to accept invitation.');
    } finally {
      setAcceptingInviteId(null);
    }
  };

  const handleDeclineInvite = async (inv) => {
    const invId = inv.inviteId || route?.params?.inviteId;
    try {
      await declineCircleInvitation(inv.circleId, invId, user?.email);
      setPendingInvites((prev) => prev.filter((p) => p.circleId !== inv.circleId));
      if (targetPendingCircle?.circleId === inv.circleId) {
        setTargetPendingCircle(null);
      }
    } catch (e) {
      alertOrPrompt('Error', e.message || 'Failed to decline invitation.');
    }
  };

  // Handle Create Circle
  const handleCreateCircle = async () => {
    if (!circleNameInput.trim()) {
      alertOrPrompt('Required', 'Please enter a name for your Trusted Circle.');
      return;
    }
    setCreating(true);
    try {
      const newCircle = await createTrustedCircle(
        {
          uid: user.uid,
          displayName: userProfile?.displayName || user.displayName || 'Primary User',
          email: user.email,
          username: userProfile?.username,
          photoURL: user.photoURL,
        },
        circleNameInput.trim()
      );
      setCreateModalVisible(false);
      setCircleNameInput('');
      setSelectedCircleId(newCircle.id);
      alertOrPrompt('Success', `Trusted Circle "${newCircle.name}" created!`);
    } catch (e) {
      alertOrPrompt('Error', e.message || 'Failed to create circle.');
    } finally {
      setCreating(false);
    }
  };

  // Handle Delete Circle
  const handleDeleteCircle = (circle) => {
    confirmAction(
      'Delete Trusted Circle?',
      `Are you sure you want to permanently delete "${circle.name}"? All members will be unlinked.`,
      async () => {
        try {
          await deleteCircle(circle.id, user.uid);
          setViewMode('list');
          alertOrPrompt('Deleted', `"${circle.name}" has been deleted.`);
        } catch (e) {
          alertOrPrompt('Error', e.message);
        }
      }
    );
  };

  // Handle Leave Circle
  const handleLeaveCircle = (circle) => {
    confirmAction(
      'Leave Circle?',
      `Are you sure you want to leave "${circle.name}"? You will no longer receive their alerts or live locations.`,
      async () => {
        try {
          await leaveCircle(circle.id, user.uid);
          setViewMode('list');
          alertOrPrompt('Left Circle', `You have left "${circle.name}".`);
        } catch (e) {
          alertOrPrompt('Error', e.message);
        }
      }
    );
  };

  // Handle Remove Member
  const handleRemoveMember = (member) => {
    confirmAction(
      'Remove Member?',
      `Remove ${member.displayName || 'member'} from "${activeCircle?.name}"?`,
      async () => {
        try {
          await removeCircleMember(activeCircle.id, member.uid, user.uid);
          alertOrPrompt('Removed', `${member.displayName} removed from circle.`);
        } catch (e) {
          alertOrPrompt('Error', e.message);
        }
      }
    );
  };

  // Handle Rename Circle
  const handleRenameCircle = async () => {
    if (!renameInput.trim()) {
      alertOrPrompt('Required', 'Please enter a valid circle name.');
      return;
    }
    if (!activeCircle) return;
    setRenaming(true);
    try {
      await updateCircleDetails(activeCircle.id, { name: renameInput.trim() }, user.uid);
      setRenameModalVisible(false);
      alertOrPrompt('Success', `Circle renamed to "${renameInput.trim()}".`);
    } catch (e) {
      alertOrPrompt('Error', e.message || 'Failed to rename circle.');
    } finally {
      setRenaming(false);
    }
  };

  // Handle Pick and Crop / Resize Circle Group Image
  const handlePickCircleImage = async () => {
    if (!activeCircle) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true, // Enables native crop / resize UI
        aspect: [1, 1], // Square 1:1 crop for circle group avatar
        quality: 0.75,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const localUri = result.assets[0].uri;
        setUploadingImage(true);
        const remoteUrl = await uploadImageToCloudinary(localUri);
        await updateCircleDetails(activeCircle.id, { photoURL: remoteUrl }, user.uid);
        alertOrPrompt('Success', 'Circle group image updated successfully!');
      }
    } catch (e) {
      alertOrPrompt('Upload Error', e.message || 'Failed to upload group image.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Helper for cross-platform confirmation
  const confirmAction = (title, message, onConfirm) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  const alertOrPrompt = (title, msg) => {
    if (Platform.OS === 'web') window.alert(`${title}: ${msg}`);
    else Alert.alert(title, msg);
  };

  // Navigate to live map tracking for this circle
  const handleTrackCircleOnMap = () => {
    if (!activeCircle) return;
    navigation.navigate('Main', {
      screen: ROUTES.MAP,
      params: {
        selectedCircleId: activeCircle.id,
        selectedCircleName: activeCircle.name,
        memberUids: activeCircle.memberUids || [],
      },
    });
  };

  // Merge pending invites with any targeted invitation from route params, strictly ignoring circles the user created or is already a member of
  const allPending = (Array.isArray(pendingInvites) ? pendingInvites : []).filter(
    (inv) => {
      if (!inv || (!inv.circleId && !inv.inviteId)) return false;
      const alreadyInCircle = circles.some(
        (c) =>
          c.id === inv.circleId &&
          (c.createdBy === user?.uid || (c.memberUids || []).includes(user?.uid))
      );
      return !alreadyInCircle;
    }
  );

  const isUserTargetInCircle =
    targetPendingCircle?.circleId &&
    circles.some(
      (c) =>
        c.id === targetPendingCircle.circleId &&
        (c.createdBy === user?.uid || (c.memberUids || []).includes(user?.uid))
    );

  if (
    targetPendingCircle &&
    targetPendingCircle.circleId &&
    !isUserTargetInCircle &&
    !allPending.some((p) => p.circleId === targetPendingCircle.circleId)
  ) {
    allPending.unshift(targetPendingCircle);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background || '#F8F9FA' }]}>
      {/* Pending Invitations Banner / Section */}
      {allPending.length > 0 && (
        <View style={styles.pendingSection}>
          {allPending.map((inv, index) => {
            if (!inv) return null;
            const itemKey = inv.circleId || inv.inviteId || `pending-inv-${index}`;
            const circleDisplayName = inv.circleName || 'Trusted Circle';
            const senderDisplayName = inv.createdByName || inv.invitedByName || 'Circle Admin';
            return (
              <View
                key={itemKey}
                style={[styles.pendingCard, { backgroundColor: colors.surface || colors.card || '#FFF' }]}
              >
                <View style={[styles.pendingIconWrap, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}>
                  <Ionicons name="mail-unread" size={24} color={isDark ? colors.darkGreenLight || '#0A9B8D' : '#00897B'} />
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={[styles.pendingTitle, { color: colors.textPrimary }]}>
                    Invitation to join "{circleDisplayName}"
                  </Text>
                  <Text style={[styles.pendingSub, { color: colors.textSecondary }]}>
                    Invited by {senderDisplayName}
                  </Text>
                </View>
                <View style={styles.pendingActions}>
                  <TouchableOpacity
                    style={[
                      styles.acceptBtn,
                      acceptingInviteId === inv.circleId && { opacity: 0.7 },
                    ]}
                    disabled={acceptingInviteId === inv.circleId}
                    onPress={() => handleAcceptInvite(inv)}
                    activeOpacity={0.8}
                  >
                    {acceptingInviteId === inv.circleId ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.declineBtn, { backgroundColor: isDark ? '#3D1A1A' : '#FFEBEE' }]}
                    disabled={acceptingInviteId === inv.circleId}
                    onPress={() => handleDeclineInvite(inv)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.declineBtnText, { color: isDark ? '#EF5350' : '#D32F2F' }]}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {loading ? (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color="#00897B" />
          <Text style={{ marginTop: 12, color: colors.textSecondary }}>Loading your circles...</Text>
        </View>
      ) : circles.length === 0 ? (
        /* Empty State */
        <View style={styles.emptyCard}>
          <View style={[styles.shieldIconBig, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}>
            <MaterialIcons name="groups" size={48} color={isDark ? colors.darkGreenLight || '#0A9B8D' : '#00897B'} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Trusted Circles Yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Create your first circle to invite friends, family, or travel companions. Track each other live on
            the map and dispatch prioritized SOS alerts directly to their phones.
          </Text>
          <TouchableOpacity
            style={styles.createFirstBtn}
            onPress={() => setCreateModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="shield-checkmark" size={18} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.createFirstText}>Create Trusted Circle</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'list' ? (
        /* WhatsApp-Style Circles/Groups List */
        <ScrollView
          contentContainerStyle={[
            styles.whatsappListContent,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {circles.map((circle) => {
            const isUserAdmin = circle.createdBy === user?.uid || (circle.adminUids || []).includes(user?.uid);
            const members = circle.members || [];
            const memberCount = members.length || (circle.memberUids || []).length || 1;
            
            // Build WhatsApp-like member preview subtitle (e.g. "You, John, Sarah")
            let previewText = '';
            if (members.length > 0) {
              const names = members.map((m) =>
                m.uid === user?.uid ? 'You' : m.displayName || m.username || 'Member'
              );
              // Put 'You' first if in list
              if (names.includes('You')) {
                names.splice(names.indexOf('You'), 1);
                names.unshift('You');
              }
              previewText = names.slice(0, 4).join(', ');
              if (names.length > 4) {
                previewText += ` +${names.length - 4} more`;
              }
            } else if (circle.createdByName) {
              previewText = `Created by ${circle.createdByName}`;
            } else {
              previewText = `${memberCount} member${memberCount > 1 ? 's' : ''}`;
            }

            return (
              <TouchableOpacity
                key={circle.id}
                style={[
                  styles.waItemRow,
                  {
                    backgroundColor: colors.surface || colors.card || '#FFFFFF',
                    borderBottomColor: colors.border || '#2A3D2A',
                  },
                ]}
                onPress={() => {
                  setSelectedCircleId(circle.id);
                  setViewMode('detail');
                }}
                activeOpacity={0.7}
              >
                {/* WhatsApp Group Avatar Icon */}
                {circle.photoURL ? (
                  <Image source={{ uri: circle.photoURL }} style={styles.waAvatarImg} />
                ) : (
                  <View style={[styles.waAvatarContainer, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}>
                    <MaterialIcons name="groups" size={28} color={isDark ? colors.darkGreenLight || '#0A9B8D' : '#00897B'} />
                  </View>
                )}

                {/* Main Content Area */}
                <View style={styles.waDetailsCol}>
                  <View style={styles.waTopRow}>
                    <Text
                      style={[styles.waCircleName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {circle.name}
                    </Text>
                    
                    {/* Admin Tag or Member Pill */}
                    {isUserAdmin ? (
                      <View style={[styles.waAdminBadge, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}>
                        <Text style={[styles.waAdminBadgeText, { color: isDark ? colors.accentGreen || '#00E676' : '#00796B' }]}>Admin</Text>
                      </View>
                    ) : (
                      <Text style={[styles.waMemberCountText, { color: colors.textSecondary }]}>
                        {memberCount} member{memberCount > 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>

                  <View style={styles.waBottomRow}>
                    <Text
                      style={[styles.waSubtitle, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {previewText}
                    </Text>

                    {/* Quick Action Buttons */}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {/* Chat in Circle Button */}
                      <TouchableOpacity
                        style={[styles.waQuickChatBtn, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}
                        onPress={(e) => {
                          e.stopPropagation();
                          navigation.navigate(ROUTES.CIRCLE_CHAT, {
                            circleId: circle.id,
                            circleName: circle.name,
                            circlePhotoURL: circle.photoURL || null,
                            members: circle.members || [],
                          });
                        }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="chatbubble-ellipses" size={17} color={isDark ? colors.darkGreenLight || '#0A9B8D' : '#00897B'} />
                      </TouchableOpacity>

                      {/* Quick Track on Map Icon Button */}
                      <TouchableOpacity
                        style={[styles.waQuickMapBtn, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}
                        onPress={(e) => {
                          e.stopPropagation();
                          navigation.navigate('Main', {
                            screen: ROUTES.MAP,
                            params: {
                              selectedCircleId: circle.id,
                              selectedCircleName: circle.name,
                              memberUids: circle.memberUids || [],
                            },
                          });
                        }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="location-sharp" size={17} color={isDark ? colors.darkGreenLight || '#0A9B8D' : '#00897B'} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        /* Detailed Circle Management View (Selected Circle) */
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          {activeCircle && (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface || '#1A2420' : '#FFFFFF',
                  borderColor: isDark ? colors.border || '#2A3D2A' : '#E0E8E0',
                  borderWidth: 1,
                },
              ]}
            >
              {/* Card Header & Admin Status */}
              <View style={styles.cardHeader}>
                {/* Circle Avatar (Tap to change group image if admin) */}
                <TouchableOpacity
                  style={styles.circlePhotoWrapper}
                  onPress={isAdmin ? handlePickCircleImage : undefined}
                  disabled={!isAdmin || uploadingImage}
                  activeOpacity={0.8}
                >
                  {uploadingImage ? (
                    <View style={[styles.circlePhotoDefault, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}>
                      <ActivityIndicator size="small" color="#00897B" />
                    </View>
                  ) : activeCircle.photoURL ? (
                    <Image source={{ uri: activeCircle.photoURL }} style={styles.circlePhotoImg} />
                  ) : (
                    <View style={[styles.circlePhotoDefault, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}>
                      <MaterialIcons name="groups" size={32} color={isDark ? colors.darkGreenLight || '#0A9B8D' : '#00897B'} />
                    </View>
                  )}
                  {isAdmin && (
                    <View style={styles.cameraPill}>
                      <Ionicons name="camera" size={12} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>

                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                      {activeCircle.name}
                    </Text>
                    {isAdmin && (
                      <TouchableOpacity
                        style={[styles.renamePencilBtn, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}
                        onPress={() => {
                          setRenameInput(activeCircle.name || '');
                          setRenameModalVisible(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="pencil" size={15} color={isDark ? colors.darkGreenLight || '#0A9B8D' : '#00897B'} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.cardSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {isAdmin ? 'You are the Circle Admin' : `Created by ${activeCircle.createdByName || 'Admin'}`} •{' '}
                    {(activeCircle.members || []).length} Member{(activeCircle.members || []).length > 1 ? 's' : ''}
                  </Text>
                </View>

                {isAdmin ? (
                  <TouchableOpacity
                    style={[styles.deleteCircleBtn, { backgroundColor: isDark ? '#3D1A1A' : '#FFEBEE' }]}
                    onPress={() => handleDeleteCircle(activeCircle)}
                  >
                    <Ionicons name="trash-outline" size={18} color={isDark ? '#EF5350' : '#D32F2F'} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.leaveCircleBtn, { backgroundColor: isDark ? '#3D2614' : '#FFF3E0' }]}
                    onPress={() => handleLeaveCircle(activeCircle)}
                  >
                    <Ionicons name="exit-outline" size={18} color={isDark ? '#FFA726' : '#E65100'} />
                    <Text style={[styles.leaveText, { color: isDark ? '#FFA726' : '#E65100' }]}>Leave</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Action Buttons Row: View on Map, Chat & Invite Member */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionBtnItem}
                  onPress={handleTrackCircleOnMap}
                  activeOpacity={0.85}
                >
                  <View style={[styles.actionBtnIconCircle, { backgroundColor: isDark ? '#004D40' : '#E0F2F1' }]}>
                    <Ionicons name="map" size={18} color={isDark ? colors.accentGreen || '#00E676' : '#00796B'} />
                  </View>
                  <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                    Live Map
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtnItem}
                  onPress={() => {
                    navigation.navigate(ROUTES.CIRCLE_CHAT, {
                      circleId: activeCircle.id,
                      circleName: activeCircle.name,
                      circlePhotoURL: activeCircle.photoURL || null,
                      members: activeCircle.members || [],
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[styles.actionBtnIconCircle, { backgroundColor: isDark ? '#0D47A1' : '#E1F5FE' }]}>
                    <Ionicons name="chatbubbles" size={18} color={isDark ? '#42A5F5' : '#0288D1'} />
                  </View>
                  <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                    Chat
                  </Text>
                </TouchableOpacity>

                {isAdmin && (
                  <TouchableOpacity
                    style={styles.actionBtnItem}
                    onPress={() => setInviteModalVisible(true)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.actionBtnIconCircle, { backgroundColor: isDark ? '#1B5E20' : '#E8F5E9' }]}>
                      <Ionicons name="person-add" size={18} color={isDark ? '#69F0AE' : '#2E7D32'} />
                    </View>
                    <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                      Invite
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Members List Section */}
              <View style={styles.membersSection}>
                <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                  Circle Members
                </Text>

                {(() => {
                  // Ensure members list is deduplicated by UID
                  const uniqueMemberList = [];
                  const seenUids = new Set();
                  (activeCircle.members || []).forEach((m) => {
                    if (m && m.uid && !seenUids.has(m.uid)) {
                      seenUids.add(m.uid);
                      uniqueMemberList.push(m);
                    }
                  });

                  return uniqueMemberList.map((member, mIdx) => {
                    const isMe = member.uid === user?.uid;
                    const isMemberAdmin =
                      member.role === 'admin' || member.uid === activeCircle.createdBy;

                    const memberPhoto =
                      (isMe ? userProfile?.photoURL || user?.photoURL : null) ||
                      member.photoURL;

                    return (
                      <View
                        key={member.uid ? `member-${member.uid}` : `member-idx-${mIdx}`}
                        style={[
                          styles.memberItem,
                          { borderBottomColor: colors.border || '#2A3D2A' },
                        ]}
                      >
                        {memberPhoto ? (
                          <Image source={{ uri: memberPhoto }} style={styles.avatarImage} />
                        ) : (
                          <View style={[styles.avatar, { backgroundColor: isDark ? colors.darkGreenMid || '#06756A' : '#00897B' }]}>
                            <Text style={styles.avatarText}>
                              {(member.displayName || 'U')[0].toUpperCase()}
                            </Text>
                          </View>
                        )}

                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                              {member.displayName}
                            </Text>
                            {isMe && (
                              <Text style={[styles.youTag, { color: colors.textSecondary }]}>
                                {' '}
                                (You)
                              </Text>
                            )}
                          </View>
                          <Text style={[styles.memberSub, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                            {member.username ? `@${member.username}` : member.email}
                          </Text>
                        </View>

                        {isMemberAdmin ? (
                          <View style={[styles.adminBadge, { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' }]}>
                            <Text style={[styles.adminBadgeText, { color: isDark ? colors.accentGreen || '#00E676' : '#00796B' }]}>Admin</Text>
                          </View>
                        ) : (
                          isAdmin &&
                          !isMe && (
                            <TouchableOpacity
                              style={[styles.removeBtn, { backgroundColor: isDark ? '#3D1A1A' : '#FFEBEE' }]}
                              onPress={() => handleRemoveMember(member)}
                            >
                              <Ionicons name="close" size={16} color={isDark ? '#EF5350' : '#D32F2F'} />
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    );
                  });
                })()}
              </View>

              {/* Pending Invitations Section (Admin Only) */}
              {isAdmin && (activeCircle.pendingInvites || []).length > 0 && (
                <View style={[styles.circlePendingSection, { borderTopColor: colors.border || '#2A3D2A' }]}>
                  <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                    Pending Invitations ({(activeCircle.pendingInvites || []).length})
                  </Text>
                  {(activeCircle.pendingInvites || []).map((invite, idx) => {
                    const rowKey = invite.inviteId ? `pending-invite-${invite.inviteId}` : `pending-row-${idx}`;
                    return (
                      <View key={rowKey} style={styles.pendingRow}>
                        <Ionicons name="time-outline" size={16} color="#E65100" style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pendingName, { color: colors.textPrimary }]}>
                            {invite.toUsername ? `@${invite.toUsername}` : invite.toEmail}
                          </Text>
                          <Text style={[styles.pendingType, { color: colors.textSecondary }]}>
                            Sent via {invite.type === 'email' ? 'Email' : 'In-App'} • Awaiting acceptance
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Create Circle Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.dialogCard, { backgroundColor: colors.surface || colors.card || '#FFFFFF' }]}>
            <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>Create Trusted Circle</Text>
            <Text style={[styles.dialogSub, { color: colors.textSecondary }]}>
              Give your new circle a recognizable name (e.g. "Family", "Close Friends", "Office Team").
            </Text>

            <TextInput
              style={[
                styles.dialogInput,
                { color: colors.textPrimary, borderColor: colors.border || '#DDD' },
              ]}
              placeholder="e.g. Campus Travel Circle"
              placeholderTextColor="#999"
              value={circleNameInput}
              onChangeText={setCircleNameInput}
              autoFocus
            />

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setCreateModalVisible(false)}
                disabled={creating}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, creating && { opacity: 0.6 }]}
                onPress={handleCreateCircle}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Create Circle</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Circle Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.dialogCard, { backgroundColor: colors.surface || colors.card || '#FFFFFF' }]}>
            <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>Rename Trusted Circle</Text>
            <Text style={[styles.dialogSub, { color: colors.textSecondary }]}>
              Enter a new name for "{activeCircle?.name}".
            </Text>

            <TextInput
              style={[
                styles.dialogInput,
                { color: colors.textPrimary, borderColor: colors.border || '#DDD' },
              ]}
              placeholder="Circle name"
              placeholderTextColor="#999"
              value={renameInput}
              onChangeText={setRenameInput}
              autoFocus
            />

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRenameModalVisible(false)}
                disabled={renaming}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, renaming && { opacity: 0.6 }]}
                onPress={handleRenameCircle}
                disabled={renaming}
              >
                {renaming ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Member Modal */}
      {activeCircle && (
        <CircleInviteModal
          visible={inviteModalVisible}
          circle={activeCircle}
          currentUser={user}
          onClose={() => setInviteModalVisible(false)}
          onInviteSuccess={() => {}}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 1,
  },
  newCircleBtn: {
    backgroundColor: '#00897B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newCircleText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  loaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  shieldIconBig: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  createFirstBtn: {
    backgroundColor: '#00897B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    elevation: 2,
  },
  createFirstText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  scrollContent: {
    padding: 16,
  },
  whatsappListContent: {
    paddingVertical: 8,
  },
  waItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.8,
  },
  waAvatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  waAvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 14,
    backgroundColor: '#E0E0E0',
  },
  waDetailsCol: {
    flex: 1,
    justifyContent: 'center',
  },
  waTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  waCircleName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  waMemberCountText: {
    fontSize: 12,
  },
  waAdminBadge: {
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  waAdminBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#00796B',
  },
  waBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waSubtitle: {
    fontSize: 13,
    flex: 1,
    marginRight: 10,
  },
  waQuickChatBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  waQuickMapBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backToListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  backToListHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#00897B',
    marginLeft: 6,
  },
  tabsScroll: {
    marginBottom: 14,
  },
  circleTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 10,
  },
  circleTabText: {
    fontWeight: '700',
    fontSize: 14,
  },
  adminMiniBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  adminMiniText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  card: {
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  circlePhotoWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  circlePhotoImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E0E0E0',
  },
  circlePhotoDefault: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraPill: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#00897B',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  renamePencilBtn: {
    marginLeft: 8,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#E0F2F1',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteCircleBtn: {
    padding: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
  },
  leaveCircleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
  },
  leaveText: {
    fontSize: 12,
    color: '#E65100',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: verticalScale(20),
    paddingVertical: verticalScale(6),
  },
  actionBtnItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  actionBtnIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionBtnLabel: {
    fontSize: normalize(12),
    fontWeight: '600',
    textAlign: 'center',
  },
  membersSection: {
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00897B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
  },
  youTag: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  memberSub: {
    fontSize: 12,
    marginTop: 2,
  },
  adminBadge: {
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adminBadgeText: {
    color: '#00796B',
    fontSize: 11,
    fontWeight: 'bold',
  },
  removeBtn: {
    padding: 6,
    backgroundColor: '#FFEBEE',
    borderRadius: 14,
  },
  pendingSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#00897B',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  pendingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  pendingSub: {
    fontSize: 12,
    marginTop: 2,
  },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  acceptBtn: {
    backgroundColor: '#00897B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  declineBtn: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  declineBtnText: {
    color: '#D32F2F',
    fontWeight: '600',
    fontSize: 13,
  },
  circlePendingSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pendingName: {
    fontSize: 13,
    fontWeight: '600',
  },
  pendingType: {
    fontSize: 11,
    marginTop: 1,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  dialogSub: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  dialogInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    marginTop: 16,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 20,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  confirmBtn: {
    backgroundColor: '#00897B',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  confirmBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
