import React from 'react';
import { ScrollView, Text, TextInput, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export function FamilyScreen({ style, contentContainerStyle, ...props }) {
  const { colors } = useTheme();
  return <ScrollView {...props} style={[{ flex: 1, backgroundColor: colors.background }, style]} contentContainerStyle={[{ padding: 20, gap: 18 }, contentContainerStyle]} />;
}
export function FamilyText({ style, ...props }) {
  const { colors } = useTheme();
  return <Text {...props} style={[{ color: colors.textPrimary, fontSize: 16, lineHeight: 24 }, style]} />;
}
export function FamilyInput({ style, ...props }) {
  const { colors } = useTheme();
  return <TextInput {...props} placeholderTextColor={colors.textMuted} style={[{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface, minHeight: 48 }, style]} />;
}
const ACTION_ICONS = [
  [/unlink|remove|delete|clear/i, 'trash-outline'], [/emergency/i, 'warning-outline'],
  [/location|map/i, 'location-outline'], [/safe zone/i, 'shield-checkmark-outline'],
  [/history|yesterday|today/i, 'time-outline'], [/refresh|retry/i, 'refresh-outline'],
  [/accept|check-in/i, 'checkmark-circle-outline'], [/reject|cancel|stop/i, 'close-circle-outline'],
  [/share/i, 'share-outline'], [/link|request/i, 'link-outline'], [/add|save/i, 'add-circle-outline'],
];
export function FamilyButton({ title, onPress, disabled, icon, ...props }) {
  const { colors } = useTheme();
  const name = icon || ACTION_ICONS.find(([pattern]) => pattern.test(title))?.[1] || 'chevron-forward-outline';
  return <Pressable {...props} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 48, padding: 13, borderRadius: 12, backgroundColor: colors.darkGreenMid, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={name} size={22} color="#fff" accessible={false} />
      <Text style={{ flexShrink: 1, color: '#fff', fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </View>
  </Pressable>;
}
