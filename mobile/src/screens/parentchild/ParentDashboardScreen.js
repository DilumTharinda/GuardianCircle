import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function ParentDashboardScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Parent Dashboard</Text>
        <Text style={styles.subtitle}>Monitor your children's safety</Text>
      </View>

      <View style={styles.childrenList}>
        <View style={styles.childCard}>
          <View style={styles.childInfo}>
            <Text style={styles.childName}>Loading child data...</Text>
            <Text style={styles.childStatus}>🟢 Online</Text>
          </View>
          <Text style={styles.lastUpdated}>Updated 2m ago</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E53935',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  childrenList: {
    padding: 20,
    gap: 15,
  },
  childCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  childInfo: {
    gap: 4,
  },
  childName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  childStatus: {
    fontSize: 12,
    color: '#2E7D32',
  },
  lastUpdated: {
    fontSize: 11,
    color: '#999',
  },
});
