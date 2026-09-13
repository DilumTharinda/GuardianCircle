import React, { useState } from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import SosButton from '../../components/SosButton';
import { useShakeSOS } from '../../hooks/useShakeSOS';

export default function SOSScreen() {
  const [cancelFn, setCancelFn] = useState(null);

  useShakeSOS((cancel) => setCancelFn(() => cancel));

  return (
    <View style={styles.container}>
      <SosButton />
      {cancelFn && (
        <Pressable
          style={styles.cancelButton}
          onPress={() => {
            cancelFn();
            setCancelFn(null);
          }}
        >
          <Text style={styles.cancelText}>Shake detected — Cancel SOS</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  cancelButton: { marginTop: 24, backgroundColor: '#333', padding: 16, borderRadius: 8 },
  cancelText: { color: '#fff', fontWeight: 'bold' },
});