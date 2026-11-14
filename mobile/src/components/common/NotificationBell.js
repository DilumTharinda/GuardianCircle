import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  subscribeToPersonalNotifications,
  subscribeToBroadcastNotifications,
} from '../../services/notificationCenterService';
import NotificationDropdown from './NotificationDropdown';

/**
 * Universal Notification Bell Component with Live Badge Counter & Popover Dropdown
 * Styled identically to HomeScreen iconBtn: 38x38 rounded circle, matches theme & header
 */
export default function NotificationBell({
  iconColor = null,
  size = 20,
  style = {},
  backgroundColor = null,
}) {
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [personalNotifs, setPersonalNotifs] = useState([]);
  const [broadcastNotifs, setBroadcastNotifs] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const bellAnim = useRef(new Animated.Value(1)).current;

  // Real-time synchronization
  const refreshNotifs = () => {
    let unsubPersonal = () => {};
    let unsubBroadcast = () => {};

    if (user?.uid) {
      unsubPersonal = subscribeToPersonalNotifications(user.uid, (list) => {
        setPersonalNotifs(list);
      });
    }

    unsubBroadcast = subscribeToBroadcastNotifications(userProfile?.role, (list) => {
      setBroadcastNotifs(list);
    });

    return () => {
      unsubPersonal();
      unsubBroadcast();
    };
  };

  useEffect(() => {
    const unsub = refreshNotifs();
    return () => unsub?.();
  }, [user?.uid, userProfile?.role]);

  const handleMarkAllLocal = (updatedList) => {
    setPersonalNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setBroadcastNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // Combined & sorted notifications
  const allNotifications = useMemo(() => {
    const combined = [...personalNotifs, ...broadcastNotifs];
    return combined.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [personalNotifs, broadcastNotifs]);

  const unreadCount = useMemo(() => {
    return allNotifications.filter((n) => !n.read).length;
  }, [allNotifications]);

  const handlePress = () => {
    // Vibration removed per user specification
    Animated.sequence([
      Animated.timing(bellAnim, { toValue: 1.25, duration: 120, useNativeDriver: true }),
      Animated.spring(bellAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
    ]).start();
    setDropdownOpen(true);
  };

  const finalColor = iconColor || (isDark ? '#FFF' : colors.darkGreenMid);
  const defaultBg = backgroundColor || (iconColor === '#fff' || iconColor === '#FFF'
    ? 'rgba(255,255,255,0.15)'
    : isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.05)');

  return (
    <>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: defaultBg }, style]}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <Animated.View style={{ transform: [{ scale: bellAnim }] }}>
          <Ionicons name="notifications-outline" size={size} color={finalColor} />
        </Animated.View>

        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <NotificationDropdown
        visible={dropdownOpen}
        onClose={() => setDropdownOpen(false)}
        notifications={allNotifications}
        unreadCount={unreadCount}
        onMarkAllReadLocal={handleMarkAllLocal}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: '#E53935',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },
});

