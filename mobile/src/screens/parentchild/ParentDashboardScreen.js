import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { ROUTES } from '../../constants/routes';
import {
  getChildren,
  getPetsAndItems,
  triggerMockSOS,
  resolveChildSOS,
  USE_MOCK_DATA,
} from '../../services/parentChildService';

import ChildCard from '../../components/parentchild/ChildCard';
import UrgentSOSBanner from '../../components/parentchild/UrgentSOSBanner';
import AddChildModal from '../../components/parentchild/AddChildModal';
import PetItemSection from '../../components/parentchild/PetItemSection';

export default function ParentDashboardScreen() {
  const navigation = useNavigation();

  const [childrenList, setChildrenList] = useState([]);
  const [petsItemsList, setPetsItemsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [kids, tags] = await Promise.all([getChildren(), getPetsAndItems()]);
      setChildrenList(kids);
      setPetsItemsList(tags);
    } catch (err) {
      console.warn('[ParentDashboardScreen] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
  }

  async function handleToggleSOS(child) {
    const newState = !child.sosActive;
    await triggerMockSOS(child.id, newState);
    await loadData();
    if (newState) {
      Alert.alert(
        '🚨 Emergency SOS Triggered',
        `High-priority alert broadcasted for ${child.targetName}! Parent push notification and GPS broadcast activated.`
      );
    } else {
      Alert.alert('✅ SOS Resolved', `Emergency alert for ${child.targetName} marked as safe.`);
    }
  }

  const activeSOSChild = childrenList.find((c) => c.sosActive);

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header Hero */}
        <View style={styles.headerHero}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.heroTitle}>Parental Guardian</Text>
              <Text style={styles.heroSubtitle}>Live Family Safety & Geofencing</Text>
            </View>
            <TouchableOpacity
              style={styles.addChildHeaderBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addChildHeaderBtnText}>+ Add Child</Text>
            </TouchableOpacity>
          </View>

          {/* Offline / Mock Mode Safety Badge */}
          <View style={styles.mockModeBadge}>
            <Text style={styles.mockModeText}>
              🛡️ {USE_MOCK_DATA ? 'Zero-Quota Offline Mode Active (Safe Testing)' : 'Connected to Firestore'}
            </Text>
          </View>
        </View>

        {/* Urgent Emergency SOS Banner if triggered */}
        {activeSOSChild && (
          <UrgentSOSBanner
            activeChild={activeSOSChild}
            onViewLocation={() =>
              navigation.navigate(ROUTES.CHILD_LOCATION, { childId: activeSOSChild.id })
            }
            onResolveSOS={() => handleToggleSOS(activeSOSChild)}
          />
        )}

        {/* Quick Hub Navigation Cards */}
        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate(ROUTES.CHILD_LOCATION)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickEmoji}>🗺️</Text>
            <Text style={styles.quickLabel}>Live Map</Text>
            <Text style={styles.quickSub}>GPS tracking</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate(ROUTES.SAFE_ZONES)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickEmoji}>🛡️</Text>
            <Text style={styles.quickLabel}>Safe Zones</Text>
            <Text style={styles.quickSub}>Geofence rules</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate(ROUTES.CHILD_HISTORY)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickEmoji}>📜</Text>
            <Text style={styles.quickLabel}>History</Text>
            <Text style={styles.quickSub}>Daily timeline</Text>
          </TouchableOpacity>
        </View>

        {/* Linked Children Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Monitored Children ({childrenList.length})</Text>
          <TouchableOpacity onPress={() => setModalVisible(true)}>
            <Text style={styles.linkText}>+ Link New</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Syncing linked children...</Text>
          </View>
        ) : childrenList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>👶</Text>
            <Text style={styles.emptyTitle}>No Children Linked Yet</Text>
            <Text style={styles.emptySub}>
              Link your child's phone with a 6-digit code or create a managed profile to monitor their location.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyBtnText}>+ Add First Child</Text>
            </TouchableOpacity>
          </View>
        ) : (
          childrenList.map((child) => (
            <ChildCard
              key={child.id}
              child={child}
              onPress={() =>
                navigation.navigate(ROUTES.CHILD_LOCATION, { childId: child.id })
              }
              onNavigateLocation={() =>
                navigation.navigate(ROUTES.CHILD_LOCATION, { childId: child.id })
              }
              onNavigateSafeZones={() =>
                navigation.navigate(ROUTES.SAFE_ZONES, { childId: child.id })
              }
              onNavigateHistory={() =>
                navigation.navigate(ROUTES.CHILD_HISTORY, { childId: child.id })
              }
              onToggleSOS={() => handleToggleSOS(child)}
            />
          ))
        )}

        {/* Stretch Feature: BLE Pet & Valuable Trackers */}
        <PetItemSection items={petsItemsList} onRefresh={loadData} />
      </ScrollView>

      {/* Add Child Modal */}
      <AddChildModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={(newChild) => {
          loadData();
          Alert.alert('✅ Child Added', `${newChild.targetName} is now linked to your GuardianCircle.`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  headerHero: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  heroSubtitle: {
    ...TYPOGRAPHY.body2,
    marginTop: 2,
  },
  addChildHeaderBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    ...SHADOWS.small,
  },
  addChildHeaderBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  mockModeBadge: {
    backgroundColor: COLORS.safeGreenLight,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
  },
  mockModeText: {
    fontSize: 11,
    color: COLORS.safeGreen,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
    marginTop: SPACING.xs,
  },
  quickCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  quickSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },
  emptyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  emptyBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
