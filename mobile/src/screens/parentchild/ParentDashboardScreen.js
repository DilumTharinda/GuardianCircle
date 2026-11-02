import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { ROUTES } from '../../constants/routes';
import {
  getChildren,
  getPetsAndItems,
  triggerMockSOS,
  resolveChildSOS,
  unlinkChild,
  USE_MOCK_DATA,
} from '../../services/parentChildService';

import ChildCard from '../../components/parentchild/ChildCard';
import UrgentSOSBanner from '../../components/parentchild/UrgentSOSBanner';
import AddChildModal from '../../components/parentchild/AddChildModal';
import ChildDeviceModal from '../../components/parentchild/ChildDeviceModal';
import PetItemSection from '../../components/parentchild/PetItemSection';

export default function ParentDashboardScreen() {
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const { colors } = useTheme();

  const [childrenList, setChildrenList] = useState([]);
  const [petsItemsList, setPetsItemsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'children' | 'pets'
  const [modalVisible, setModalVisible] = useState(false);
  const [childDeviceVisible, setChildDeviceVisible] = useState(false);
  const [selectedDeviceChild, setSelectedDeviceChild] = useState(null);

  // Entrance Animations
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      })
    ]).start();
  }, [fadeAnim, slideAnim]);

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

  // Periodic polling every 4 seconds to sync live child location, check-ins, and SOS alerts
  useEffect(() => {
    const timer = setInterval(() => {
      loadData();
    }, 4000);
    return () => clearInterval(timer);
  }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
  }

  async function handleToggleSOS(child) {
    if (child.sosActive) {
      await resolveChildSOS(child.id);
      Alert.alert('SOS Resolved', `Emergency alert cleared for ${child.targetName}.`);
    } else {
      await triggerMockSOS(child.id);
      Alert.alert('🚨 Mock SOS Active', `Emergency triggered for ${child.targetName}!`);
    }
    await loadData();
  }

  function handleOpenChildDevice(child) {
    setSelectedDeviceChild(child);
    setChildDeviceVisible(true);
  }

  async function handleUnlinkChild(child) {
    Alert.alert(
      'Unlink Child',
      `Are you sure you want to remove ${child.targetName} from your dashboard?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            await unlinkChild(child.id);
            await loadData();
            Alert.alert('Unlinked', `${child.targetName} has been unlinked.`);
          },
        },
      ]
    );
  }

  const activeSOSChild = childrenList.find((c) => c.sosActive);
  const styles = getStyles(colors);

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        ref={scrollRef}
        style={[
          styles.container,
          Platform.OS === 'web' && { height: '100vh', overflowY: 'auto' },
        ]}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
            Platform.OS !== 'web' ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            ) : undefined
        }
        showsVerticalScrollIndicator={true}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
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
            <Ionicons name={USE_MOCK_DATA ? "flask" : "cloud-done"} size={14} color={colors.safeGreen} style={{ marginRight: 4 }} />
            <Text style={styles.mockModeText}>
              {USE_MOCK_DATA ? 'Zero-Quota Offline Mode Active' : 'Live Firebase Connection Active'}
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
            <Ionicons name="map-outline" size={28} color={colors.darkGreenMid} style={{ marginBottom: 6 }} />
            <Text style={styles.quickLabel}>Live Map</Text>
            <Text style={styles.quickSub}>GPS tracking</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate(ROUTES.SAFE_ZONES)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="shield-home-outline" size={28} color={colors.darkGreenMid} style={{ marginBottom: 6 }} />
            <Text style={styles.quickLabel}>Safe Zones</Text>
            <Text style={styles.quickSub}>Geofence rules</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate(ROUTES.CHILD_HISTORY)}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={28} color={colors.darkGreenMid} style={{ marginBottom: 6 }} />
            <Text style={styles.quickLabel}>History</Text>
            <Text style={styles.quickSub}>Daily timeline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, activeTab === 'pets' && styles.quickCardActive]}
            onPress={() => setActiveTab(activeTab === 'pets' ? 'all' : 'pets')}
            activeOpacity={0.7}
          >
            <Text style={styles.quickEmoji}>🐾</Text>
            <Text style={styles.quickLabel}>Pet Tags</Text>
            <Text style={styles.quickSub}>BLE Beacons</Text>
          </TouchableOpacity>
        </View>

        {/* Category Tabs: All / Children / Pets */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>
              📋 All ({childrenList.length + petsItemsList.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'children' && styles.tabBtnActive]}
            onPress={() => setActiveTab('children')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabBtnText, activeTab === 'children' && styles.tabBtnTextActive]}>
              👶 Children ({childrenList.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'pets' && styles.tabBtnActive]}
            onPress={() => setActiveTab('pets')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabBtnText, activeTab === 'pets' && styles.tabBtnTextActive]}>
              🐾 Pets & Valuables ({petsItemsList.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Linked Children Section (shown if activeTab is 'all' or 'children') */}
        {(activeTab === 'all' || activeTab === 'children') && (
          <>
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
                  onOpenChildDevice={() => handleOpenChildDevice(child)}
                  onUnlink={() => handleUnlinkChild(child)}
                  onToggleSOS={() => handleToggleSOS(child)}
                />
              ))
            )}
          </>
        )}

{/* Stretch Feature: BLE Pet & Valuable Trackers */}
{(activeTab === 'all' || activeTab === 'pets') && (
  <PetItemSection
    items={petsItemsList}
    onRefresh={loadData}
  />
)}
</Animated.View>
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

      {/* Child Device Interface Modal for Child-Side Flow (FR-4.4) */}
      <ChildDeviceModal
        visible={childDeviceVisible}
        child={selectedDeviceChild}
        onClose={() => {
          setChildDeviceVisible(false);
          setSelectedDeviceChild(null);
          loadData();
        }}
        onStateChange={loadData}
      />
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  headerHero: {
    backgroundColor: colors.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTitle: {
    ...TYPOGRAPHY.h2,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    ...TYPOGRAPHY.body2,
    marginTop: 2,
  },
  addChildHeaderBtn: {
    backgroundColor: colors.primary,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.safeGreenLight,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
  },
  mockModeText: {
    fontSize: 11,
    color: colors.safeGreen,
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
    color: colors.textPrimary,
  },
  linkText: {
    color: colors.primary,
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
    backgroundColor: colors.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  quickSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  quickCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#FFF0F0',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECEFF1',
    borderRadius: RADIUS.md,
    padding: 4,
    marginBottom: SPACING.lg,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: COLORS.card,
    ...SHADOWS.small,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },
  emptyBtn: {
    backgroundColor: colors.primary,
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
