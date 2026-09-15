import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import ngeohash from 'ngeohash';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function ReportFoundScreen({ navigation }) {
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [location, setLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [isLinkedToLost, setIsLinkedToLost] = useState(false);
  const [selectedLostReport, setSelectedLostReport] = useState(null);
  const [lostReports, setLostReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);

  async function pickImage() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        'Permission needed',
        'We need access to your photos to attach an image.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function getCurrentLocation() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Location permission is required to tag where you found this item.'
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const geohash = ngeohash.encode(
        loc.coords.latitude,
        loc.coords.longitude
      );

      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        geohash,
      });
    } catch (error) {
      Alert.alert('Error', 'Could not get your location. Please try again.');
    } finally {
      setGettingLocation(false);
    }
  }

  async function fetchLostReports() {
    setLoadingReports(true);
    try {
      const q = query(
        collection(db, 'reports'),
        where('type', '==', 'lost'),
        where('status', '==', 'lost'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const reports = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLostReports(reports);
    } catch (error) {
      console.log('Error fetching lost reports:', error.message);
    } finally {
      setLoadingReports(false);
    }
  }

  function toggleLinkToLost() {
    const newValue = !isLinkedToLost;
    setIsLinkedToLost(newValue);
    if (newValue && lostReports.length === 0) {
      fetchLostReports();
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Report a Found Item</Text>

      <Text style={styles.label}>Description / Notes</Text>
      <TextInput
        style={styles.textArea}
        placeholder="Describe what you found, where, and when..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>Photo (optional)</Text>
      <TouchableOpacity style={styles.photoBox} onPress={pickImage}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : (
          <Text style={styles.photoBoxText}>+ Add Photo</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Location</Text>
      <TouchableOpacity style={styles.locationBox} onPress={getCurrentLocation}>
        <Text style={styles.locationBoxText}>
          {gettingLocation
            ? 'Getting location...'
            : location
            ? `📍 ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
            : '📍 Tap to set location'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkToggle} onPress={toggleLinkToLost}>
        <View style={[styles.checkbox, isLinkedToLost && styles.checkboxChecked]}>
          {isLinkedToLost && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.linkToggleText}>
          This matches an existing lost item report
        </Text>
      </TouchableOpacity>

      {isLinkedToLost && (
        <View style={styles.reportsListContainer}>
          {loadingReports ? (
            <ActivityIndicator color="#2E7D32" style={{ marginVertical: 10 }} />
          ) : lostReports.length === 0 ? (
            <Text style={styles.noReportsText}>No open lost reports found.</Text>
          ) : (
            lostReports.map((report) => (
              <TouchableOpacity
                key={report.id}
                style={[
                  styles.reportItem,
                  selectedLostReport?.id === report.id && styles.reportItemSelected,
                ]}
                onPress={() => setSelectedLostReport(report)}
              >
                <Text style={styles.reportItemCategory}>{report.category}</Text>
                <Text style={styles.reportItemDescription} numberOfLines={2}>
                  {report.description}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <TouchableOpacity style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Submit Found Report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#2E7D32' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8 },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  photoBox: {
    height: 150,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    overflow: 'hidden',
  },
  photoBoxText: { color: '#999', fontSize: 15 },
  photoPreview: { width: '100%', height: '100%', borderRadius: 12 },
  locationBox: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
  },
  locationBoxText: { color: '#666', fontSize: 14 },
  linkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#2E7D32',
    borderRadius: 5,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: '#2E7D32' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  linkToggleText: { fontSize: 14, color: '#333', flex: 1 },
  reportsListContainer: { marginTop: 10 },
  noReportsText: { color: '#999', fontSize: 13, fontStyle: 'italic' },
  reportItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
  },
  reportItemSelected: { borderColor: '#2E7D32', backgroundColor: '#E8F5E9' },
  reportItemCategory: { fontWeight: '600', color: '#333', marginBottom: 4 },
  reportItemDescription: { color: '#666', fontSize: 13 },
  submitButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 30,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});