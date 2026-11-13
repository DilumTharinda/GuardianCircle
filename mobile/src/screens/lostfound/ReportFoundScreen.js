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
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { uploadImage } from '../../services/cloudinaryService';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { findMatchesForFoundReport } from '../../services/matchingService';
import { RADIUS, SHADOWS } from '../../constants/theme';

const CATEGORIES = ['Electronics', 'Documents', 'Pet', 'Bag', 'Jewelry', 'Other'];

export default function ReportFoundScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [location, setLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [isLinkedToLost, setIsLinkedToLost] = useState(false);
  const [selectedLostReport, setSelectedLostReport] = useState(null);
  const [lostReports, setLostReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function pickImage() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission needed', 'We need access to your photos to attach an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 || null);
    }
  }

  async function getCurrentLocation() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required to tag where you found this item.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const geohash = ngeohash.encode(loc.coords.latitude, loc.coords.longitude);

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
      // Query without requiring composite index
      const q = query(
        collection(db, 'reports'),
        where('type', '==', 'lost'),
        where('status', '==', 'lost'),
        limit(30)
      );
      const snapshot = await getDocs(q);
      const reports = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

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

  async function createMatchRecord(lostReport, foundReportId) {
    await addDoc(collection(db, 'matches'), {
      lostReportId: lostReport.id,
      foundReportId,
      lostReporterId: lostReport.reportedBy,
      foundReporterId: user.uid,
      status: 'suggested',
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'reports', lostReport.id), {
      status: 'sighted',
    });
  }

  async function handleSubmit() {
    if (!description || !location) {
      Alert.alert('Missing information', 'Please fill in description and location.');
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl = null;
      if (photoBase64) {
        try {
          const uploadResult = await uploadImage(`data:image/jpeg;base64,${photoBase64}`, 'found-items');
          photoUrl = uploadResult.url;
        } catch (uploadErr) {
          console.warn('[ReportFoundScreen] Image upload warning:', uploadErr.message);
        }
      } else if (photoUri) {
        try {
          const uploadResult = await uploadImage(photoUri, 'found-items');
          photoUrl = uploadResult.url;
        } catch (uploadErr) {
          console.warn('[ReportFoundScreen] Image upload warning:', uploadErr.message);
        }
      }

      const newReportData = {
        type: 'found',
        category: category || selectedLostReport?.category || 'General',
        description,
        photoUrl,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        geohash: location.geohash,
        status: 'found',
        reportedBy: user.uid,
        confidenceScore: 0,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'reports'), newReportData);

      if (isLinkedToLost && selectedLostReport) {
        await createMatchRecord(selectedLostReport, docRef.id);
      } else {
        await findMatchesForFoundReport({ id: docRef.id, ...newReportData });
      }

      Alert.alert('Success', 'Your found item report has been published to the community.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const styles = getStyles(colors, isDark);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Report a Found Item</Text>
      <Text style={styles.sub}>Help locate and return discovered items to their rightful owners</Text>

      {/* Category selection */}
      <Text style={styles.label}>Item Category</Text>
      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => {
          const isSelected = category === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
              onPress={() => setCategory(cat)}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Description */}
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.textArea}
        placeholder="Color, brand, where found, condition..."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={setDescription}
      />

      {/* Photo Picker */}
      <Text style={styles.label}>Photo (Optional)</Text>
      <TouchableOpacity style={styles.photoBox} onPress={pickImage} activeOpacity={0.8}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="camera-outline" size={32} color={colors.darkGreenMid} />
            <Text style={styles.photoBoxText}>Tap to upload a photo</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Location */}
      <Text style={styles.label}>Found Location</Text>
      <TouchableOpacity
        style={styles.locationBox}
        onPress={getCurrentLocation}
        disabled={gettingLocation}
        activeOpacity={0.8}
      >
        <Ionicons
          name="navigate-circle-outline"
          size={24}
          color={location ? colors.safeGreen : colors.darkGreenMid}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.locationBoxTitle}>
            {gettingLocation
              ? 'Acquiring GPS location...'
              : location
              ? 'Location Tagged Successfully'
              : 'Tag Found Location'}
          </Text>
          <Text style={styles.locationBoxSubtitle}>
            {location
              ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
              : 'Tap to attach GPS coordinates where item was discovered'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Link to existing lost report toggle */}
      <TouchableOpacity style={styles.linkToggle} onPress={toggleLinkToLost} activeOpacity={0.8}>
        <View style={[styles.checkbox, isLinkedToLost && styles.checkboxChecked]}>
          {isLinkedToLost && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
        <Text style={styles.linkToggleText}>I am responding to an existing lost item report</Text>
      </TouchableOpacity>

      {isLinkedToLost && (
        <View style={styles.reportsListContainer}>
          <Text style={styles.label}>Select Matching Lost Report:</Text>
          {loadingReports ? (
            <ActivityIndicator color={colors.darkGreenMid} style={{ marginVertical: 10 }} />
          ) : lostReports.length === 0 ? (
            <Text style={styles.noReportsText}>No active lost reports found.</Text>
          ) : (
            lostReports.map((report) => (
              <TouchableOpacity
                key={report.id}
                style={[
                  styles.reportItem,
                  selectedLostReport?.id === report.id && styles.reportItemSelected,
                ]}
                onPress={() => setSelectedLostReport(report)}
                activeOpacity={0.75}
              >
                <View style={styles.reportItemHeader}>
                  <Text style={styles.reportItemCategory}>{report.category || 'Item'}</Text>
                  {selectedLostReport?.id === report.id && (
                    <Ionicons name="checkmark-circle" size={16} color={colors.safeGreen} />
                  )}
                </View>
                <Text style={styles.reportItemDescription} numberOfLines={2}>
                  {report.description}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.submitButtonText}>Publish Found Report</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 18, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
    sub: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginTop: 14, marginBottom: 8 },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: 6,
    },
    categoryChipSelected: {
      backgroundColor: isDark ? colors.darkGreenSurface : '#E0F2F1',
      borderColor: colors.darkGreenMid,
    },
    categoryText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
    categoryTextSelected: { color: colors.darkGreenMid, fontWeight: '700' },
    textArea: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 14,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      textAlignVertical: 'top',
      minHeight: 100,
    },
    photoBox: {
      height: 140,
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: RADIUS.xl,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    photoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    photoBoxText: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
    photoPreview: { width: '100%', height: '100%' },
    locationBox: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.surface,
      gap: 12,
      ...SHADOWS.small,
    },
    locationBoxTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    locationBoxSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    linkToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 20,
      padding: 4,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderWidth: 2,
      borderColor: colors.darkGreenMid,
      borderRadius: 6,
      marginRight: 10,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    checkboxChecked: { backgroundColor: colors.darkGreenMid },
    linkToggleText: { fontSize: 13, color: colors.textPrimary, flex: 1, fontWeight: '500' },
    reportsListContainer: { marginTop: 10 },
    noReportsText: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
    reportItem: {
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      marginBottom: 8,
      backgroundColor: colors.surface,
    },
    reportItemSelected: {
      borderColor: colors.darkGreenMid,
      backgroundColor: isDark ? colors.darkGreenSurface : '#E8F5E9',
    },
    reportItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    reportItemCategory: { fontWeight: '700', color: colors.textPrimary, fontSize: 13 },
    reportItemDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
    submitButton: {
      backgroundColor: colors.darkGreenMid,
      borderRadius: RADIUS.lg,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 26,
      ...SHADOWS.medium,
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  });
