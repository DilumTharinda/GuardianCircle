import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ROUTES } from '../../constants/routes';

export default function LostFoundScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lost & Found</Text>
      <Text style={styles.sub}>Report or search for lost items</Text>

      <TouchableOpacity
        style={styles.reportButton}
        onPress={() => navigation.navigate(ROUTES.REPORT_LOST)}
      >
        <Text style={styles.reportButtonText}>+ Report Lost Item</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.foundButton}
        onPress={() => navigation.navigate(ROUTES.REPORT_FOUND)}
      >
        <Text style={styles.foundButtonText}>+ Report Found Item</Text>
      </TouchableOpacity>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Items list will be displayed here</Text>
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
    marginBottom: 20,
    textAlign: 'center',
  },
  reportButton: {
    backgroundColor: '#E53935',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  reportButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  foundButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  foundButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
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