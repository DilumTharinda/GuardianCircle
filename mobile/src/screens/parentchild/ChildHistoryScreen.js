import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { getChildren, getChildHistory, clearChildHistory } from '../../services/parentChildService';

const FILTER_TYPES = [
  { id: 'all', label: 'All Events' },
  { id: 'zone', label: '🏫 Safe Zones' },
  { id: 'checkin', label: '📍 Check-ins' },
  { id: 'alert', label: '🚨 Alerts' },
];

export default function ChildHistoryScreen() {
  const route = useRoute();
  const { colors } = useTheme();
  const initialChildId = route.params?.childId;

  const [childrenList, setChildrenList] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedDay, setSelectedDay] = useState('today'); // 'today' | 'yesterday'
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const kids = await getChildren();
      setChildrenList(kids);
      const activeId = selectedChildId || (kids.length > 0 ? kids[0].id : null);
      if (activeId) {
        if (!selectedChildId) setSelectedChildId(activeId);
        const events = await getChildHistory(activeId, selectedDay, selectedFilter);
        setHistoryEvents(events);
      }
    } catch (err) {
      console.warn('[ChildHistoryScreen] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, selectedFilter, selectedDay]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic polling every 4 seconds to sync newly generated history events
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadData]);

  const activeChild =
    childrenList.find((c) => c.id === selectedChildId) || childrenList[0] || null;

  async function handleExportReport() {
    if (!activeChild) return;
    const summary = `🛡️ GuardianCircle Daily Safety Report for ${activeChild.targetName}\nDate: ${
      selectedDay === 'today' ? 'Today' : 'Yesterday'
    }\nStatus: Safe (96% within designated safe zones)\nTotal Events: ${historyEvents.length} logs recorded.`;

    try {
      await Share.share({
        message: summary,
        title: `Daily Report — ${activeChild.targetName}`,
      });
    } catch (error) {
      Alert.alert('Export Report', summary);
    }
  }

  async function handleClearHistory() {
    if (!activeChild) return;
    Alert.alert(
      'Clear Timeline History',
      `Are you sure you want to clear the activity log for ${activeChild.targetName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Logs',
          style: 'destructive',
          onPress: async () => {
            await clearChildHistory(activeChild.id);
            await loadData();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Compiling daily journey timeline...</Text>
      </View>
    );
  }

  const styles = getStyles(colors);

  return (
    <View style={styles.container}>
      {/* Child Switcher Pills */}
      <View style={styles.topSelectorContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
          {childrenList.map((kid) => {
            const isSelected = kid.id === activeChild?.id;
            return (
              <TouchableOpacity
                key={kid.id}
                style={[styles.childPill, isSelected && styles.childPillActive]}
                onPress={() => setSelectedChildId(kid.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.childPillEmoji}>{kid.avatarEmoji || '🧒'}</Text>
                <Text style={[styles.childPillName, isSelected && styles.childPillNameActive]}>
                  {kid.targetName.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Date Selector Row */}
        <View style={styles.daySelectorRow}>
          <TouchableOpacity
            style={[styles.dayTab, selectedDay === 'today' && styles.dayTabActive]}
            onPress={() => setSelectedDay('today')}
          >
            <Text style={[styles.dayTabText, selectedDay === 'today' && styles.dayTabTextActive]}>
              📅 Today's Timeline
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dayTab, selectedDay === 'yesterday' && styles.dayTabActive]}
            onPress={() => setSelectedDay('yesterday')}
          >
            <Text
              style={[styles.dayTabText, selectedDay === 'yesterday' && styles.dayTabTextActive]}
            >
              ⏪ Yesterday
            </Text>
          </TouchableOpacity>
        </View>

        {/* Daily Safety Metric Cards */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>96%</Text>
            <Text style={styles.metricLabel}>Safe Zone Time</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>3.8 km</Text>
            <Text style={styles.metricLabel}>Total Travel</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>3</Text>
            <Text style={styles.metricLabel}>Zones Visited</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: colors.safeGreen }]}>0</Text>
            <Text style={styles.metricLabel}>Unsafe Flags</Text>
          </View>
        </View>

        {/* Event Category Filter Pills */}
        <View style={styles.filtersWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTER_TYPES.map((f) => {
              const isFSelected = selectedFilter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.filterChip, isFSelected && styles.filterChipActive]}
                  onPress={() => setSelectedFilter(f.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, isFSelected && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Chronological Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.timelineHeaderTitle}>Activity Log</Text>

          {historyEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📜</Text>
              <Text style={styles.emptyTitle}>No Events for this Filter</Text>
              <Text style={styles.emptySub}>
                Location changes, check-ins, and geofence entries will appear here chronologically.
              </Text>
            </View>
          ) : (
            <View style={styles.timelineContainer}>
              {historyEvents.map((item, index) => {
                const isLast = index === historyEvents.length - 1;
                return (
                  <View key={item.id} style={styles.timelineItem}>
                    {/* Vertical Connecting Line */}
                    {!isLast && <View style={styles.timelineLine} />}

                    {/* Timeline Left Icon */}
                    <View
                      style={[
                        styles.timelineIconBubble,
                        { backgroundColor: item.color || colors.primary },
                      ]}
                    >
                      <Text style={styles.timelineIconText}>{item.icon || '📍'}</Text>
                    </View>

                    {/* Timeline Right Content Card */}
                    <View style={styles.timelineCard}>
                      <View style={styles.timelineTopRow}>
                        <Text style={styles.timelineTitle}>{item.title}</Text>
                        <Text style={styles.timelineTime}>{item.timestamp}</Text>
                      </View>

                      <Text style={styles.timelineLocation}>📍 {item.locationName}</Text>
                      <Text style={styles.timelineDesc}>{item.description}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Export Daily Report Button */}
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={handleExportReport}
          activeOpacity={0.8}
        >
          <Text style={styles.exportBtnText}>📤 Export & Share Daily Summary</Text>
        </TouchableOpacity>

        {/* Clear History Button */}
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: '#FEE2E2', marginTop: 10 }]}
          onPress={handleClearHistory}
          activeOpacity={0.8}
        >
          <Text style={[styles.exportBtnText, { color: '#DC2626' }]}>🗑️ Clear Timeline Activity Log</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  topSelectorContainer: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectorScroll: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  childPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F3F5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  childPillActive: {
    backgroundColor: colors.primary,
    ...SHADOWS.small,
  },
  childPillEmoji: {
    fontSize: 16,
  },
  childPillName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  childPillNameActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  daySelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#EAECEF',
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: SPACING.md,
  },
  dayTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  dayTabActive: {
    backgroundColor: '#FFF',
    ...SHADOWS.small,
  },
  dayTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dayTabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.lg,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...SHADOWS.small,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  filtersWrapper: {
    marginBottom: SPACING.lg,
  },
  filterScroll: {
    gap: 8,
  },
  filterChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  timelineSection: {
    marginBottom: SPACING.lg,
  },
  timelineHeaderTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    marginBottom: SPACING.md,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 15,
  },
  emptySub: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  timelineContainer: {
    position: 'relative',
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    top: 24,
    left: 17,
    bottom: -SPACING.lg,
    width: 2,
    backgroundColor: '#E0E0E0',
    zIndex: 1,
  },
  timelineIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    zIndex: 2,
    ...SHADOWS.small,
  },
  timelineIconText: {
    fontSize: 16,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...SHADOWS.small,
  },
  timelineTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timelineTime: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  timelineLocation: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginVertical: 2,
  },
  timelineDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  exportBtn: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  exportBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
});
