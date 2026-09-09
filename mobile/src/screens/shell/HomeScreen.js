import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Vibration,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { isChild, ROLES } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { userProfile } = useAuth();

  const childMode = userProfile && isChild(userProfile.role);
  const isParent = userProfile?.role === ROLES.PARENT_GUARDIAN;

  function handleSOSTap() {
    Vibration.vibrate(100);
    navigation.navigate(ROUTES.SAFETY);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>
          Hello, {userProfile?.displayName?.split(' ')[0] || 'Guardian'} 👋
        </Text>
        <Text style={styles.subText}>You are protected.</Text>
      </View>

      {/* SOS Button — always visible and reachable */}
      <TouchableOpacity
        style={styles.sosButton}
        onPress={handleSOSTap}
        activeOpacity={0.8}
        accessibilityLabel="Emergency SOS Button"
        accessibilityRole="button"
      >
        <Text style={styles.sosButtonText}>🆘  SOS</Text>
        <Text style={styles.sosSubText}>Tap to send emergency alert</Text>
      </TouchableOpacity>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActions}>
        {/* Journey — shown to all users except child in simplified mode */}
        {!childMode && (
          <QuickActionCard
            emoji="🚶"
            label="Start Journey"
            onPress={() => navigation.navigate(ROUTES.MAP)}
          />
        )}

        {/* Lost & Found — shown to all */}
        <QuickActionCard
          emoji="🔍"
          label="Lost & Found"
          onPress={() => navigation.navigate(ROUTES.LOST_FOUND)}
        />

        {/* Parent dashboard — only for parents */}
        {isParent && (
          <QuickActionCard
            emoji="👶"
            label="Watch Children"
            onPress={() => navigation.navigate(ROUTES.PARENT_DASHBOARD)}
          />
        )}

        {/* Trusted circle — hidden from child accounts */}
        {!childMode && (
          <QuickActionCard
            emoji="👥"
            label="Trusted Circle"
            onPress={() => navigation.navigate(ROUTES.TRUSTED_CIRCLE)}
          />
        )}
      </View>

      {/* Status bar at bottom */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          🟢 GuardianCircle is active
        </Text>
      </View>
    </ScrollView>
  );
}

function QuickActionCard({ emoji, label, onPress }) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.actionEmoji}>{emoji}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 20, paddingBottom: 40 },
  greeting: { marginBottom: 24 },
  greetingText: { fontSize: 24, fontWeight: 'bold', color: '#212121' },
  subText: { fontSize: 14, color: '#757575', marginTop: 4 },

  sosButton: {
    backgroundColor: '#E53935',
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  sosButtonText: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  sosSubText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '47%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionEmoji: { fontSize: 28, marginBottom: 8 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: '#424242', textAlign: 'center' },

  statusBar: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statusText: { fontSize: 13, color: '#2E7D32', fontWeight: '500' },
});