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
import { ROUTES } from '../../constants/routes';

const LOW_CONFIDENCE_THRESHOLD = 1;

export default function CommunityFeedScreen({ navigation }) {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);

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

  function hasAlreadyConfirmed(report) {
    return Array.isArray(report.confirmedBy) && report.confirmedBy.includes(user.uid);
  }

  async function handleConfirm(report) {
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

      await updateDoc(reportRef, {
        confidenceScore: increment(1),
        confirmedBy: arrayUnion(user.uid),
      });

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Community Reports</Text>
      <Text style={styles.sub}>Help confirm reports you recognize</Text>

      {loading ? (
        <ActivityIndicator color="#E53935" style={{ marginTop: 20 }} />
      ) : reports.length === 0 ? (
        <Text style={styles.emptyText}>No reports yet.</Text>
      ) : (
        reports.map((report) => {
          const alreadyConfirmed = hasAlreadyConfirmed(report);
          const isOwnReport = report.reportedBy === user.uid;

          return (
            // Tapping anywhere on the card (except the Confirm button
            // itself) opens the full status-tracking detail screen.
            <TouchableOpacity
              key={report.id}
              style={styles.reportCard}
              onPress={() =>
                navigation.navigate(ROUTES.LOST_FOUND_DETAIL, {
                  reportId: report.id,
                })
              }
              activeOpacity={0.8}
            >
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
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  sub: { fontSize: 14, color: '#666', marginBottom: 20 },
  emptyText: { color: '#999', fontStyle: 'italic', marginTop: 20 },
  reportCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
    backgroundColor: '#f9f9f9',
  },
  reportPhoto: { width: '100%', height: 150 },
  reportInfo: { padding: 12 },
  reportHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reportType: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  lowConfidenceBadge: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#E67E22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  reportDescription: { fontSize: 14, color: '#444', marginBottom: 6 },
  confidenceText: { fontSize: 12, color: '#888', marginBottom: 10 },
  confirmButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmButtonDisabled: { backgroundColor: '#aaa' },
  confirmButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});