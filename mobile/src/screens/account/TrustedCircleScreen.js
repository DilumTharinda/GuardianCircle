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
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
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
} from '../../services/trustedCircleGroupService';
import CircleInviteModal from '../../components/trusted/CircleInviteModal';
import { ROUTES } from '../../constants/routes';

export default function TrustedCircleScreen({ navigation, route }) {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();

  const [circles, setCircles] = useState([]);
  const [selectedCircleId, setSelectedCircleId] = useState(null);
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

  const activeCircle = circles.find((c) => c.id === selectedCircleId) || circles[0];
  const isAdmin = activeCircle?.createdBy === user?.uid || (activeCircle?.adminUids || []).includes(user?.uid);

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
      {/* Header Bar */}
      <View style={[styles.header, { backgroundColor: colors.surfaceCard || '#FFFFFF' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Trusted Circles</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
            Family, friends & trusted contacts
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newCircleBtn}
          onPress={() => setCreateModalVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="#FFF" style={{ marginRight: 4 }} />
          <Text style={styles.newCircleText}>New Circle</Text>
        </TouchableOpacity>
      </View>

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
                style={[styles.pendingCard, { backgroundColor: colors.surfaceCard || '#FFF' }]}
              >
                <View style={styles.pendingIconWrap}>
                  <Ionicons name="mail-unread" size={24} color="#00897B" />
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
                    style={styles.declineBtn}
                    disabled={acceptingInviteId === inv.circleId}
                    onPress={() => handleDeclineInvite(inv)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.declineBtnText}>Decline</Text>
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
          <View style={styles.shieldIconBig}>
            <MaterialIcons name="groups" size={48} color="#00897B" />
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
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Horizontal Circle Selector Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
            {circles.map((c) => {
              const isSelected = c.id === activeCircle?.id;
              const isUserAdmin = c.createdBy === user?.uid;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.circleTab,
                    {
                      backgroundColor: isSelected ? '#00897B' : colors.surfaceCard || '#FFF',
                      borderColor: isSelected ? '#00897B' : colors.border || '#DDD',
                    },
                  ]}
                  onPress={() => setSelectedCircleId(c.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.circleTabText,
                      { color: isSelected ? '#FFF' : colors.textPrimary },
                    ]}
                  >
                    {c.name}
                  </Text>
                  {isUserAdmin && (
                    <View
                      style={[
                        styles.adminMiniBadge,
                        { backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#E0F2F1' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.adminMiniText,
                          { color: isSelected ? '#FFF' : '#00796B' },
                        ]}
                      >
                        Admin
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active Circle Card */}
          {activeCircle && (
            <View style={[styles.card, { backgroundColor: colors.surfaceCard || '#FFFFFF' }]}>
              {/* Card Header & Admin Status */}
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                    {activeCircle.name}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                    {isAdmin ? 'You are the Circle Admin' : `Created by ${activeCircle.createdByName || 'Admin'}`} •{' '}
                    {(activeCircle.members || []).length} Member{(activeCircle.members || []).length > 1 ? 's' : ''}
                  </Text>
                </View>

                {isAdmin ? (
                  <TouchableOpacity
                    style={styles.deleteCircleBtn}
                    onPress={() => handleDeleteCircle(activeCircle)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.leaveCircleBtn}
                    onPress={() => handleLeaveCircle(activeCircle)}
                  >
                    <Ionicons name="exit-outline" size={18} color="#E65100" />
                    <Text style={styles.leaveText}>Leave</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Action Buttons Row: View on Map & Invite Member */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.viewOnMapBtn}
                  onPress={handleTrackCircleOnMap}
                  activeOpacity={0.85}
                >
                  <Ionicons name="map" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.viewOnMapText}>View Circle on Map</Text>
                </TouchableOpacity>

                {isAdmin && (
                  <TouchableOpacity
                    style={styles.inviteBtn}
                    onPress={() => setInviteModalVisible(true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="person-add" size={16} color="#00897B" style={{ marginRight: 6 }} />
                    <Text style={styles.inviteBtnText}>Invite</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Members List Section */}
              <View style={styles.membersSection}>
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
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

                    return (
                      <View
                        key={member.uid ? `member-${member.uid}` : `member-idx-${mIdx}`}
                        style={[
                          styles.memberItem,
                          { borderBottomColor: colors.border || '#F0F0F0' },
                        ]}
                      >
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>
                            {(member.displayName || 'U')[0].toUpperCase()}
                          </Text>
                        </View>

                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                              {member.displayName}
                            </Text>
                            {isMe && (
                              <Text style={[styles.youTag, { color: colors.textSecondary }]}>
                                {' '}
                                (You)
                              </Text>
                            )}
                          </View>
                          <Text style={[styles.memberSub, { color: colors.textSecondary }]}>
                            {member.username ? `@${member.username}` : member.email}
                          </Text>
                        </View>

                        {isMemberAdmin ? (
                          <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>Admin</Text>
                          </View>
                        ) : (
                          isAdmin &&
                          !isMe && (
                            <TouchableOpacity
                              style={styles.removeBtn}
                              onPress={() => handleRemoveMember(member)}
                            >
                              <Ionicons name="close" size={16} color="#D32F2F" />
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
                <View style={styles.circlePendingSection}>
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
          <View style={[styles.dialogCard, { backgroundColor: colors.surfaceCard || '#FFFFFF' }]}>
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardSub: {
    fontSize: 13,
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
    marginBottom: 20,
  },
  viewOnMapBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00897B',
    paddingVertical: 11,
    borderRadius: 10,
    marginRight: 10,
  },
  viewOnMapText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  inviteBtnText: {
    color: '#00897B',
    fontWeight: 'bold',
    fontSize: 14,
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
