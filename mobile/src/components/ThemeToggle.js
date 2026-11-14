import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ style, iconColor, backgroundColor }) {
  const { isDark, toggleTheme } = useTheme();
  
  // Subtle scale animation on toggle
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 100, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 150, friction: 5, useNativeDriver: true }),
    ]).start();
  }, [isDark]);

  const defaultBg = backgroundColor || (iconColor === '#fff' || iconColor === '#FFF'
    ? 'rgba(255,255,255,0.15)'
    : isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.05)');

  return (
    <TouchableOpacity
      onPress={toggleTheme}
      activeOpacity={0.7}
      style={[styles.container, { backgroundColor: defaultBg }, style]}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Ionicons
          name={isDark ? "sunny-outline" : "moon-outline"}
          size={20}
          color={iconColor || (isDark ? '#FFF' : '#333')}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
