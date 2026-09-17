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
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { uploadImage } from '../../services/cloudinaryService';
import { useAuth } from '../../context/AuthContext';
// NEW: import the automated matching logic we built in Step 1
import { findMatchesForFoundReport } from '../../services/matchingService';

export default function ReportFoundScreen({ navigation }) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [location, setLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [isLinkedToLost, setIsLinkedToLost] = useState(false);
  const [selectedLostReport, setSelectedLostReport] = useState(null);
  const [lostReports, setLostReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function pickImage() {
    // Ask the user for permission before touching their photo gallery
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
      quality: 0.5, // compress before upload, saves Cloudinary bandwidth
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function getCurrentLocation() {
    setGettingLocation(true);
    try {
      // Ask for location permission first
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Location permission is required to tag where you found this item.'
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});

      // Turn the coordinates into a geohash string.
      // A geohash is needed later for the automated matching logic,
      // so we can compare "how close" two locations are.
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

  // Fetches open "lost" reports so the user can manually pick one
  // this found item might belong to (this is the MANUAL linking option).
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

  // Creates one "matches" record in Firestore linking a found report
  // to a candidate lost report. Also marks the lost report as "sighted"
  // so its original reporter can see something may have turned up.
  async function createMatchRecord(lostReportId, foundReportId) {
    await addDoc(collection(db, 'matches'), {
      lostReportId,
      foundReportId,
      status: 'suggested',
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'reports', lostReportId), {
      status: 'sighted',
    });
  }

  async function handleSubmit() {
    if (!description || !location) {
      Alert.alert(
        'Missing information',
        'Please fill in a description and location.'
      );
      return;
    }

    setSubmitting(true);
    try {
      // STEP A: Upload the photo (if the user added one)
      let photoUrl = null;
      if (photoUri) {
        const uploadResult = await uploadImage(photoUri, 'found-items');
        photoUrl = uploadResult.url;
      }

      // STEP B: Save the found report itself to Firestore
      const foundReportData = {
        type: 'found',
        description,
        photoUrl,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        geohash: location.geohash,
        status: 'sighted',
        reportedBy: user.uid,
        confidenceScore: 0,
        createdAt: serverTimestamp(),
      };

      const foundReportRef = await addDoc(
        collection(db, 'reports'),
        foundReportData
      );

      let matchCount = 0;

      // STEP C: Handle matching.
      // Case 1 — the user MANUALLY picked a specific lost report themselves.
      if (isLinkedToLost && selectedLostReport) {
        await createMatchRecord(selectedLostReport.id, foundReportRef.id);
        matchCount = 1;
      } else {
        // Case 2 — the user did NOT manually pick one, so we run the
        // AUTOMATED matching logic (FR-2.3) to suggest likely candidates
        // based on location closeness and description similarity.
        const suggestedMatches = await findMatchesForFoundReport(
          foundReportData,
          3 // only take the top 3 best candidates
        );

        // Create a "suggested" match record for each good candidate found.
        for (const candidate of suggestedMatches) {
          await createMatchRecord(candidate.id, foundReportRef.id);
        }
        matchCount = suggestedMatches.length;
      }

      // STEP D: Let the user know what happened
      if (matchCount > 0) {
        Alert.alert(
          'Success',
          `Your found item report has been submitted. ${matchCount} possible match(es) found!`
        );
      } else {
        Alert.alert(
          'Success',
          'Your found item report has been submitted. No matching lost reports found yet.'
        );
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
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

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Found Report</Text>
        )}
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
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});