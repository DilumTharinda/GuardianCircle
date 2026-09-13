// src/components/SosButton.jsx
import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { triggerSOS } from '../services/sosService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

export default function SosButton() {
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error

  const handlePress = async () => {
    if (status === 'sending') return; // prevent double-taps
    setStatus('sending');
    try {
      const alertId = await triggerSOS(TRIGGER_TYPES.IN_APP);
      console.log('SOS document created with ID:', alertId);
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      console.log('SOS trigger failed:', e.message);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <Pressable style={styles.button} onPress={handlePress} disabled={status === 'sending'}>
      {status === 'sending' ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.label}>
          {status === 'sent' ? 'SOS Sent ✓' : status === 'error' ? 'Failed — Tap to Retry' : 'SOS'}
        </Text>
      )}
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
    justifyContent: 'center',
    minWidth: 160,
  },
  label: { color: 'white', fontSize: 22, fontWeight: 'bold' },
});