import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  DeviceEventEmitter,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RADIUS, SHADOWS } from '../../constants/theme';

/**
 * Global toast emitter: displays custom styled in-app animated toast banner
 */
export function showToast(message, type = 'success') {
  if (!message) return;
  DeviceEventEmitter.emit('SHOW_CIRCLE_FIND_TOAST', { message, type });
}

/**
 * Universal in-app Toast banner that automatically responds to showToast()
 */
export default function Toast() {
  const [toastData, setToastData] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const hideTimerRef = useRef(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('SHOW_CIRCLE_FIND_TOAST', ({ message, type }) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      setToastData({ message, type: type || 'success' });
      opacity.setValue(0);
      translateY.setValue(20);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      hideTimerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 20,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setToastData(null);
        });
      }, 2500);
    });

    return () => {
      sub.remove();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [opacity, translateY]);

  if (!toastData?.message) return null;

  const isError = toastData.type === 'error';
  const isInfo = toastData.type === 'info';
  const bgColor = isError ? '#D32F2F' : isInfo ? '#1976D2' : '#2E7D32';
  const iconName = isError ? 'error-outline' : isInfo ? 'info-outline' : 'check-circle';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toastContainer,
        {
          backgroundColor: bgColor,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <MaterialIcons name={iconName} size={18} color="#FFF" />
      <Text style={styles.toastText} numberOfLines={2}>
        {toastData.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 35,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: RADIUS.round,
    maxWidth: '92%',
    zIndex: 99999,
    gap: 8,
    ...SHADOWS.medium,
  },
  toastText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
