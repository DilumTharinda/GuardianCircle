import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ROUTES } from '../../constants/routes';
import { RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { navigate } from '../../navigation/navigationService';
import {
  subscribeToPersonalNotifications,
  subscribeToBroadcastNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deletePersonalNotification,
} from '../../services/notificationCenterService';
import {
  acceptCircleInvitation,
  declineCircleInvitation,
} from '../../services/trustedCircleGroupService';
import { formatRelativeTime } from '../../services/circleFindService';

export default function NotificationsScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [personalNotifs, setPersonalNotifs] = useState([]);
  const [broadcastNotifs, setBroadcastNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'sos' | 'circlefind' | 'alerts'
  const [processingInvites, setProcessingInvites] = useState({});

  // Real-time synchronization
  useEffect(() => {
    setLoading(true);
    let unsubPersonal = () => {};
    let unsubBroadcast = () => {};

    if (user?.uid) {
      unsubPersonal = subscribeToPersonalNotifications(user.uid, (list) => {
        setPersonalNotifs(list);
        setLoading(false);
      });
    }

    unsubBroadcast = subscribeToBroadcastNotifications(userProfile?.role, (list) => {
      setBroadcastNotifs(list);
      setLoading(false);
    });

    return () => {
      unsubPersonal();
      unsubBroadcast();
    };
  }, [user?.uid, userProfile?.role]);

  // Combined & sorted notifications
  const allNotifications = useMemo(() => {
    const combined = [...personalNotifs, ...broadcastNotifs];
    return combined.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [personalNotifs, broadcastNotifs]);

  const sosList = useMemo(() => allNotifications.filter((n) => n.category === 'sos'), [allNotifications]);
  const circleFindList = useMemo(() => allNotifications.filter((n) => n.category === 'circlefind'), [allNotifications]);
  const alertsList = useMemo(() => allNotifications.filter((n) => n.category === 'alerts' || n.category === 'system' || n.category === 'safety'), [allNotifications]);

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'sos') return sosList;
    if (activeFilter === 'circlefind') return circleFindList;
    if (activeFilter === 'alerts') return alertsList;
    return allNotifications;
  }, [allNotifications, activeFilter, sosList, circleFindList, alertsList]);

  const unreadCount = useMemo(() => {
    return allNotifications.filter((n) => !n.read).length;
  }, [allNotifications]);

  const handleMarkAllRead = async () => {
    // Mark both personal and broadcast notifications as read
    const unreadItems = allNotifications.filter((n) => !n.read);
    if (unreadItems.length === 0) return;
    await markAllNotificationsAsRead(user?.uid, unreadItems);
    // Optimistically mark all in state
    setPersonalNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setBroadcastNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleAcceptInvite = async (item) => {
    const circleId = item.data?.circleId;
    const inviteId = item.data?.inviteId;
    if (!circleId || !user) return;

    setProcessingInvites((prev) => ({ ...prev, [item.id]: 'accepting' }));
    try {
      await acceptCircleInvitation(circleId, inviteId, user);
      await markNotificationAsRead(user.uid, item.id, item.isPersonal);
      if (item.isPersonal) {
        setPersonalNotifs((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true, inviteStatus: 'accepted' } : n)));
      }
      navigate(ROUTES.TRUSTED_CIRCLE, {
        circleId,
        inviteId,
      });
    } catch (err) {
      console.warn('[NotificationsScreen] Accept invite error:', err?.message || err);
    } finally {
      setProcessingInvites((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleDeclineInvite = async (item) => {
    const circleId = item.data?.circleId;
    const inviteId = item.data?.inviteId;
    if (!circleId) return;

    setProcessingInvites((prev) => ({ ...prev, [item.id]: 'declining' }));
    try {
      await declineCircleInvitation(circleId, inviteId, user?.email);
      if (user?.uid && item.isPersonal) {
        await deletePersonalNotification(user.uid, item.id);
        setPersonalNotifs((prev) => prev.filter((n) => n.id !== item.id));
      }
    } catch (err) {
      console.warn('[NotificationsScreen] Decline invite error:', err?.message || err);
    } finally {
      setProcessingInvites((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleNotificationPress = async (item) => {
    if (!item.read) {
      await markNotificationAsRead(user?.uid, item.id, item.isPersonal);
      if (item.isPersonal) {
        setPersonalNotifs((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      } else {
        setBroadcastNotifs((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      }
    }

    // Deep-link to target screen
    if (item.category === 'TRUSTED_CIRCLE_INVITE' || item.data?.type === 'TRUSTED_CIRCLE_INVITE' || item.data?.circleId) {
      navigate(ROUTES.TRUSTED_CIRCLE, {
        circleId: item.data?.circleId,
        inviteId: item.data?.inviteId,
        circleName: item.data?.circleName,
      });
    } else if (item.data?.screen) {
      navigate(item.data.screen, item.data.params || {});
    } else if (item.data?.reportId) {
      navigate(ROUTES.CIRCLE_FIND_DETAIL, { reportId: item.data.reportId });
    } else if (item.category === 'sos') {
      navigate(ROUTES.MAP, item.data?.params || {});
    } else if (item.category === 'circlefind') {
      navigate(ROUTES.CIRCLE_FIND);
    }
  };

  const handleDeleteNotification = async (item) => {
    if (!user?.uid || !item.isPersonal) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await deletePersonalNotification(user.uid, item.id);
  };

  const styles = getStyles(colors, isDark);

  const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
  };

  const renderItem = ({ item }) => {
    const isUnread = !item.read;
    const isSos = item.category === 'sos';
    const isCircleFind = item.category === 'circlefind';
    const isCircleInvite = item.category === 'TRUSTED_CIRCLE_INVITE' || item.data?.type === 'TRUSTED_CIRCLE_INVITE';

    const iconName = isSos ? 'warning' : isCircleFind ? 'search' : isCircleInvite ? 'people' : 'notifications';
    const iconColor = isSos ? colors.dangerRed : isCircleFind ? colors.darkGreenMid : isCircleInvite ? '#0D7C66' : '#1976D2';
    const isProcessing = processingInvites[item.id];

    return (
      <TouchableOpacity
        style={[styles.notifCard, isUnread && styles.notifCardUnread]}
        activeOpacity={0.85}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={[styles.iconCircle, { backgroundColor: iconColor + '18' }]}>
          <MaterialIcons name={iconName} size={22} color={iconColor} />
        </View>

        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.itemTitle, isUnread && styles.itemTitleUnread]} numberOfLines={1}>
              {cleanText(item.title)}
            </Text>
            {isUnread && <View style={styles.unreadDot} />}
          </View>

          <Text style={styles.itemBody} numberOfLines={2}>
            {cleanText(item.body)}
          </Text>

          {isCircleInvite && (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.inviteAcceptBtn, { backgroundColor: colors.darkGreenMid || '#0D7C66' }]}
                disabled={!!isProcessing}
                onPress={() => handleAcceptInvite(item)}
              >
                {isProcessing === 'accepting' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.inviteBtnTextWhite}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.inviteDeclineBtn, { borderColor: colors.border || '#DDD' }]}
                disabled={!!isProcessing}
                onPress={() => handleDeclineInvite(item)}
              >
                {isProcessing === 'declining' ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={16} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={[styles.inviteBtnTextMuted, { color: colors.textSecondary }]}>Decline</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.bottomMetaRow}>
            <Text style={styles.timeText}>
              {item.createdAt?.toMillis
                ? formatRelativeTime(item.createdAt.toMillis())
                : 'Just now'}
            </Text>
            {item.isPersonal && (
              <TouchableOpacity
                onPress={() => handleDeleteNotification(item)}
                style={styles.deleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Top Filter Bar */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {[
            { key: 'all', label: 'All', count: unreadCount, badgeType: 'all' },
            { key: 'sos', label: 'SOS', count: sosList.filter(n => !n.read).length, badgeType: 'sos' },
            { key: 'circlefind', label: 'CircleFind', count: circleFindList.filter(n => !n.read).length, badgeType: 'green' },
            { key: 'alerts', label: 'Alerts', count: alertsList.filter(n => !n.read).length, badgeType: 'gray' },
          ].map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setActiveFilter(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View
                    style={[
                      styles.tabCountPill,
                      tab.badgeType === 'all' && (isActive ? styles.pillAllActive : styles.pillAll),
                      tab.badgeType === 'sos' && styles.pillSos,
                      tab.badgeType === 'green' && styles.pillGreen,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabCountText,
                        tab.badgeType === 'all' && (isActive ? styles.pillTextAllActive : styles.pillTextAll),
                        tab.badgeType === 'sos' && styles.pillTextSos,
                        tab.badgeType === 'green' && styles.pillTextGreen,
                      ]}
                    >
                      {tab.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notification List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.darkGreenMid} />
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => setRefreshing(false)}
              tintColor={colors.darkGreenMid}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={38} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptySubtitle}>
                {activeFilter === 'unread'
                  ? 'All caught up! No unread notifications.'
                  : 'You will receive real-time updates and emergency notices here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    filterBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    filterChipsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 4,
    },
    tabBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 10,
      paddingTop: 8,
      gap: 5,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabBtnActive: {
      borderBottomColor: colors.textPrimary,
    },
    tabLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
    },
    tabLabelActive: {
      color: colors.textPrimary,
      fontWeight: '800',
    },
    tabCountPill: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
    },
    tabCountText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
    },
    pillAll: {
      backgroundColor: '#E0E7FF',
    },
    pillAllActive: {
      backgroundColor: '#0F172A',
    },
    pillTextAll: {
      color: '#3730A3',
      fontWeight: '800',
    },
    pillTextAllActive: {
      color: '#FFFFFF',
      fontWeight: '800',
    },
    pillSos: {
      backgroundColor: '#FFEBEE',
    },
    pillTextSos: {
      color: '#D32F2F',
      fontWeight: '800',
    },
    pillGreen: {
      backgroundColor: '#E8F5E9',
    },
    pillTextGreen: {
      color: '#2E7D32',
      fontWeight: '800',
    },
    markAllBtn: {
      paddingLeft: 8,
    },
    markAllText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.darkGreenMid,
    },
    listContent: {
      padding: 14,
      gap: 10,
    },
    notifCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      padding: 14,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOWS.small,
    },
    notifCardUnread: {
      backgroundColor: isDark ? 'rgba(6, 117, 106, 0.12)' : '#F2FAF7',
      borderColor: colors.darkGreenMid + '60',
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contentCol: {
      flex: 1,
      gap: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    itemTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    itemTitleUnread: {
      fontWeight: '800',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.darkGreenMid,
    },
    itemBody: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
      marginBottom: 4,
    },
    inviteAcceptBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md || 8,
    },
    inviteBtnTextWhite: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    inviteDeclineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md || 8,
      borderWidth: 1,
    },
    inviteBtnTextMuted: {
      fontSize: 12,
      fontWeight: '600',
    },
    bottomMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    timeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textMuted,
    },
    deleteBtn: {
      padding: 2,
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 30,
      gap: 10,
    },
    emptyIconCircle: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0F4F0',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
  });

