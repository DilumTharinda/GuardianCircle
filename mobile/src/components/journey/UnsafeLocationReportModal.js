import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { getForegroundLocationSnapshot } from '../../services/locationService';
import {
  createUnsafeLocationReport,
  getUnsafeReportErrorMessage,
  UNSAFE_REPORT_CATEGORIES,
  UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH,
} from '../../services/unsafeLocationReportService';

export default function UnsafeLocationReportModal({ visible, uid, onClose, onReported }) {
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
      setLocationState(result.status === 'success' && result.mocked
        ? {
          status: 'location-error',
          message: 'A real device GPS position is required. Try again on a physical device.',
        }
        : result);
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
      onReported('Unsafe location report submitted. Thank you for helping the community.');
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
    <Modal visible={visible} transparent animationType="fade"
      onRequestClose={() => { if (!saving) onClose(); }}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Report an unsafe location</Text>
            <Text style={styles.body}>
              Report what you observe at your current device GPS location. Do not put yourself at risk to submit.
            </Text>

            <Text style={styles.label}>Current GPS location</Text>
            {locationState.status === 'loading' ? (
              <View style={styles.stateRow}>
                <ActivityIndicator color="#E53935" />
                <Text style={styles.body}>Getting a fresh GPS position...</Text>
              </View>
            ) : locationReady ? (
              <View style={styles.locationBox} accessibilityLiveRegion="polite">
                <Text style={styles.coordinateText}>
                  {locationState.latitude.toFixed(5)}, {locationState.longitude.toFixed(5)}
                </Text>
                <Text style={styles.locationMeta}>
                  Captured {new Date(locationState.timestamp).toLocaleTimeString()}
                  {locationState.accuracy == null ? '' : ` - about ${Math.round(locationState.accuracy)} m accuracy`}
                </Text>
                <TouchableOpacity style={styles.linkButton} onPress={refreshLocation}
                  disabled={saving} accessibilityRole="button">
                  <Text style={styles.linkText}>Refresh GPS</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Text accessibilityRole="alert" style={styles.errorText}>{locationState.message}</Text>
                {locationState.status === 'permission-denied' && locationState.canAskAgain === false && (
                  <TouchableOpacity style={styles.linkButton} onPress={openSettings} accessibilityRole="button">
                    <Text style={styles.linkText}>Open Settings</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.linkButton} onPress={refreshLocation}
                  disabled={saving} accessibilityRole="button">
                  <Text style={styles.linkText}>Retry GPS</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.label}>Unsafe incident category</Text>
            <View style={styles.categoryList}>
              {UNSAFE_REPORT_CATEGORIES.map((option) => {
                const selected = category === option;
                return (
                  <TouchableOpacity key={option}
                    style={[styles.categoryChip, selected && styles.categorySelected]}
                    onPress={() => { if (!saving) { setCategory(option); setFeedback(null); } }}
                    disabled={saving} accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: saving }}>
                    <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Details (optional)</Text>
            <TextInput style={styles.input} value={description} onChangeText={setDescription}
              editable={!saving} maxLength={UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH} multiline
              textAlignVertical="top" placeholder="Briefly describe what made this location feel unsafe"
              placeholderTextColor="#757575" accessibilityLabel="Unsafe location details" />
            <Text style={styles.counter}>{description.length}/{UNSAFE_REPORT_MAX_DESCRIPTION_LENGTH}</Text>

            <View style={styles.privacyBox}>
              <Text style={styles.privacyText}>
                Saved: category, optional details, exact coordinates, your account ID, and timestamps. Your profile, contacts, journey, and location history are not included.
              </Text>
            </View>

            {feedback && (
              <Text accessibilityRole={feedback.type === 'error' ? 'alert' : undefined}
                accessibilityLiveRegion="polite" style={styles.errorText}>
                {feedback.message}
              </Text>
            )}
            {saving && (
              <View style={styles.stateRow} accessibilityLiveRegion="polite">
                <ActivityIndicator color="#E53935" />
                <Text style={styles.body}>Saving report...</Text>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}
                disabled={saving} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, !canSubmit && styles.disabled]} onPress={submit}
                disabled={!canSubmit} accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}>
                <Text style={styles.buttonText}>Submit report</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  dialog: { maxHeight: '92%', width: '100%', maxWidth: 520, alignSelf: 'center',
    backgroundColor: '#FFF', borderRadius: 16 },
  content: { padding: 22 },
  title: { fontSize: 21, fontWeight: '700', color: '#B71C1C', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, color: '#616161' },
  label: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 16, marginBottom: 8 },
  stateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 12 },
  locationBox: { backgroundColor: '#F5F5F5', borderRadius: 9, borderWidth: 1,
    borderColor: '#D5D5D5', padding: 12 },
  coordinateText: { color: '#212121', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  locationMeta: { color: '#616161', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4 },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { borderWidth: 1, borderColor: '#BDBDBD', borderRadius: 18,
    paddingVertical: 8, paddingHorizontal: 12 },
  categorySelected: { backgroundColor: '#C62828', borderColor: '#C62828' },
  categoryText: { color: '#424242', fontSize: 13 },
  categoryTextSelected: { color: '#FFF', fontWeight: '700' },
  input: { minHeight: 90, borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 10, color: '#212121', fontSize: 14 },
  counter: { color: '#757575', fontSize: 11, textAlign: 'right', marginTop: 4 },
  privacyBox: { backgroundColor: '#FFF3E0', borderRadius: 9, padding: 11, marginTop: 14 },
  privacyText: { color: '#7A3E00', fontSize: 12, lineHeight: 17 },
  errorBox: { borderRadius: 9, padding: 10, backgroundColor: '#FFEBEE' },
  errorText: { color: '#B71C1C', fontSize: 13, lineHeight: 18, marginTop: 10, textAlign: 'center' },
  linkButton: { paddingVertical: 8, alignItems: 'center' },
  linkText: { color: '#1976D2', fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  button: { minHeight: 44, backgroundColor: '#C62828', borderRadius: 9, paddingHorizontal: 16,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#C62828' },
  buttonText: { color: '#FFF', fontWeight: '700' },
  cancelText: { color: '#C62828', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
