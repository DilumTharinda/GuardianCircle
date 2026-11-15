import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { scale, verticalScale, normalize } from '../../utils/responsive';

const PERMISSION_PROMPTED_KEY = '@guardiancircle_bg_permission_asked';

export default function BackgroundPermissionModal({ visibleOverride, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visibleOverride !== undefined) {
      setVisible(visibleOverride);
      return;
    }
    (async () => {
      try {
        const asked = await AsyncStorage.getItem(PERMISSION_PROMPTED_KEY);
        if (!asked) {
          setVisible(true);
        }
      } catch (e) {}
    })();
  }, [visibleOverride]);

  const handleGrantPermissions = async () => {
    try {
      if (Platform.OS !== 'web') {
        // 1. Request notification permissions
        await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });

        // 2. Request Foreground & Background Location permissions
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus === 'granted') {
          await Location.requestBackgroundPermissionsAsync();
        }
      }

      await AsyncStorage.setItem(PERMISSION_PROMPTED_KEY, 'true');
    } catch (e) {
      console.warn('[BackgroundPermissionModal] Permission request error:', e);
    } finally {
      setVisible(false);
      onClose?.();
    }
  };

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(PERMISSION_PROMPTED_KEY, 'true');
    } catch (e) {}
    setVisible(false);
    onClose?.();
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.dialogCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={32} color="#00796B" />
          </View>

          <Text style={styles.title}>24/7 Background Protection</Text>
          <Text style={styles.description}>
            To protect your Trusted Circle in real-time, GuardianCircle needs permission to deliver critical SOS emergency notifications and track location even when your phone is locked or the app is closed.
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <MaterialIcons name="notifications-active" size={18} color="#00796B" style={{ marginRight: 8 }} />
              <Text style={styles.featureText}>Immediate SOS siren & vibration alert</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="security" size={18} color="#00796B" style={{ marginRight: 8 }} />
              <Text style={styles.featureText}>Background emergency link with Trusted Circle</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="battery-saver" size={18} color="#00796B" style={{ marginRight: 8 }} />
              <Text style={styles.featureText}>Minimal, battery-optimized background sync</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.grantBtn}
            onPress={handleGrantPermissions}
            activeOpacity={0.85}
          >
            <Text style={styles.grantBtnText}>Enable Background Protection</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.maybeLaterBtn}
            onPress={handleDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.maybeLaterText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(18),
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: scale(20),
    padding: scale(22),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  iconCircle: {
    width: scale(60),
    height: scale(60),
    borderRadius: scale(30),
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  title: {
    fontSize: normalize(18),
    fontWeight: 'bold',
    color: '#004D40',
    textAlign: 'center',
    marginBottom: verticalScale(8),
  },
  description: {
    fontSize: normalize(13),
    color: '#546E7A',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: verticalScale(16),
  },
  featureList: {
    width: '100%',
    backgroundColor: '#F4F6F4',
    borderRadius: scale(12),
    padding: scale(12),
    marginBottom: verticalScale(20),
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  featureText: {
    fontSize: normalize(12),
    color: '#37474F',
    fontWeight: '500',
    flex: 1,
  },
  grantBtn: {
    width: '100%',
    backgroundColor: '#00796B',
    paddingVertical: verticalScale(13),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(10),
  },
  grantBtnText: {
    color: '#FFFFFF',
    fontSize: normalize(14),
    fontWeight: 'bold',
  },
  maybeLaterBtn: {
    paddingVertical: verticalScale(6),
  },
  maybeLaterText: {
    color: '#78909C',
    fontSize: normalize(13),
    fontWeight: '600',
  },
});

