import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

const STAGES = [
  { key: 'lost', label: 'Lost / Missing' },
  { key: 'sighted', label: 'Sighted / Matched' },
  { key: 'reunited', label: 'Reunited / Returned' },
];

function getStageIndex(status) {
  const index = STAGES.findIndex((stage) => stage.key === status);
  return index === -1 ? 0 : index;
}

export default function LostFoundDetailScreen({ route }) {
  const { reportId } = route.params;
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const reportRef = doc(db, 'reports', reportId);

    const unsubscribe = onSnapshot(reportRef, (docSnap) => {
      if (docSnap.exists()) {
        setReport({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [reportId]);

  // Lets the person who originally filed this report mark it as
  // resolved once the item/pet has actually been returned to them.
  // This is also the moment (used later, in Part 7) that karma
  // points get awarded to whoever helped.
  async function handleMarkReunited() {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'reunited',
      });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#E53935" size="large" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Report not found.</Text>
      </View>
    );
  }

  const currentStageIndex = getStageIndex(report.status);
  const isOwner = report.reportedBy === user.uid;
  const alreadyReunited = report.status === 'reunited';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {report.photoUrl && (
        <Image source={{ uri: report.photoUrl }} style={styles.photo} />
      )}

      <Text style={styles.typeLabel}>
        {report.type === 'lost' ? '🔴 Lost Item' : '🟢 Found Item'}
      </Text>
      {report.category && <Text style={styles.category}>{report.category}</Text>}
      <Text style={styles.description}>{report.description}</Text>

      <Text style={styles.timelineTitle}>Status</Text>

      <View style={styles.timeline}>
        {STAGES.map((stage, index) => {
          const isCompleted = index <= currentStageIndex;
          const isCurrent = index === currentStageIndex;

          return (
            <View key={stage.key} style={styles.timelineRow}>
              <View style={styles.timelineIndicatorColumn}>
                <View
                  style={[
                    styles.timelineDot,
                    isCompleted && styles.timelineDotCompleted,
                    isCurrent && styles.timelineDotCurrent,
                  ]}
                />
                {index < STAGES.length - 1 && (
                  <View
                    style={[
                      styles.timelineLine,
                      index < currentStageIndex && styles.timelineLineCompleted,
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.timelineLabel,
                  isCurrent && styles.timelineLabelCurrent,
                ]}
              >
                {stage.label}
                {isCurrent ? '  (current)' : ''}
              </Text>
            </View>
          );
        })}
      </View>

      {isOwner && !alreadyReunited && (
        <TouchableOpacity
          style={styles.reunitedButton}
          onPress={handleMarkReunited}
          disabled={updating}
        >
          {updating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.reunitedButtonText}>
              ✓ Mark as Reunited / Returned
            </Text>
          )}
        </TouchableOpacity>
      )}

      {isOwner && alreadyReunited && (
        <View style={styles.reunitedBanner}>
          <Text style={styles.reunitedBannerText}>
            🎉 This item has been reunited!
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notFoundText: { color: '#999', fontSize: 15 },
  photo: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  typeLabel: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  category: { fontSize: 14, color: '#888', marginBottom: 8 },
  description: { fontSize: 15, color: '#444', marginBottom: 24, lineHeight: 22 },
  timelineTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 14 },
  timeline: { paddingLeft: 4, marginBottom: 20 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineIndicatorColumn: { alignItems: 'center', width: 24 },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  timelineDotCompleted: { borderColor: '#2E7D32', backgroundColor: '#2E7D32' },
  timelineDotCurrent: { borderColor: '#E53935', backgroundColor: '#E53935' },
  timelineLine: { width: 2, flex: 1, minHeight: 30, backgroundColor: '#ccc' },
  timelineLineCompleted: { backgroundColor: '#2E7D32' },
  timelineLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    marginBottom: 26,
  },
  timelineLabelCurrent: { color: '#E53935', fontWeight: 'bold' },
  reunitedButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reunitedButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  reunitedBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  reunitedBannerText: { color: '#2E7D32', fontWeight: 'bold', fontSize: 14 },
});