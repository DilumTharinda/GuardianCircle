import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';

export default function LostFoundScreen({ navigation }) {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Loads matches where the current user is EITHER the lost-item
  // reporter OR the found-item reporter. Firestore can't check two
  // different fields for "equals my ID" in a single query, so we run
  // two small queries (each capped at 10 reads) and merge the results
  // ourselves — this keeps total reads low and predictable.
  async function fetchMyMatches() {
    setLoadingMatches(true);
    try {
      const asLostReporter = query(
        collection(db, 'matches'),
        where('lostReporterId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const asFoundReporter = query(
        collection(db, 'matches'),
        where('foundReporterId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );

      const [lostSnap, foundSnap] = await Promise.all([
        getDocs(asLostReporter),
        getDocs(asFoundReporter),
      ]);

      const merged = new Map();
      lostSnap.docs.forEach((doc) => merged.set(doc.id, { id: doc.id, ...doc.data() }));
      foundSnap.docs.forEach((doc) => merged.set(doc.id, { id: doc.id, ...doc.data() }));

      const sortedMatches = Array.from(merged.values())
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 10);

      setMatches(sortedMatches);
    } catch (error) {
      console.log('Error fetching matches:', error.message);
    } finally {
      setLoadingMatches(false);
    }
  }

  // Refresh the matches list every time this screen comes into view
  // (e.g. after submitting a new report that created a match).
  useFocusEffect(
    useCallback(() => {
      fetchMyMatches();
    }, [user])
  );

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

      <Text style={styles.sectionTitle}>My Matches</Text>

      {loadingMatches ? (
        <ActivityIndicator color="#E53935" style={{ marginTop: 10 }} />
      ) : matches.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>No matches yet</Text>
        </View>
      ) : (
        matches.map((match) => (
          <TouchableOpacity
            key={match.id}
            style={styles.matchItem}
            onPress={() =>
              navigation.navigate(ROUTES.MATCH_CHAT, { matchId: match.id })
            }
          >
            <Text style={styles.matchStatus}>Status: {match.status}</Text>
            <Text style={styles.matchOpenChat}>Tap to open chat →</Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E53935',
    marginBottom: 4,
    textAlign: 'center',
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
    alignItems: 'center',
    marginBottom: 12,
  },
  reportButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  foundButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  foundButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  placeholder: {
    width: '100%',
    height: 100,
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
  matchItem: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
    marginBottom: 10,
  },
  matchStatus: { fontWeight: '600', color: '#333', marginBottom: 4 },
  matchOpenChat: { color: '#2E7D32', fontSize: 13 },
});