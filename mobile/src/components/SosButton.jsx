import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { triggerSOS } from '../services/sosService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

export default function SosButton() {
  const handlePress = async () => {
    try {
      const alertId = await triggerSOS(TRIGGER_TYPES.IN_APP);
      console.log('SOS document created with ID:', alertId);
    } catch (e) {
      console.log('SOS trigger failed:', e.message);
    }
  };

  return (
    <Pressable style={styles.button} onPress={handlePress}>
      <Text style={styles.label}>SOS</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#D32F2F',
    borderRadius: 999,
    paddingVertical: 24,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  label: { color: 'white', fontSize: 22, fontWeight: 'bold' },
});