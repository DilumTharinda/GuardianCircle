import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TrustedCircleScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trusted Circle</Text>
      <Text style={styles.sub}>Manage your emergency contacts</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Contact list will be displayed here</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E53935',
    marginBottom: 10,
  },
  sub: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  placeholder: {
    width: '100%',
    height: 200,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  placeholderText: {
    fontSize: 14,
    color: '#aaa',
  },
});
