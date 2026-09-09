import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

export default function ProfileScreen() {
  const { userProfile, logout } = useAuth();
  const navigation = useNavigation();

  const handleLogout = async () => {
    try {
      await logout();
      // No need to navigate manually; AppNavigator will automatically
      // switch to AuthNavigator when the user state becomes null.
    } catch (error) {
      Alert.alert('Logout Failed', 'An error occurred while logging out.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {userProfile?.displayName ? userProfile.displayName[0].toUpperCase() : 'U'}
          </Text>
        </View>
        <Text style={styles.name}>{userProfile?.displayName || 'User Name'}</Text>
        <Text style={styles.email}>{userProfile?.email || 'email@example.com'}</Text>
      </View>

      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Account Role</Text>
          <Text style={styles.infoValue}>{userProfile?.role?.replace('_', ' ') || 'User'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Karma Points</Text>
          <Text style={styles.infoValue}>{userProfile?.karma || 0}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F5F5F5',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 40,
    color: '#fff',
    fontWeight: 'bold',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212121',
  },
  email: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
  },
  infoSection: {
    padding: 20,
    gap: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  logoutButton: {
    marginTop: 30,
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E53935',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutText: {
    color: '#E53935',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
