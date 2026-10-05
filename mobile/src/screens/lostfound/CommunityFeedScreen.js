import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  collection,
  doc,
  updateDoc,
  increment,
  arrayUnion,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const LOW_CONFIDENCE_THRESHOLD = 1;

export default function CommunityFeedScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null); // tracks which report is mid-submit

  async function fetchReports() {
    setLoading(true);
    try {
      const lostQuery = query(
        collection(db, 'reports'),
        where('type', '==', 'lost'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const foundQuery = query(
        collection(db, 'reports'),
        where('type', '==', 'found'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );

      const [lostSnap, foundSnap] = await Promise.all([
        getDocs(lostQuery),
        getDocs(foundQuery),
      ]);

      const combined = [
        ...lostSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        ...foundSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      setReports(combined);
    } catch (error) {
      console.log('Error fetching community reports:', error.message);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [])
  );

  // Checks whether the current user has already confirmed this report,
  // by looking at the confirmedBy list we store on each report doc.
  function hasAlreadyConfirmed(report) {
    return Array.isArray(report.confirmedBy) && report.confirmedBy.includes(user.uid);
  }

  async function handleConfirm(report) {
    // Don't let a user own report or confirm the same report twice.
    if (report.reportedBy === user.uid) {
      Alert.alert('Not allowed', 'You cannot confirm your own report.');
      return;
    }
    if (hasAlreadyConfirmed(report)) {
      Alert.alert('Already confirmed', 'You have already confirmed this report.');
      return;
    }

    setConfirmingId(report.id);
    try {
      const reportRef = doc(db, 'reports', report.id);

      // increment() and arrayUnion() are special Firestore operations
      // that update safely even if two people confirm at the exact
      // same moment (no "lost update" race condition).
      await updateDoc(reportRef, {
        confidenceScore: increment(1),
        confirmedBy: arrayUnion(user.uid),
      });

      // Update the local list immediately so the UI feels instant,
      // instead of waiting for a fresh fetch from Firestore.
      setReports((prevReports) =>
        prevReports.map((r) =>
          r.id === report.id
            ? {
                ...r,
                confidenceScore: (r.confidenceScore || 0) + 1,
                confirmedBy: [...(r.confirmedBy || []), user.uid],
              }
            : r
        )
      );
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setConfirmingId(null);
    }
  }

  const styles = getStyles(colors);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Community Reports</Text>
      <Text style={styles.sub}>Help confirm reports you recognize</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : reports.length === 0 ? (
        <Text style={styles.emptyText}>No reports yet.</Text>
      ) : (
        reports.map((report) => {
          const alreadyConfirmed = hasAlreadyConfirmed(report);
          const isOwnReport = report.reportedBy === user.uid;

          return (
            <View key={report.id} style={styles.reportCard}>
              {report.photoUrl && (
                <Image source={{ uri: report.photoUrl }} style={styles.reportPhoto} />
              )}
              <View style={styles.reportInfo}>
                <View style={styles.reportHeaderRow}>
                  <Text style={styles.reportType}>
                    {report.type === 'lost' ? '🔴 Lost' : '🟢 Found'}
                  </Text>
                  {(report.confidenceScore || 0) <= LOW_CONFIDENCE_THRESHOLD && (
                    <Text style={styles.lowConfidenceBadge}>Low confidence</Text>
                  )}
                </View>
                <Text style={styles.reportDescription} numberOfLines={2}>
                  {report.description}
                </Text>
                <Text style={styles.confidenceText}>
                  Confirmations: {report.confidenceScore || 0}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    (alreadyConfirmed || isOwnReport) && styles.confirmButtonDisabled,
                  ]}
                  onPress={() => handleConfirm(report)}
                  disabled={alreadyConfirmed || isOwnReport || confirmingId === report.id}
                >
                  {confirmingId === report.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmButtonText}>
                      {isOwnReport
                        ? 'This is your report'
                        : alreadyConfirmed
                        ? '✓ Confirmed'
                        : '✓ Confirm this report'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: 14, color: colors.textSecondary, marginBottom: 20 },
  emptyText: { color: colors.textMuted, fontStyle: 'italic', marginTop: 20 },
  reportCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  reportPhoto: { width: '100%', height: 150 },
  reportInfo: { padding: 12 },
  reportHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reportType: { fontWeight: 'bold', fontSize: 14, color: colors.textPrimary },
  lowConfidenceBadge: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#E67E22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  reportDescription: { fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
  confidenceText: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  confirmButton: {
    backgroundColor: colors.safeGreen,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmButtonDisabled: { backgroundColor: colors.textMuted },
  confirmButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});