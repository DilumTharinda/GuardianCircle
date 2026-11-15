import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ROUTES } from '../../constants/routes';
import { RADIUS, SHADOWS } from '../../constants/theme';
import { formatRelativeTime } from '../../services/circleFindService';
import { navigate } from '../../navigation/navigationService';
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../services/notificationCenterService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function NotificationDropdown({
  visible,
  onClose,
  notifications = [],
  unreadCount = 0,
  onMarkAllReadLocal,
}) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  // Tabs: 'all' | 'sos' | 'circlefind' | 'alerts'
  const [activeTab, setActiveTab] = useState('all');

  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.92);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim]);

  // Tab Filtering & Counts
  const sosList = useMemo(() => notifications.filter((n) => n.category === 'sos'), [notifications]);
  const circleFindList = useMemo(() => notifications.filter((n) => n.category === 'circlefind'), [notifications]);
  const alertsList = useMemo(() => notifications.filter((n) => n.category === 'alerts' || n.category === 'system' || n.category === 'safety'), [notifications]);

  const unreadAllCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const unreadSosCount = useMemo(() => sosList.filter((n) => !n.read).length, [sosList]);
  const unreadCircleFindCount = useMemo(() => circleFindList.filter((n) => !n.read).length, [circleFindList]);
  const unreadAlertsCount = useMemo(() => alertsList.filter((n) => !n.read).length, [alertsList]);

  const displayedList = useMemo(() => {
    if (activeTab === 'sos') return sosList;
    if (activeTab === 'circlefind') return circleFindList;
    if (activeTab === 'alerts') return alertsList;
    return notifications;
  }, [activeTab, sosList, circleFindList, alertsList, notifications]);

  // Strip any emoji characters that may have been saved in previously created Firestore docs
  const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
  };

  const handleMarkAllRead = async () => {
    const unreadItems = notifications.filter((n) => !n.read);
    if (unreadItems.length === 0) return;
    await markAllNotificationsAsRead(user?.uid, unreadItems);
    onMarkAllReadLocal?.();
  };

  const handleItemPress = async (item) => {
    if (!item.read) {
      await markNotificationAsRead(user?.uid, item.id, item.isPersonal);
    }
    onClose();

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

  const handleOpenSettings = () => {
    onClose();
    navigate(ROUTES.NOTIFICATION_SETTINGS);
  };

  const handleViewAll = () => {
    onClose();
    navigate(ROUTES.NOTIFICATIONS);
  };

  const styles = getStyles(colors, isDark);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.popoverCard,
                {
                  transform: [{ scale: scaleAnim }],
                  opacity: opacityAnim,
                },
              ]}
            >
              {/* Pointer Beak on top right right under bell icon */}
              <View style={styles.beak} />

              {/* 1. Header Row */}
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Notifications</Text>
                <TouchableOpacity onPress={handleMarkAllRead} activeOpacity={0.7}>
                  <Text style={styles.markAllText}>Mark all as read</Text>
                </TouchableOpacity>
              </View>

              {/* 2. Tabs Row: All [count] | SOS [count] | CircleFind [count] | Alert [count] + Settings gear */}
              <View style={styles.tabRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabLeftGroup}
                >
                  {/* All Tab */}
                  <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('all')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabLabel, activeTab === 'all' && styles.tabLabelActive]}>
                      All
                    </Text>
                    {unreadAllCount > 0 && (
                      <View style={[styles.tabBadgePill, activeTab === 'all' && styles.tabBadgePillActive]}>
                        <Text style={[styles.tabBadgeText, activeTab === 'all' && styles.tabBadgeTextActive]}>
                          {unreadAllCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* SOS Tab */}
                  <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'sos' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('sos')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabLabel, activeTab === 'sos' && styles.tabLabelActive]}>
                      SOS
                    </Text>
                    {unreadSosCount > 0 && (
                      <View style={styles.tabSosBadgePill}>
                        <Text style={styles.tabSosBadgeText}>{unreadSosCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* CircleFind Tab */}
                  <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'circlefind' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('circlefind')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabLabel, activeTab === 'circlefind' && styles.tabLabelActive]}>
                      CircleFind
                    </Text>
                    {unreadCircleFindCount > 0 && (
                      <View style={styles.tabGreenBadgePill}>
                        <Text style={styles.tabGreenBadgeText}>{unreadCircleFindCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Alerts Tab (Unsafe alerts, Circle joins, Login notices) */}
                  <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'alerts' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('alerts')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabLabel, activeTab === 'alerts' && styles.tabLabelActive]}>
                      Alerts
                    </Text>
                    {unreadAlertsCount > 0 && (
                      <View style={styles.tabCountPill}>
                        <Text style={styles.tabCountText}>{unreadAlertsCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </ScrollView>

                {/* Settings Gear Icon Button */}
                <TouchableOpacity
                  style={styles.settingsIconBtn}
                  onPress={handleOpenSettings}
                  activeOpacity={0.7}
                  accessibilityLabel="Notification settings"
                >
                  <Ionicons name="settings-outline" size={17} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* 3. Notification Items List */}
              {displayedList.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="notifications-off-outline" size={26} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No notifications here</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.scrollList}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {displayedList.slice(0, 5).map((item, index) => {
                    const isUnread = !item.read;
                    const isSos = item.category === 'sos';
                    const isCircleFind = item.category === 'circlefind';
                    const isAlert = !isSos && !isCircleFind;

                    // Avatar or Icon styling matching the card reference
                    const badgeBg = isSos
                      ? '#FFEBEE'
                      : isCircleFind
                      ? '#E8F5E9'
                      : '#FFF3E0';

                    const iconColor = isSos
                      ? '#E53935'
                      : isCircleFind
                      ? colors.darkGreenMid
                      : '#FB8C00';

                    const iconName = isSos
                      ? 'warning'
                      : isCircleFind
                      ? 'search'
                      : item.title?.toLowerCase().includes('login')
                      ? 'lock'
                      : item.title?.toLowerCase().includes('circle')
                      ? 'group-add'
                      : 'shield';

                    return (
                      <TouchableOpacity
                        key={item.id || index}
                        style={[styles.itemRow, isUnread && styles.itemRowUnread]}
                        onPress={() => handleItemPress(item)}
                        activeOpacity={0.8}
                      >
                        {/* Circular Avatar/Icon with sub-status indicator dot */}
                        <View style={styles.avatarWrapper}>
                          <View style={[styles.avatarCircle, { backgroundColor: badgeBg }]}>
                            <MaterialIcons
                              name={iconName}
                              size={18}
                              color={iconColor}
                            />
                          </View>
                          <View
                            style={[
                              styles.onlineSubDot,
                              { backgroundColor: isSos ? '#E53935' : isCircleFind ? colors.darkGreenMid : '#FB8C00' },
                            ]}
                          />
                        </View>

                        {/* Title & Body */}
                        <View style={styles.itemContent}>
                          <Text style={styles.itemTitle} numberOfLines={2}>
                            <Text style={styles.itemAuthor}>{cleanText(item.title)} </Text>
                            <Text style={styles.itemSubtext}>{cleanText(item.body)}</Text>
                          </Text>

                          <Text style={styles.itemMeta}>
                            {item.createdAt?.toMillis
                              ? formatRelativeTime(item.createdAt.toMillis())
                              : 'Just now'}
                            {isSos ? ' • SOS Broadcast' : isCircleFind ? ' • CircleFind' : ' • Safety Alert'}
                          </Text>

                          {/* Quick action buttons if SOS or Item Found */}
                          {isSos && isUnread && (
                            <View style={styles.actionBtnRow}>
                              <TouchableOpacity
                                style={styles.primaryActionBtn}
                                onPress={() => handleItemPress(item)}
                              >
                                <Text style={styles.primaryActionText}>View on Map</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        {/* Purple/Accent unread dot on right edge matching card */}
                        {isUnread && <View style={styles.unreadPurpleDot} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* 4. Footer CTA */}
              <TouchableOpacity
                style={styles.viewAllBtn}
                onPress={handleViewAll}
                activeOpacity={0.8}
              >
                <Text style={styles.viewAllText}>View All Notifications</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.darkGreenMid} />
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.38)',
      justifyContent: 'flex-start',
      alignItems: 'flex-end', // Aligned on right side directly under bell
      paddingTop: 66,
      paddingRight: 12,
    },
    popoverCard: {
      width: Math.min(SCREEN_WIDTH * 0.88, 360), // Wide enough to read comfortably, looks like desktop panel
      maxHeight: SCREEN_HEIGHT * 0.72,
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8ECEF',
      overflow: 'visible',
      ...SHADOWS.large,
      elevation: 12,
    },
    beak: {
      position: 'absolute',
      top: -6,
      right: 22,
      width: 12,
      height: 12,
      backgroundColor: colors.surface,
      transform: [{ rotate: '45deg' }],
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8ECEF',
      zIndex: 10,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 10,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    markAllText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F6',
    },
    tabLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    tabBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 10,
      paddingTop: 4,
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
    tabBadgePill: {
      backgroundColor: '#E0E7FF',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
    },
    tabBadgePillActive: {
      backgroundColor: '#0F172A',
    },
    tabBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#3730A3',
    },
    tabBadgeTextActive: {
      color: '#FFFFFF',
    },
    tabSosBadgePill: {
      backgroundColor: '#FFEBEE',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
    },
    tabSosBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#D32F2F',
    },
    tabGreenBadgePill: {
      backgroundColor: '#E8F5E9',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
    },
    tabGreenBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#2E7D32',
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
    settingsIconBtn: {
      padding: 6,
    },
    scrollList: {
      maxHeight: SCREEN_HEIGHT * 0.52,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#F4F6F8',
      gap: 12,
    },
    itemRowUnread: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FAFCFF',
    },
    avatarWrapper: {
      position: 'relative',
      marginTop: 2,
    },
    avatarCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    onlineSubDot: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 9,
      height: 9,
      borderRadius: 4.5,
      borderWidth: 1.5,
      borderColor: colors.surface,
    },
    itemContent: {
      flex: 1,
      gap: 3,
    },
    itemTitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textPrimary,
    },
    itemAuthor: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
    itemSubtext: {
      fontWeight: '400',
      color: colors.textSecondary,
    },
    itemMeta: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    actionBtnRow: {
      flexDirection: 'row',
      marginTop: 8,
      gap: 8,
    },
    primaryActionBtn: {
      backgroundColor: '#6366F1', // Clean purple matching image's Accept button
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 8,
    },
    primaryActionText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    unreadPurpleDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: '#7C3AED', // Distinctive purple unread indicator dot
      marginTop: 6,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 32,
      gap: 6,
    },
    emptyText: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    viewAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F6',
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FAFCFA',
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      overflow: 'hidden',
      gap: 6,
    },
    viewAllText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.darkGreenMid,
    },
  });

