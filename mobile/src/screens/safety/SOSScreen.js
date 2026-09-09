import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SOSScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Safety & SOS</Text>
      <Text style={styles.sub}>Member 2 builds this screen</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { fontSize: 22, fontWeight: 'bold', color: '#E53935' },
  sub: { fontSize: 13, color: '#888', marginTop: 8 },
});