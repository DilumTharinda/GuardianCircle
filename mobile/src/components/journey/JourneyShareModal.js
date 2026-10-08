import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useTrustedContacts } from '../../hooks/useTrustedContacts';
import { getJourneyShareErrorMessage, shareActiveJourney } from '../../services/journeyShareService';

export default function JourneyShareModal({ visible, uid, journeyState, onClose, onShared }) {
  const { contacts, loading, error, retry } = useTrustedContacts(uid);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const mounted = useRef(false);
  const sharing = useRef(false);
  const activeContacts = useMemo(
    () => contacts.filter((contact) => contact.status === 'active'),
    [contacts],
  );

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const available = new Set(activeContacts.map((contact) => contact.id));
    setSelectedIds((current) => current.filter((id) => available.has(id)));
  }, [activeContacts]);

  function toggle(id) {
    if (busy) return;
    setFeedback(null);
    setSelectedIds((current) => current.includes(id)
      ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function share() {
    if (sharing.current) return;
    sharing.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const selectedContacts = activeContacts.filter((contact) => selectedIds.includes(contact.id));
      const result = await shareActiveJourney({
        uid,
        phase: journeyState.phase,
        journey: journeyState.journey,
        currentLocation: journeyState.location,
        elapsedMs: journeyState.elapsedMs,
        distanceMeters: journeyState.distance,
        tracking: journeyState.tracking,
        selectedContacts,
      });
      if (!mounted.current) return;
      if (result.status === 'cancelled') {
        setFeedback({ type: 'info', message: 'Sharing was cancelled.' });
      } else {
        onShared('Journey update handed to the device share sheet. Delivery is not tracked.');
        onClose();
      }
    } catch (failure) {
      if (mounted.current) {
        setFeedback({ type: 'error', message: getJourneyShareErrorMessage(failure) });
      }
    } finally {
      sharing.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const canShare = journeyState.phase === 'active' && selectedIds.length > 0
    && !loading && !error && !busy;

  return (
    <Modal visible={visible} transparent animationType="fade"
      onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Share journey update</Text>
            <Text style={styles.body}>
              Choose intended recipients, then select the matching person or conversation in your device share sheet.
            </Text>
            <View style={styles.privacyBox}>
              <Text style={styles.privacyText}>
                Shares your exact latest recorded location and exact destination as map links, plus status, elapsed time and distance. It excludes your path, history, account ID and contact details.
              </Text>
            </View>

            {journeyState.phase !== 'active' ? (
              <Text accessibilityRole="alert" style={styles.errorText}>
                This journey is no longer active. Close this window before continuing.
              </Text>
            ) : loading ? (
              <View style={styles.stateRow}>
                <ActivityIndicator color="#E53935" />
                <Text style={styles.body}>Loading Trusted Circle...</Text>
              </View>
            ) : error ? (
              <View>
                <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.linkButton} onPress={retry} accessibilityRole="button">
                  <Text style={styles.linkText}>Retry contacts</Text>
                </TouchableOpacity>
              </View>
            ) : activeContacts.length === 0 ? (
              <Text style={styles.body}>No active Trusted Circle contacts are available. Add or activate a contact first.</Text>
            ) : (
              <View style={styles.contactList}>
                {activeContacts.map((contact) => {
                  const selected = selectedIds.includes(contact.id);
                  return (
                    <TouchableOpacity key={contact.id} style={styles.contactRow} onPress={() => toggle(contact.id)}
                      accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: busy }}>
                      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                        <Text style={styles.checkmark}>{selected ? '\u2713' : ''}</Text>
                      </View>
                      <View style={styles.contactText}>
                        <Text style={styles.contactName}>{contact.targetName}</Text>
                        {contact.relationship ? <Text style={styles.relationship}>{contact.relationship}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {feedback && (
              <Text accessibilityLiveRegion="polite"
                style={feedback.type === 'error' ? styles.errorText : styles.infoText}>
                {feedback.message}
              </Text>
            )}
            {busy && <View style={styles.stateRow}><ActivityIndicator color="#E53935" /><Text style={styles.body}>Opening share sheet...</Text></View>}
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose} disabled={busy}
                accessibilityRole="button"><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.button, !canShare && styles.disabled]} onPress={share}
                disabled={!canShare} accessibilityRole="button" accessibilityState={{ disabled: !canShare }}>
                <Text style={styles.buttonText}>Open share sheet</Text>
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
  dialog: { maxHeight: '88%', width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 16 },
  content: { padding: 22 },
  title: { fontSize: 21, fontWeight: '700', color: '#212121', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, color: '#616161' },
  privacyBox: { backgroundColor: '#E3F2FD', borderRadius: 9, padding: 11, marginTop: 12 },
  privacyText: { color: '#0D47A1', fontSize: 13, lineHeight: 18 },
  stateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 18 },
  contactList: { marginTop: 14, gap: 8 },
  contactRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderColor: '#E0E0E0', borderRadius: 10, padding: 11 },
  checkbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: '#757575',
    alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkboxSelected: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  checkmark: { color: '#FFF', fontWeight: '700' },
  contactText: { flex: 1 },
  contactName: { color: '#212121', fontSize: 16, fontWeight: '600' },
  relationship: { color: '#757575', fontSize: 13, marginTop: 2 },
  errorText: { color: '#B71C1C', fontSize: 13, lineHeight: 18, marginTop: 14, textAlign: 'center' },
  infoText: { color: '#1565C0', fontSize: 13, lineHeight: 18, marginTop: 14, textAlign: 'center' },
  linkButton: { paddingVertical: 10, alignItems: 'center' },
  linkText: { color: '#1976D2', fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  button: { minHeight: 44, backgroundColor: '#1976D2', borderRadius: 9, paddingHorizontal: 16,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E53935' },
  buttonText: { color: '#FFF', fontWeight: '700' },
  cancelText: { color: '#C62828', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
