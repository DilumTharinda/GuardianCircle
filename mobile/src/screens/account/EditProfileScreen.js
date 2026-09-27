import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { SELECTABLE_ROLES } from '../../constants/roles';

export default function EditProfileScreen() {
  const { userProfile, updateUserProfile, deleteUserAccount } = useAuth();
  const navigation = useNavigation();

  const [name, setName] = useState(userProfile?.displayName || '');
  const [role, setRole] = useState(userProfile?.role || '');
  const [password, setPassword] = useState('');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Delete modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const roleChanged = role !== userProfile?.role;

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setPhotoURL(result.assets[0].uri);
    }
  };

  const uploadToCloudinary = async (imageUri) => {
    // If it's already an uploaded HTTP URL, skip upload
    if (!imageUri || imageUri.startsWith('http')) return imageUri;
    
    const preset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'guardiancircle_unsigned';
    const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'poarehfu';
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    
    const uploadResult = await FileSystem.uploadAsync(uploadUrl, imageUri, {
      httpMethod: 'POST',
      uploadType: 1, // FileSystemUploadType.MULTIPART
      fieldName: 'file',
      parameters: {
        upload_preset: String(preset),
        cloud_name: String(cloudName),
      },
    });

    const result = JSON.parse(uploadResult.body);
    if (result.secure_url) {
      return result.secure_url;
    } else {
      throw new Error(result.error?.message || 'Failed to upload image');
    }
  };

  async function handleSave() {
    setError('');
    
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }

    if (roleChanged && !password) {
      setError('Please enter your password to confirm role change.');
      return;
    }

    setLoading(true);
    try {
      let finalPhotoUrl = photoURL;
      if (photoURL && !photoURL.startsWith('http')) {
        finalPhotoUrl = await uploadToCloudinary(photoURL);
      }
      
      await updateUserProfile(name, role, password, finalPhotoUrl);
      Alert.alert('Success', 'Profile updated successfully.');
      navigation.goBack();
    } catch (e) {
      setError(e.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        <Text style={styles.headerTitle}>Edit Profile</Text>

        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickImage} disabled={loading} style={styles.avatarWrapper}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="camera" size={32} color={COLORS.darkGreenMid} />
              </View>
            )}
            <View style={styles.editIconBadge}>
              <Ionicons name="pencil" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <View style={styles.avatarActionRow}>
            <TouchableOpacity onPress={pickImage} disabled={loading}>
              <Text style={styles.avatarActionText}>Change</Text>
            </TouchableOpacity>
            {photoURL && (
              <>
                <Text style={styles.avatarActionDivider}>•</Text>
                <TouchableOpacity onPress={() => setPhotoURL(null)} disabled={loading}>
                  <Text style={[styles.avatarActionText, { color: COLORS.dangerRed }]}>Remove</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your Name"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Account Role</Text>
          <Text style={styles.helperText}>Changing your role requires password verification.</Text>
          
          <View style={styles.roleContainer}>
            {SELECTABLE_ROLES.map((r) => {
              const selected = role === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.roleCard, selected && styles.roleCardSelected]}
                  onPress={() => setRole(r.value)}
                  disabled={loading}
                >
                  <Text style={[styles.roleText, selected && styles.roleTextSelected]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {roleChanged ? (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <Text style={styles.helperText}>Required to verify identity before role change (leave blank if Google Sign-In).</Text>
            <TextInput
              style={styles.input}
              placeholder="Your Password"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* ── Danger Zone ── */}
        <Text style={styles.dangerTitle}>Danger Zone</Text>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => setDeleteModalVisible(true)}
          disabled={loading}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.dangerRed} />
          <Text style={styles.deleteBtnText}>Delete Account</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Delete Account Modal ── */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !deleteLoading && setDeleteModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalSubText}>
              This action is permanent and cannot be undone. Please enter your password to confirm. (If you signed in with Google, leave this blank).
            </Text>
            
            {deleteError ? (
              <Text style={styles.modalError}>{deleteError}</Text>
            ) : null}

            <TextInput
              style={styles.modalInput}
              placeholder="Your Password"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              value={deletePassword}
              onChangeText={setDeletePassword}
              editable={!deleteLoading}
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setDeletePassword('');
                  setDeleteError('');
                }}
                disabled={deleteLoading}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDelete]}
                onPress={async () => {
                  setDeleteError('');
                  setDeleteLoading(true);
                  try {
                    await deleteUserAccount(deletePassword);
                    setDeleteModalVisible(false);
                    Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
                  } catch (e) {
                    setDeleteError(e.message || 'Failed to delete account.');
                  } finally {
                    setDeleteLoading(false);
                  }
                }}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalButtonDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.xl,
    paddingBottom: 60,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: SPACING.sm,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  avatarActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarActionText: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: COLORS.primary,
  },
  avatarActionDivider: {
    color: COLORS.textMuted,
  },
  errorBox: {
    backgroundColor: COLORS.dangerRed + '20',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.dangerRed,
    fontSize: FONTS.sm,
    fontWeight: FONTS.medium,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONTS.base,
    fontWeight: FONTS.semiBold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 50,
    fontSize: FONTS.base,
    color: COLORS.textPrimary,
  },
  roleContainer: {
    gap: SPACING.sm,
  },
  roleCard: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
  },
  roleCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  roleText: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    fontWeight: FONTS.medium,
  },
  roleTextSelected: {
    color: COLORS.primary,
    fontWeight: FONTS.bold,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    height: 50,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xl,
  },
  dangerTitle: {
    fontSize: FONTS.md,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerRed + '10',
    borderWidth: 1,
    borderColor: COLORS.dangerRed + '40',
    height: 50,
    borderRadius: RADIUS.lg,
  },
  deleteBtnText: {
    color: COLORS.dangerRed,
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
  },
  
  // Modal Styles (copied from ProfileScreen)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    ...SHADOWS.card,
  },
  modalTitle: {
    fontSize: FONTS.lg,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  modalSubText: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  modalError: {
    fontSize: FONTS.sm,
    color: COLORS.dangerRed,
    marginBottom: SPACING.sm,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    height: 48,
    fontSize: FONTS.base,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xl,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  modalButtonCancelText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.semiBold,
    color: COLORS.textSecondary,
  },
  modalButtonDelete: {
    backgroundColor: COLORS.dangerRed,
  },
  modalButtonDeleteText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: '#fff',
  },
});
