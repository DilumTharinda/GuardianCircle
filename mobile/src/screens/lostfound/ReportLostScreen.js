import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import ngeohash from 'ngeohash';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { uploadImage } from '../../services/cloudinaryService';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RADIUS, SHADOWS } from '../../constants/theme';

const CATEGORIES = ['Electronics', 'Documents', 'Pet', 'Bag', 'Jewelry', 'Other'];

export default function ReportLostScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [location, setLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
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
        Alert.alert('Permission needed', 'Location permission is required to tag the item.');
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

  async function handleSubmit() {
    if (!category || !description || !location) {
      Alert.alert('Missing information', 'Please fill in category, description, and location.');
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl = null;
      if (photoBase64) {
        try {
          const uploadResult = await uploadImage(`data:image/jpeg;base64,${photoBase64}`, 'lost-items');
          photoUrl = uploadResult.url;
        } catch (uploadErr) {
          console.warn('[ReportLostScreen] Image upload warning:', uploadErr.message);
        }
      } else if (photoUri) {
        try {
          const uploadResult = await uploadImage(photoUri, 'lost-items');
          photoUrl = uploadResult.url;
        } catch (uploadErr) {
          console.warn('[ReportLostScreen] Image upload warning:', uploadErr.message);
        }
      }

      await addDoc(collection(db, 'reports'), {
        type: 'lost',
        category,
        description,
        photoUrl,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        geohash: location.geohash,
        status: 'lost',
        reportedBy: user.uid,
        confidenceScore: 0,
        createdAt: serverTimestamp(),
      });

      Alert.alert('Success', 'Your lost item report has been published to the community.');
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
      <Text style={styles.title}>Report a Lost Item</Text>
      <Text style={styles.sub}>Publish details to alert nearby community members</Text>

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
        placeholder="Color, brand, identifying marks, where you last had it..."
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
      <Text style={styles.label}>Last Known Location</Text>
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
              : 'Tag Current Location'}
          </Text>
          <Text style={styles.locationBoxSubtitle}>
            {location
              ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
              : 'Tap to attach your current GPS coordinates'}
          </Text>
        </View>
      </TouchableOpacity>

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
          <Text style={styles.submitButtonText}>Publish Lost Report</Text>
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
