import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, SHADOWS } from '../../constants/theme';
import { linkChildByCode, createManagedChildProfile } from '../../services/parentChildService';

export default function AddChildModal({ visible, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('link_code'); // 'link_code' | 'managed_profile'

  // Link Code State
  const [linkCode, setLinkCode] = useState('');

  // Managed Profile State
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childPhone, setChildPhone] = useState('');
  const [childGender, setChildGender] = useState('boy');
  const [defaultAddress, setDefaultAddress] = useState('Colombo 07, Residence');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLinkWithCode() {
    if (!linkCode.trim()) {
      setErrorMsg('Please enter the 6-digit link code shown on your child’s phone.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const linked = await linkChildByCode('parent_user_default', linkCode.trim());
      setLinkCode('');
      onSuccess(linked);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to link child device.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateManaged() {
    if (!childName.trim()) {
      setErrorMsg('Please enter child’s full name.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const created = await createManagedChildProfile('parent_user_default', {
        name: childName.trim(),
        age: childAge,
        phone: childPhone,
        gender: childGender === 'girl' ? 'female' : 'male',
        address: defaultAddress,
      });
      setChildName('');
      setChildAge('');
      setChildPhone('');
      onSuccess(created);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create managed profile.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Add Child to Watchlist</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Segmented Tab Switcher */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'link_code' && styles.tabItemActive]}
              onPress={() => {
                setActiveTab('link_code');
                setErrorMsg('');
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabItemText,
                  activeTab === 'link_code' && styles.tabItemTextActive,
                ]}
              >
                🔗 Link Code (Phone)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'managed_profile' && styles.tabItemActive]}
              onPress={() => {
                setActiveTab('managed_profile');
                setErrorMsg('');
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabItemText,
                  activeTab === 'managed_profile' && styles.tabItemTextActive,
                ]}
              >
                👶 Managed Profile
              </Text>
            </TouchableOpacity>
          </View>

          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {activeTab === 'link_code' ? (
              /* TAB 1: LINK BY 6-DIGIT CODE */
              <View style={styles.tabContent}>
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxTitle}>📱 How linking works:</Text>
                  <Text style={styles.infoBoxText}>
                    1. Open GuardianCircle on your child’s phone.{'\n'}
                    2. Navigate to Profile → "Generate Link Code".{'\n'}
                    3. Enter the 6-digit code below to establish permanent tracking.
                  </Text>
                </View>

                <Text style={styles.inputLabel}>Enter 6-Digit Link Code</Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="e.g. GC-849201"
                  placeholderTextColor={COLORS.textMuted}
                  value={linkCode}
                  onChangeText={(val) => setLinkCode(val.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={10}
                />

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleLinkWithCode}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Link Child Device</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              /* TAB 2: MANAGED CHILD PROFILE */
              <View style={styles.tabContent}>
                <Text style={styles.infoNote}>
                  Create a profile for a younger child or dependent without a smartphone.
                </Text>

                <Text style={styles.inputLabel}>Child’s Full Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Ethan Anderson"
                  placeholderTextColor={COLORS.textMuted}
                  value={childName}
                  onChangeText={setChildName}
                />

                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Age</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 7"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                      value={childAge}
                      onChangeText={setChildAge}
                      maxLength={2}
                    />
                  </View>

                  <View style={{ flex: 1.5 }}>
                    <Text style={styles.inputLabel}>Avatar</Text>
                    <View style={styles.genderRow}>
                      <TouchableOpacity
                        style={[
                          styles.genderBtn,
                          childGender === 'boy' && styles.genderBtnActive,
                        ]}
                        onPress={() => setChildGender('boy')}
                      >
                        <Text style={styles.genderText}>👦 Boy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.genderBtn,
                          childGender === 'girl' && styles.genderBtnActive,
                        ]}
                        onPress={() => setChildGender('girl')}
                      >
                        <Text style={styles.genderText}>👧 Girl</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <Text style={styles.inputLabel}>Emergency Contact Phone</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="+1 (555) 000-9988"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                  value={childPhone}
                  onChangeText={setChildPhone}
                />

                <Text style={styles.inputLabel}>Home Address / Safe Point</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 124 Palm Avenue, Colombo 03"
                  placeholderTextColor={COLORS.textMuted}
                  value={defaultAddress}
                  onChangeText={setDefaultAddress}
                />

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleCreateManaged}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Create Managed Profile</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    maxHeight: '88%',
    ...SHADOWS.large,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F3F5',
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: SPACING.md,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  tabItemActive: {
    backgroundColor: COLORS.card,
    ...SHADOWS.small,
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: COLORS.dangerRedLight,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  errorText: {
    color: COLORS.dangerRed,
    fontSize: 12,
    fontWeight: '600',
  },
  bodyScroll: {
    marginBottom: SPACING.sm,
  },
  tabContent: {
    paddingVertical: SPACING.xs,
  },
  infoBox: {
    backgroundColor: COLORS.infoBlueLight,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.infoBlue,
  },
  infoBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.infoBlue,
    marginBottom: 4,
  },
  infoBoxText: {
    fontSize: 12,
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  infoNote: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 8,
  },
  codeInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    color: COLORS.primary,
    marginBottom: SPACING.lg,
  },
  textInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 6,
  },
  genderBtn: {
    flex: 1,
    backgroundColor: '#F1F3F5',
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  genderBtnActive: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  genderText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: SPACING.lg,
    ...SHADOWS.medium,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
