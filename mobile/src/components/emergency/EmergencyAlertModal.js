import React, { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { scale, verticalScale, normalize } from '../../utils/responsive';

export default function EmergencyAlertModal({ visible, alertData, onAcknowledge, onViewMap }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 100,
        friction: 7,
        useNativeDriver: true,
      }).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      slideAnim.setValue(50);
    }
  }, [visible]);

  if (!visible || !alertData) return null;

  const senderName = alertData.userName || alertData.userEmail || 'A Trusted Circle Member';
  const locationText = alertData.location?.address ||
    (alertData.location?.lat ? `${alertData.location.lat.toFixed(4)}, ${alertData.location.lng.toFixed(4)}` : 'Location unavailable');

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onAcknowledge}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.dialogCard, { transform: [{ translateY: slideAnim }] }]}>
          {/* Pulsing Emergency Warning Badge */}
          <View style={styles.badgeRow}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.iconCircle}>
                <MaterialIcons name="emergency" size={36} color="#FFF" />
              </View>
            </Animated.View>
          </View>

          <Text style={styles.headline}>EMERGENCY SOS ALERT</Text>
          <Text style={styles.subheadline}>From Your Trusted Circle</Text>

          {/* Details Box */}
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Ionicons name="person" size={18} color="#D32F2F" style={{ marginRight: 8 }} />
              <Text style={styles.detailSender} numberOfLines={1}>
                {senderName}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="location" size={18} color="#D32F2F" style={{ marginRight: 8 }} />
              <Text style={styles.detailLocation} numberOfLines={2}>
                {locationText}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="time" size={18} color="#757575" style={{ marginRight: 8 }} />
              <Text style={styles.detailTime}>
                Triggered: {new Date(alertData.timestamp || Date.now()).toLocaleTimeString()}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={styles.stopVibrateBtn}
            onPress={onAcknowledge}
            activeOpacity={0.85}
          >
            <Ionicons name="volume-mute" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.stopVibrateBtnText}>Acknowledge & Stop Alert</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapBtn}
            onPress={onViewMap}
            activeOpacity={0.85}
          >
            <Ionicons name="map" size={18} color="#1565C0" style={{ marginRight: 6 }} />
            <Text style={styles.mapBtnText}>View Live Location on Map</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(183, 28, 28, 0.75)',
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
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  badgeRow: {
    marginBottom: verticalScale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    backgroundColor: '#FFCDD2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    backgroundColor: '#D32F2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: normalize(20),
    fontWeight: '900',
    color: '#D32F2F',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  subheadline: {
    fontSize: normalize(13),
    fontWeight: '600',
    color: '#616161',
    marginTop: 2,
    marginBottom: verticalScale(16),
    textAlign: 'center',
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#FFEBEE',
    borderRadius: scale(14),
    padding: scale(14),
    borderWidth: 1.5,
    borderColor: '#EF5350',
    marginBottom: verticalScale(20),
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  detailSender: {
    fontSize: normalize(14),
    fontWeight: 'bold',
    color: '#B71C1C',
    flex: 1,
  },
  detailLocation: {
    fontSize: normalize(12.5),
    color: '#333333',
    flex: 1,
    lineHeight: 18,
  },
  detailTime: {
    fontSize: normalize(11),
    color: '#757575',
    fontWeight: '500',
  },
  stopVibrateBtn: {
    width: '100%',
    backgroundColor: '#D32F2F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(14),
    borderRadius: scale(12),
    marginBottom: verticalScale(10),
    shadowColor: '#D32F2F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  stopVibrateBtnText: {
    color: '#FFFFFF',
    fontSize: normalize(15),
    fontWeight: 'bold',
    letterSpacing: 0.4,
  },
  mapBtn: {
    width: '100%',
    backgroundColor: '#E3F2FD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(12),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  mapBtnText: {
    color: '#1565C0',
    fontSize: normalize(14),
    fontWeight: '700',
  },
});

