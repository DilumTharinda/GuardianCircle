import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  Platform,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import ngeohash from 'ngeohash';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { uploadImage } from '../../services/cloudinaryService';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { getForegroundLocationSnapshot, DEFAULT_COORDS } from '../../services/locationService';
import { CIRCLE_FIND_COLLECTION, resolveReadableAddress, showToast } from '../../services/circleFindService';
import Toast from '../../components/common/Toast';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

let MapView = null;
let Marker = null;
if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
  } catch (_) {}
}

const CATEGORIES = [
  { key: 'Child', label: 'Missing Child', icon: 'child-care', urgent: true },
  { key: 'Pet', label: 'Pet / Animal', icon: 'pets' },
  { key: 'Electronics', label: 'Electronics', icon: 'devices' },
  { key: 'Bag', label: 'Bag / Wallet', icon: 'shopping-bag' },
  { key: 'Documents', label: 'Documents / ID', icon: 'badge' },
  { key: 'Keys', label: 'Keys', icon: 'vpn-key' },
  { key: 'Jewelry', label: 'Jewelry', icon: 'watch' },
  { key: 'Other', label: 'Other Item', icon: 'category' },
];

export default function CircleFindReportScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();

  // Mandatory Form States
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [contactDetails, setContactDetails] = useState('');

  // Optional Media States
  const [photoUri, setPhotoUri] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);

  // Location States
  const [location, setLocation] = useState(null); // { latitude, longitude, addressName, geohash }
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [tempCoords, setTempCoords] = useState(null);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [isSearchingMap, setIsSearchingMap] = useState(false);
  const mapRef = useRef(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill user contact phone if available from profile
  useEffect(() => {
    if (userProfile?.phoneNumber && !contactDetails) {
      setContactDetails(userProfile.phoneNumber);
    }
  }, [userProfile]);

  // Photo handlers: Camera & Gallery with Resize and Crop (allowsEditing: true)
  async function pickFromGallery() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast('Photo library permission is required to choose an image', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.75,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setPhotoUri(result.assets[0].uri);
        setPhotoBase64(result.assets[0].base64 || null);
        showToast('Photo cropped & attached');
      }
    } catch (e) {
      showToast('Could not open gallery: ' + e.message, 'error');
    }
  }

  async function takePhotoWithCamera() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showToast('Camera permission is required to take a photo', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.75,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setPhotoUri(result.assets[0].uri);
        setPhotoBase64(result.assets[0].base64 || null);
        showToast('Photo captured & cropped');
      }
    } catch (e) {
      showToast('Could not open camera: ' + e.message, 'error');
    }
  }

  // Quick GPS Location Fetch
  async function handleUseCurrentGPS() {
    setGettingLocation(true);
    try {
      const coords = await getForegroundLocationSnapshot();
      if (!coords) {
        showToast('Unable to retrieve GPS location. Please check settings.');
        return;
      }
      const gh = ngeohash.encode(coords.latitude, coords.longitude);
      let addressLabel = 'Nearby Location';
      try {
        const rev = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        if (rev && rev[0]) {
          const item = rev[0];
          const locality = item.city || item.subregion || item.name || '';
          const district = item.district || item.region || '';
          addressLabel = [locality, district].filter(Boolean).join(', ') || 'Nearby Location';
        }
      } catch (_) {}

      setLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        geohash: gh,
        addressName: addressLabel,
      });
      showToast(`Location tagged: ${addressLabel}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setGettingLocation(false);
    }
  }

  // Open Map Picker
  async function handleOpenMapPicker() {
    let initialLat = location?.latitude || DEFAULT_COORDS.latitude;
    let initialLng = location?.longitude || DEFAULT_COORDS.longitude;
    try {
      const snap = await getForegroundLocationSnapshot();
      if (snap) {
        initialLat = snap.latitude;
        initialLng = snap.longitude;
      }
    } catch (_) {}

    setTempCoords({ latitude: initialLat, longitude: initialLng });
    setMapModalVisible(true);
  }

  // Search places on map using OpenStreetMap Nominatim
  async function handleSearchMapPlace() {
    if (!mapSearchQuery.trim()) return;
    setIsSearchingMap(true);
    try {
      const clean = mapSearchQuery.trim();
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(clean)}&format=json&limit=5&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GuardianCircle/1.0', Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setMapSearchResults(data || []);
      }
    } catch (err) {
      showToast('Unable to search locations: ' + err.message);
    } finally {
      setIsSearchingMap(false);
    }
  }

  function handleSelectSearchResult(item) {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      setTempCoords({ latitude: lat, longitude: lon, name: item.display_name });
      setMapSearchResults([]);
      setMapSearchQuery(item.display_name.split(',')[0]);
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: lat,
          longitude: lon,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 500);
      }
    }
  }

  async function handleConfirmMapLocation() {
    if (!tempCoords) {
      setMapModalVisible(false);
      return;
    }
    const lat = tempCoords.latitude;
    const lon = tempCoords.longitude;
    const gh = ngeohash.encode(lat, lon);

    let resolvedLabel = tempCoords.name || '';
    if (!resolvedLabel || resolvedLabel.toLowerCase().includes('selected on map')) {
      const area = await resolveReadableAddress(lat, lon);
      if (area) {
        resolvedLabel = area;
      }
    }

    setLocation({
      latitude: lat,
      longitude: lon,
      geohash: gh,
      addressName: resolvedLabel || 'Nearby Location',
    });
    setMapModalVisible(false);
    showToast(`Location tagged: ${resolvedLabel || 'Nearby Location'}`);
  }

  // Main Submit Handler
  async function handleSubmit() {
    const isChildAlert = category === 'Child';

    // 1. Mandatory Validations
    if (!title.trim()) {
      showToast(
        isChildAlert ? "Please provide the child's name and age" : 'Please provide an item title'
      );
      return;
    }
    if (!category) {
      showToast('Please select a category');
      return;
    }
    if (!description.trim()) {
      showToast(
        isChildAlert
          ? "Please describe the child's appearance and clothing"
          : 'Please describe the missing item'
      );
      return;
    }
    if (!contactDetails.trim()) {
      showToast('Please provide emergency contact details');
      return;
    }

    setSubmitting(true);
    try {
      // 2. Resolve Location: if not set by user, fallback to current GPS location automatically!
      let resolvedLoc = location;
      if (!resolvedLoc) {
        try {
          const autoCoords = await getForegroundLocationSnapshot();
          if (autoCoords) {
            const gh = ngeohash.encode(autoCoords.latitude, autoCoords.longitude);
            resolvedLoc = {
              latitude: autoCoords.latitude,
              longitude: autoCoords.longitude,
              geohash: gh,
              addressName: 'Current GPS Location',
            };
          }
        } catch (_) {}
      }

      // Default safe fallback if GPS is turned off
      if (!resolvedLoc) {
        resolvedLoc = {
          latitude: DEFAULT_COORDS.latitude,
          longitude: DEFAULT_COORDS.longitude,
          geohash: ngeohash.encode(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude),
          addressName: 'Default Area (Sri Lanka)',
        };
      }

      // 3. Upload Photo if provided
      let uploadedPhotoUrl = null;
      if (photoBase64) {
        try {
          const res = await uploadImage(`data:image/jpeg;base64,${photoBase64}`, 'lost-items');
          uploadedPhotoUrl = res.url;
        } catch (uploadErr) {
          console.warn('[CircleFindReport] Image upload error:', uploadErr.message);
        }
      } else if (photoUri) {
        try {
          const res = await uploadImage(photoUri, 'lost-items');
          uploadedPhotoUrl = res.url;
        } catch (uploadErr) {
          console.warn('[CircleFindReport] Image upload error:', uploadErr.message);
        }
      }

      // Resolve creator's original account name accurately
      const authorAccountName =
        userProfile?.displayName ||
        user?.displayName ||
        userProfile?.fullName ||
        userProfile?.name ||
        (user?.email ? user.email.split('@')[0] : '') ||
        (userProfile?.email ? userProfile.email.split('@')[0] : '') ||
        'User';

      // 4. Create CircleFind document
      const docPayload = {
        title: title.trim(),
        category,
        description: description.trim(),
        contactDetails: contactDetails.trim(),
        contactPhone: contactDetails.trim(),
        photoUrl: uploadedPhotoUrl,
        location: {
          latitude: resolvedLoc.latitude,
          longitude: resolvedLoc.longitude,
          addressName: resolvedLoc.addressName || '',
        },
        geohash: resolvedLoc.geohash,
        status: 'missing', // Canonical status: missing -> spotted -> found -> returned
        type: 'lost', // For backward compatibility
        isUrgent: isChildAlert,
        priority: isChildAlert ? 'urgent' : 'normal',
        reporterUid: user?.uid,
        reportedBy: user?.uid,
        reportedByName: authorAccountName,
        reporterName: authorAccountName,
        authorName: authorAccountName,
        reporterPhotoURL: userProfile?.photoURL || null,
        authorPhotoURL: userProfile?.photoURL || null,
        boostCount: 0,
        upvotes: 0,
        boostedBy: [],
        confidenceScore: 0,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, CIRCLE_FIND_COLLECTION), docPayload);

      showToast(isChildAlert ? '🚨 Missing Child Alert Broadcasted!' : 'Published to CircleFind!');
      navigation.goBack();
    } catch (error) {
      showToast('Publish error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isChildAlert = category === 'Child';
  const styles = getStyles(colors, isDark, isChildAlert);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Professional Header Hero Banner */}
        <View style={[styles.headerHero, isChildAlert && styles.headerHeroUrgent]}>
          <View style={styles.headerHeroTopRow}>
            <View style={[styles.heroIconBox, isChildAlert && styles.heroIconBoxUrgent]}>
              <MaterialIcons
                name={isChildAlert ? 'child-care' : 'search'}
                size={24}
                color="#FFF"
              />
            </View>
            <View style={[styles.heroBadge, isChildAlert && styles.heroBadgeUrgent]}>
              <MaterialIcons
                name={isChildAlert ? 'priority-high' : 'verified-user'}
                size={12}
                color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
              />
              <Text style={[styles.heroBadgeText, isChildAlert && styles.heroBadgeTextUrgent]}>
                {isChildAlert ? 'URGENT AMBER BROADCAST' : 'COMMUNITY RECOVERY CIRCLE'}
              </Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>
            {isChildAlert ? 'Report Missing Child' : 'Report Missing Item / Pet'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isChildAlert
              ? 'Immediate emergency broadcast to all active community guardians and nearby members.'
              : 'Alert nearby members with instant proximity-based location tagging and community assistance.'}
          </Text>
        </View>

        {/* Amber Alert Callout Notice (Displays when Child is selected) */}
        {isChildAlert && (
          <View style={styles.amberAlertNotice}>
            <MaterialIcons name="warning" size={22} color="#D32F2F" />
            <View style={{ flex: 1 }}>
              <Text style={styles.amberAlertNoticeTitle}>High-Priority Child Alert</Text>
              <Text style={styles.amberAlertNoticeBody}>
                Please provide accurate details of physical appearance, clothing last seen, and any nearby sightings. This report will be tagged with priority alert distribution.
              </Text>
            </View>
          </View>
        )}

        {/* 1. Category Selection Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <MaterialIcons
              name="grid-view"
              size={16}
              color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
            />
            <Text style={styles.sectionCardTitle}>1. Select Category</Text>
            <Text style={styles.requiredStar}>*</Text>
          </View>

          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat.key;
              const isUrgentCat = cat.urgent;

              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryCard,
                    isUrgentCat && styles.categoryCardUrgentBorder,
                    isSelected &&
                      (isUrgentCat
                        ? styles.categoryCardSelectedUrgent
                        : styles.categoryCardSelected),
                  ]}
                  onPress={() => setCategory(cat.key)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={cat.icon}
                    size={18}
                    color={
                      isSelected
                        ? isUrgentCat
                          ? '#D32F2F'
                          : colors.darkGreenMid
                        : isUrgentCat
                        ? '#E53935'
                        : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.categoryCardText,
                      isUrgentCat && styles.categoryCardTextUrgent,
                      isSelected &&
                        (isUrgentCat
                          ? styles.categoryCardTextSelectedUrgent
                          : styles.categoryCardTextSelected),
                    ]}
                  >
                    {cat.label || cat.key}
                  </Text>
                  {isUrgentCat && (
                    <View style={styles.urgentMiniTag}>
                      <Text style={styles.urgentMiniTagText}>URGENT</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2. Details Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <MaterialIcons
              name="edit-note"
              size={18}
              color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
            />
            <Text style={styles.sectionCardTitle}>
              {isChildAlert ? "2. Child's Details" : '2. Identifying Details'}
            </Text>
            <Text style={styles.requiredStar}>*</Text>
          </View>

          <Text style={styles.fieldLabel}>
            {isChildAlert ? "Child's Full Name & Age" : 'Item Title / Name'}
            <Text style={styles.requiredStar}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder={
              isChildAlert
                ? 'e.g. Maya Jayasinghe, 6 years old'
                : 'e.g. Black Leather Wallet, Brown Labrador Puppy, Keys'
            }
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            {isChildAlert
              ? 'Physical Appearance & Clothing Last Seen'
              : 'Description & Distinguishing Marks'}
            <Text style={styles.requiredStar}> *</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={
              isChildAlert
                ? 'Hair color, height, skin tone, clothing last seen wearing (e.g. bright yellow hoodie, blue denim shorts), footwear, scars, or context...'
                : 'Include color, brand, scratches, serial number, unique stickers, markings, or context where last remembered having it...'
            }
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* 3. Photo Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <MaterialIcons
              name="photo-camera"
              size={16}
              color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
            />
            <Text style={styles.sectionCardTitle}>
              {isChildAlert ? '3. Photo of Child' : '3. Photo Verification'}
            </Text>
            <Text style={styles.optionalTag}> (Recommended)</Text>
          </View>

          {photoUri ? (
            <View style={styles.photoPreviewWrapper}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              <View style={styles.photoOverlayActions}>
                <TouchableOpacity
                  style={styles.photoCropBtn}
                  onPress={pickFromGallery}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="crop" size={14} color="#FFF" />
                  <Text style={styles.photoActionBtnText}>Crop / Resize</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.photoRemoveBtn}
                  onPress={() => {
                    setPhotoUri(null);
                    setPhotoBase64(null);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="close" size={14} color="#FFF" />
                  <Text style={styles.photoActionBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.photoActionRow}>
              <TouchableOpacity
                style={styles.photoActionButton}
                onPress={takePhotoWithCamera}
                activeOpacity={0.7}
              >
                <View style={styles.photoActionIconCircle}>
                  <MaterialIcons
                    name="photo-camera"
                    size={20}
                    color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
                  />
                </View>
                <Text style={styles.photoActionText}>Take Camera Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoActionButton}
                onPress={pickFromGallery}
                activeOpacity={0.7}
              >
                <View style={styles.photoActionIconCircle}>
                  <MaterialIcons
                    name="photo-library"
                    size={20}
                    color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
                  />
                </View>
                <Text style={styles.photoActionText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 4. Location Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <MaterialIcons
              name="place"
              size={16}
              color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
            />
            <Text style={styles.sectionCardTitle}>
              {isChildAlert ? '4. Last Seen Area' : '4. Lost Location / Area'}
            </Text>
            <Text style={styles.optionalTag}> (Auto-defaults to current GPS)</Text>
          </View>

          <View style={styles.locationContainer}>
            <View style={styles.locationHeaderRow}>
              <MaterialIcons
                name="location-on"
                size={20}
                color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
              />
              <Text style={styles.locationStatusText} numberOfLines={2}>
                {location
                  ? location.addressName || 'Custom Location Tagged'
                  : 'Auto: Will use your current GPS location'}
              </Text>
            </View>

            <View style={styles.locationButtonsRow}>
              <TouchableOpacity
                style={[styles.locationBtn, gettingLocation && { opacity: 0.6 }]}
                onPress={handleUseCurrentGPS}
                disabled={gettingLocation}
                activeOpacity={0.7}
              >
                {gettingLocation ? (
                  <ActivityIndicator
                    size="small"
                    color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
                  />
                ) : (
                  <>
                    <MaterialIcons
                      name="my-location"
                      size={15}
                      color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
                    />
                    <Text style={styles.locationBtnText}>Use Current GPS</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.locationBtn}
                onPress={handleOpenMapPicker}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name="map"
                  size={15}
                  color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
                />
                <Text style={styles.locationBtnText}>Pick on Map</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 5. Contact Details Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <MaterialIcons
              name="phone-in-talk"
              size={16}
              color={isChildAlert ? '#D32F2F' : colors.darkGreenMid}
            />
            <Text style={styles.sectionCardTitle}>5. Contact Information</Text>
            <Text style={styles.requiredStar}>*</Text>
          </View>
          <Text style={styles.contactCardSub}>
            Direct phone number where finders, guardians, or local authorities can reach you immediately.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Phone number, WhatsApp, or contact details"
            placeholderTextColor={colors.textMuted}
            value={contactDetails}
            onChangeText={setContactDetails}
            keyboardType="phone-pad"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            isChildAlert && styles.submitButtonUrgent,
            submitting && { opacity: 0.6 },
          ]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <View style={styles.submitBtnContent}>
              <MaterialIcons
                name={isChildAlert ? 'campaign' : 'campaign'}
                size={22}
                color="#FFF"
              />
              <Text style={styles.submitButtonText}>
                {isChildAlert ? 'Broadcast Missing Child Alert' : 'Publish to CircleFind'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Map Picker Modal */}
      <Modal
        visible={mapModalVisible}
        animationType="slide"
        onRequestClose={() => setMapModalVisible(false)}
      >
        <View style={styles.mapModalContainer}>
          {/* Modal Header & Search */}
          <View style={styles.mapModalHeader}>
            <View style={styles.mapSearchRow}>
              <TouchableOpacity
                onPress={() => setMapModalVisible(false)}
                style={styles.mapBackBtn}
              >
                <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              <TextInput
                style={styles.mapSearchInput}
                placeholder="Search city, town, shop, or place..."
                placeholderTextColor={colors.textMuted}
                value={mapSearchQuery}
                onChangeText={setMapSearchQuery}
                onSubmitEditing={handleSearchMapPlace}
                returnKeyType="search"
              />
              <TouchableOpacity
                style={styles.mapSearchBtn}
                onPress={handleSearchMapPlace}
              >
                {isSearchingMap ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <MaterialIcons name="search" size={20} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>

            {/* Suggestions Dropdown */}
            {mapSearchResults.length > 0 && (
              <View style={styles.mapSearchResultsList}>
                <FlatList
                  data={mapSearchResults}
                  keyExtractor={(item, index) => `${item.place_id || index}`}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.mapSearchResultItem}
                      onPress={() => handleSelectSearchResult(item)}
                    >
                      <MaterialIcons name="place" size={16} color={colors.darkGreenMid} />
                      <Text style={styles.mapSearchResultText} numberOfLines={2}>
                        {item.display_name}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}
          </View>

          {/* Interactive Map */}
          {MapView && tempCoords ? (
            <MapView
              ref={mapRef}
              style={styles.mapView}
              initialRegion={{
                latitude: tempCoords.latitude,
                longitude: tempCoords.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              }}
              onPress={(e) => {
                const c = e.nativeEvent.coordinate;
                setTempCoords({ latitude: c.latitude, longitude: c.longitude });
              }}
            >
              <Marker
                coordinate={{
                  latitude: tempCoords.latitude,
                  longitude: tempCoords.longitude,
                }}
                draggable
                onDragEnd={(e) => {
                  const c = e.nativeEvent.coordinate;
                  setTempCoords({ latitude: c.latitude, longitude: c.longitude });
                }}
                title="Lost Area"
                description="Drag or tap to adjust exact spot"
              />
            </MapView>
          ) : (
            <View style={styles.mapPlaceholder}>
              <Text style={{ color: colors.textSecondary }}>
                Map view is ready. Tap confirm to use coordinates: {tempCoords?.latitude?.toFixed(4)}, {tempCoords?.longitude?.toFixed(4)}
              </Text>
            </View>
          )}

          {/* Map Footer Confirm */}
          <View style={styles.mapFooter}>
            <Text style={styles.mapInstruction}>
              Tap anywhere on map or drag pin to mark where the item was lost.
            </Text>
            <TouchableOpacity
              style={styles.mapConfirmBtn}
              onPress={handleConfirmMapLocation}
            >
              <MaterialIcons name="check" size={20} color="#FFF" />
              <Text style={styles.mapConfirmBtnText}>Confirm This Location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Toast />
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors, isDark, isChildAlert) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 50 },

    // Professional Hero Header
    headerHero: {
      backgroundColor: colors.darkGreen,
      borderRadius: RADIUS.xl,
      padding: 18,
      marginBottom: 16,
      ...SHADOWS.medium,
    },
    headerHeroUrgent: {
      backgroundColor: '#C62828',
    },
    headerHeroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    heroIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIconBoxUrgent: {
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: RADIUS.round,
      gap: 4,
    },
    heroBadgeUrgent: {
      backgroundColor: '#FFEBEE',
    },
    heroBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.darkGreenMid,
    },
    heroBadgeTextUrgent: {
      color: '#D32F2F',
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: '#FFFFFF',
      marginBottom: 4,
    },
    heroSubtitle: {
      fontSize: 12,
      color: 'rgba(255, 255, 255, 0.9)',
      lineHeight: 17,
    },

    // Amber Alert Notice
    amberAlertNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark ? 'rgba(211, 47, 47, 0.18)' : '#FFEBEE',
      borderRadius: RADIUS.xl,
      padding: 14,
      borderWidth: 1.5,
      borderColor: '#E53935',
      marginBottom: 16,
      gap: 10,
      ...SHADOWS.small,
    },
    amberAlertNoticeTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#C62828',
      marginBottom: 2,
    },
    amberAlertNoticeBody: {
      fontSize: 12,
      color: isDark ? '#FFCDD2' : '#B71C1C',
      lineHeight: 17,
    },

    // Professional Section Cards
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      ...SHADOWS.small,
    },
    sectionCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 6,
    },
    sectionCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 6,
    },
    requiredStar: { color: '#E53935', fontWeight: '700' },
    optionalTag: { fontSize: 11, fontWeight: '400', color: colors.textMuted },

    // Category Grid & Urgent Tiles
    categoriesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FBF9',
      gap: 6,
    },
    categoryCardUrgentBorder: {
      borderColor: 'rgba(229, 57, 53, 0.4)',
      backgroundColor: isDark ? 'rgba(229, 57, 53, 0.08)' : '#FFF5F5',
    },
    categoryCardSelected: {
      borderColor: colors.darkGreenMid,
      backgroundColor: isDark ? colors.darkGreenSurface : '#E0F2F1',
    },
    categoryCardSelectedUrgent: {
      borderColor: '#D32F2F',
      backgroundColor: isDark ? 'rgba(211, 47, 47, 0.22)' : '#FFEBEE',
    },
    categoryCardText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    categoryCardTextUrgent: {
      color: '#D32F2F',
    },
    categoryCardTextSelected: {
      color: colors.darkGreenMid,
      fontWeight: '700',
    },
    categoryCardTextSelectedUrgent: {
      color: '#D32F2F',
      fontWeight: '800',
    },
    urgentMiniTag: {
      backgroundColor: '#E53935',
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: RADIUS.round,
      marginLeft: 2,
    },
    urgentMiniTagText: {
      fontSize: 8,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },

    // Inputs
    input: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F7FAF7',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.textPrimary,
    },
    textArea: {
      minHeight: 95,
      textAlignVertical: 'top',
    },

    // Photo Box & Actions
    photoPickerContainer: {
      marginTop: 2,
    },
    photoActionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    photoActionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F7FAF7',
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: RADIUS.lg,
      paddingVertical: 18,
      paddingHorizontal: 8,
      gap: 8,
    },
    photoActionIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8EDE8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoActionText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    photoPreviewWrapper: {
      position: 'relative',
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
    },
    photoPreview: {
      width: '100%',
      height: 200,
      borderRadius: RADIUS.xl,
    },
    photoOverlayActions: {
      position: 'absolute',
      bottom: 10,
      right: 10,
      flexDirection: 'row',
      gap: 8,
    },
    photoCropBtn: {
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: RADIUS.round,
      gap: 5,
    },
    photoRemoveBtn: {
      backgroundColor: 'rgba(211, 47, 47, 0.85)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: RADIUS.round,
      gap: 4,
    },
    photoActionBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

    // Location
    locationContainer: {
      gap: 10,
    },
    locationHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F7FAF7',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      padding: 12,
      gap: 8,
    },
    locationStatusText: {
      flex: 1,
      fontSize: 12,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    locationButtonsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    locationBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFE9',
      paddingVertical: 11,
      borderRadius: RADIUS.md,
      gap: 6,
    },
    locationBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },

    // Contact
    contactCardSub: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 10,
      lineHeight: 16,
    },

    // Submit Button
    submitButton: {
      backgroundColor: colors.darkGreenMid,
      borderRadius: RADIUS.lg,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 20,
      ...SHADOWS.medium,
    },
    submitButtonUrgent: {
      backgroundColor: '#D32F2F',
    },
    submitBtnContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    submitButtonText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
    },

    // Map Modal Styles
    mapModalContainer: { flex: 1, backgroundColor: colors.background },
    mapModalHeader: {
      backgroundColor: colors.surface,
      paddingTop: Platform.OS === 'ios' ? 44 : 12,
      paddingBottom: 10,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      zIndex: 10,
    },
    mapSearchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    mapBackBtn: { padding: 6 },
    mapSearchInput: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F4F0',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.textPrimary,
    },
    mapSearchBtn: {
      backgroundColor: colors.darkGreenMid,
      borderRadius: RADIUS.md,
      padding: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapSearchResultsList: {
      maxHeight: 180,
      backgroundColor: colors.surface,
      marginTop: 8,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    mapSearchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 8,
    },
    mapSearchResultText: { fontSize: 12, color: colors.textPrimary, flex: 1 },
    mapView: { flex: 1 },
    mapPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    mapFooter: {
      backgroundColor: colors.surface,
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      alignItems: 'center',
      gap: 10,
    },
    mapInstruction: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
    },
    mapConfirmBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.darkGreenMid,
      borderRadius: RADIUS.lg,
      paddingVertical: 12,
      paddingHorizontal: 24,
      gap: 8,
      ...SHADOWS.small,
    },
    mapConfirmBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  });

