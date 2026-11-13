/**
 * GuardianCircle — UnsafeLocationReportModal.js
 * FR-1.8 Unsafe-Location Reporting
 *
 * Styled to match the dark-green design system (LoginScreen / HomeScreen palette).
 * Integrates useTheme() so the dialog adapts to light/dark mode.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { getForegroundLocationSnapshot } from '../../services/locationService';
import { FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import {
  createUnsafeLocationReport,
  getUnsafeReportErrorMessage,
  UNSAFE_REPORT_CATEGORIES,
  UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH,
} from '../../services/unsafeLocationReportService';

export default function UnsafeLocationReportModal({ visible, uid, onClose, onReported }) {
  const { isDark, colors } = useTheme();
  const styles = getStyles(colors, isDark);

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [locationState, setLocationState] = useState({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const mounted = useRef(false);
  const locationRequest = useRef(0);
  const locating = useRef(false);
  const submitting = useRef(false);

  const refreshLocation = useCallback(async () => {
    if (locating.current || submitting.current) return;
    locating.current = true;
    const request = ++locationRequest.current;
    setFeedback(null);
    setLocationState({ status: 'loading' });
    let result;
    try {
      result = await getForegroundLocationSnapshot();
    } catch (_) {
      result = {
        status: 'location-error',
        message: 'Unable to get your current location. Please try again.',
      };
    }
    if (mounted.current && request === locationRequest.current) {
      setLocationState(
        result.status === 'success' && result.mocked
          ? {
              status: 'location-error',
              message: 'A real device GPS position is required. Try again on a physical device.',
            }
          : result,
      );
    }
    if (request === locationRequest.current) locating.current = false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    refreshLocation();
    return () => {
      mounted.current = false;
      locationRequest.current += 1;
      locating.current = false;
    };
  }, [refreshLocation]);

  async function openSettings() {
    try {
      await Linking.openSettings();
    } catch (_) {
      if (mounted.current) {
        setFeedback({
          type: 'error',
          message: 'Could not open Settings. Open device settings manually, then retry GPS.',
        });
      }
    }
  }

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      await createUnsafeLocationReport(uid, {
        category,
        description,
        location: locationState.status === 'success' ? locationState : null,
      });
      if (!mounted.current) return;
      onReported('Unsafe location reported. Thank you for helping the community.');
      onClose();
    } catch (error) {
      if (mounted.current) {
        setFeedback({ type: 'error', message: getUnsafeReportErrorMessage(error) });
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const locationReady = locationState.status === 'success';
  const canSubmit = Boolean(category) && locationReady && !saving;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => { if (!saving) onClose(); }}
    >
      <View style={styles.backdrop}>
        {/* Tapping visible map backdrop dismisses the half window */}
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={() => { if (!saving) onClose(); }}
          accessibilityLabel="Dismiss report window"
        />

        <View style={styles.dialog} accessibilityViewIsModal>
          {/* Half window drag handle */}
          <View style={styles.dragHandleBar}>
            <View style={styles.dragHandle} />
          </View>

          {/* ── Header ───────────────────────────────────────────────── */}
          <LinearGradient
            colors={[colors.darkGreen, colors.darkGreenLight]}
            style={styles.header}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="warning-outline" size={22} color="#FFF" style={{ marginRight: 10 }} />
            <Text style={styles.headerTitle}>Report Unsafe Location</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => { if (!saving) onClose(); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Description ──────────────────────────────────────── */}
            <Text style={styles.subtitle}>
              Report what you observe at your current GPS location. Do not put yourself at risk to submit.
            </Text>

            {/* ── GPS Location ─────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Current GPS location</Text>
            {locationState.status === 'loading' ? (
              <View style={styles.stateRow}>
                <ActivityIndicator color={colors.darkGreenMid} />
                <Text style={styles.bodyText}>Getting a fresh GPS position…</Text>
              </View>
            ) : locationReady ? (
              <View style={styles.locationBox} accessibilityLiveRegion="polite">
                <Ionicons name="location" size={18} color={colors.safeGreen} style={{ marginBottom: 4 }} />
                <Text style={styles.coordText}>
                  {locationState.latitude.toFixed(5)}, {locationState.longitude.toFixed(5)}
                </Text>
                <Text style={styles.captionText}>
                  Captured {new Date(locationState.timestamp).toLocaleTimeString()}
                  {locationState.accuracy == null
                    ? ''
                    : ` · ~${Math.round(locationState.accuracy)} m accuracy`}
                </Text>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={refreshLocation}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  <Text style={styles.linkText}>Refresh GPS</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={16} color={colors.dangerRed} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {locationState.message}
                  </Text>
                  {locationState.status === 'permission-denied' && locationState.canAskAgain === false && (
                    <TouchableOpacity style={styles.linkButton} onPress={openSettings} accessibilityRole="button">
                      <Text style={styles.linkText}>Open Settings</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.linkButton} onPress={refreshLocation} disabled={saving} accessibilityRole="button">
                    <Text style={styles.linkText}>Retry GPS</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── Category ─────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Incident category</Text>
            <View style={styles.chipGrid}>
              {UNSAFE_REPORT_CATEGORIES.map((option) => {
                const selected = category === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => { if (!saving) { setCategory(option); setFeedback(null); } }}
                    disabled={saving}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: saving }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Details ──────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Details (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              editable={!saving}
              maxLength={UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH}
              multiline
              textAlignVertical="top"
              placeholder="Briefly describe what made this location feel unsafe"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Unsafe location details"
            />
            <Text style={styles.counter}>
              {description.length}/{UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH}
            </Text>

            {/* ── Privacy notice ───────────────────────────────────── */}
            <View style={styles.privacyBox}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} style={{ marginRight: 6, marginTop: 1 }} />
              <Text style={styles.privacyText}>
                Saved: category, details, coordinates, account ID, timestamp.
                Your profile, contacts, and location history are not included.
              </Text>
            </View>

            {/* ── Feedback ─────────────────────────────────────────── */}
            {feedback && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.dangerRed} style={{ marginRight: 8 }} />
                <Text
                  accessibilityRole={feedback.type === 'error' ? 'alert' : undefined}
                  accessibilityLiveRegion="polite"
                  style={styles.errorText}
                >
                  {feedback.message}
                </Text>
              </View>
            )}

            {saving && (
              <View style={styles.stateRow} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.darkGreenMid} />
                <Text style={styles.bodyText}>Saving report…</Text>
              </View>
            )}

            {/* ── Actions ──────────────────────────────────────────── */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={saving}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitButton, !canSubmit && styles.disabled]}
                onPress={submit}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
              >
                <LinearGradient
                  colors={canSubmit
                    ? [colors.darkGreen, colors.darkGreenLight]
                    : [colors.textMuted, colors.textMuted]}
                  style={styles.submitGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="send-outline" size={15} color="#FFF" style={{ marginRight: 5 }} />
                  <Text style={styles.submitText}>Submit Report</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.40)',
      justifyContent: 'flex-end',
    },
    backdropDismiss: {
      flex: 1,
    },
    dialog: {
      height: '56%',
      backgroundColor: isDark ? colors.surface : '#FFFFFF',
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      overflow: 'hidden',
      ...SHADOWS.large,
    },
    dragHandleBar: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: colors.darkGreen,
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.50)',
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.base,
      paddingVertical: 14,
      paddingTop: Platform.OS === 'ios' ? 14 : 14,
    },
    headerTitle: {
      flex: 1,
      fontSize: FONTS.md,
      fontWeight: FONTS.bold,
      color: '#FFF',
    },
    closeButton: {
      padding: 4,
    },

    content: {
      padding: SPACING.base,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.sm,
    },

    // Typography
    subtitle: {
      fontSize: FONTS.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    sectionLabel: {
      fontSize: FONTS.sm,
      fontWeight: FONTS.bold,
      color: colors.textPrimary,
      marginTop: SPACING.sm,
    },
    bodyText: {
      fontSize: FONTS.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    captionText: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },

    // Location box
    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
    },
    locationBox: {
      backgroundColor: isDark ? colors.darkGreenSurface : '#F0FBF9',
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: isDark ? '#1E3A35' : '#B2DFDB',
      padding: SPACING.md,
      alignItems: 'center',
    },
    coordText: {
      color: colors.textPrimary,
      fontSize: FONTS.md,
      fontWeight: FONTS.bold,
      textAlign: 'center',
    },

    // Chips
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    chip: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: RADIUS.full,
      paddingVertical: 7,
      paddingHorizontal: 13,
      backgroundColor: isDark ? colors.cardBackground : '#FAFAFA',
    },
    chipSelected: {
      backgroundColor: colors.darkGreenMid,
      borderColor: colors.darkGreenMid,
    },
    chipText: {
      color: colors.textSecondary,
      fontSize: FONTS.sm,
      fontWeight: FONTS.medium,
    },
    chipTextSelected: {
      color: '#FFF',
      fontWeight: FONTS.bold,
    },

    // Text input
    textInput: {
      minHeight: 90,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: colors.textPrimary,
      backgroundColor: isDark ? colors.cardBackground : colors.background,
      fontSize: FONTS.base,
    },
    counter: {
      color: colors.textMuted,
      fontSize: 11,
      textAlign: 'right',
      marginTop: 2,
    },

    // Privacy
    privacyBox: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#2A2318' : '#FFF8E1',
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: isDark ? '#4A3B22' : '#FFE0B2',
    },
    privacyText: {
      flex: 1,
      color: isDark ? '#D0B060' : '#7A3E00',
      fontSize: 12,
      lineHeight: 17,
    },

    // Error / feedback
    errorBox: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#3D1A1A' : '#FFEBEE',
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: isDark ? '#5C2020' : '#FFCDD2',
    },
    errorText: {
      flex: 1,
      color: isDark ? '#FF8A80' : '#B71C1C',
      fontSize: FONTS.sm,
      lineHeight: 18,
    },

    // Link
    linkButton: {
      paddingVertical: 5,
      alignItems: 'center',
    },
    linkText: {
      color: colors.darkGreenMid,
      fontSize: FONTS.sm,
      fontWeight: FONTS.semiBold,
    },

    // Actions
    actions: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: RADIUS.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      color: colors.textSecondary,
      fontWeight: FONTS.semiBold,
      fontSize: FONTS.base,
    },
    submitButton: {
      flex: 2,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
    },
    submitGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
    },
    submitText: {
      color: '#FFF',
      fontWeight: FONTS.bold,
      fontSize: FONTS.base,
    },
    disabled: {
      opacity: 0.5,
    },
  });
