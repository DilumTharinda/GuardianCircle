import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants/theme';
import { useTrustedContacts } from '../../hooks/useTrustedContacts';
import {
  addTrustedContact, deleteTrustedContact, getTrustedCircleErrorMessage,
  updateTrustedContact, validateTrustedContact,
} from '../../services/trustedCircleService';

const EMPTY_FORM = { targetName: '', targetPhone: '', relationship: '' };

function Button({ title, onPress, disabled, secondary, accessibilityLabel }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, error, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={COLORS.textSecondary}
        style={[styles.input, error && styles.invalidInput]} {...props} />
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function TrustedCircleContent({ uid }) {
  const { contacts, loading, error, retry } = useTrustedContacts(uid);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const pending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function openEditor(contact) {
    setEditor(contact ? { id: contact.id } : {});
    setForm(contact ? {
      targetName: contact.targetName || '',
      targetPhone: contact.targetPhone || '',
      relationship: contact.relationship || '',
    } : { ...EMPTY_FORM });
    setFieldErrors({});
    setActionError(null);
    setNotice(null);
  }

  function closeDialog() {
    if (pending.current) return;
    setEditor(null);
    setDeleting(null);
    setActionError(null);
  }

  function changeField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: null }));
    setActionError(null);
  }

  async function performAction(action, message) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      if (mounted.current) {
        setEditor(null);
        setDeleting(null);
        setNotice(message);
      }
    } catch (failure) {
      if (mounted.current) setActionError(getTrustedCircleErrorMessage(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function saveContact() {
    const { values, errors } = validateTrustedContact(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    const duplicate = contacts.some((contact) => (
      contact.id !== editor?.id
      && validateTrustedContact(contact).values.targetPhone.replace(/^\+/, '')
        === values.targetPhone.replace(/^\+/, '')
    ));
    if (duplicate) {
      setFieldErrors({ targetPhone: 'This phone number is already in your trusted circle.' });
      return;
    }
    performAction(
      () => editor?.id ? updateTrustedContact(uid, editor.id, values) : addTrustedContact(uid, values),
      editor?.id ? 'Contact updated.' : 'Contact added.'
    );
  }

  const unavailable = loading || Boolean(error) || busy;
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Trusted Circle</Text>
        <Text style={styles.subtitle}>Manage the people you can contact in an emergency.</Text>
        <Button title="Add contact" onPress={() => openEditor(null)} disabled={unavailable} />
        {notice && !error ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.subtitle}>Loading trusted contacts...</Text>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Button title="Retry" onPress={retry} secondary />
          </View>
        ) : contacts.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.cardTitle}>No trusted contacts yet</Text>
            <Text style={styles.subtitle}>Add someone you trust to keep their contact details here.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            <Text style={styles.count}>{contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}</Text>
            {contacts.map((contact) => (
              <View key={contact.id} style={styles.card}>
                <Text style={styles.cardTitle}>{contact.targetName}</Text>
                <Text selectable style={styles.phone}>{contact.targetPhone}</Text>
                {contact.relationship ? <Text style={styles.relationship}>{contact.relationship}</Text> : null}
                {contact.status === 'pending' ? <Text style={styles.relationship}>Pending connection</Text> : null}
                <View style={styles.actions}>
                  <Button title="Edit" accessibilityLabel={`Edit ${contact.targetName}`} secondary
                    disabled={busy} onPress={() => openEditor(contact)} />
                  <Button title="Delete" accessibilityLabel={`Delete ${contact.targetName}`} secondary
                    disabled={busy} onPress={() => {
                      setDeleting(contact);
                      setActionError(null);
                      setNotice(null);
                    }} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <Modal visible={Boolean(editor || deleting)} transparent animationType="fade" onRequestClose={closeDialog}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContent}>
              <Text style={styles.dialogTitle}>
                {deleting ? 'Delete contact?' : editor?.id ? 'Edit contact' : 'Add contact'}
              </Text>
              {deleting ? (
                <Text style={styles.subtitle}>Remove {deleting.targetName} from your trusted circle?</Text>
              ) : (
                <>
                  <Field label="Name (required)" value={form.targetName} autoCapitalize="words"
                    placeholder="Contact name" maxLength={80} editable={!busy}
                    onChangeText={(value) => changeField('targetName', value)} error={fieldErrors.targetName} />
                  <Field label="Phone number (required)" value={form.targetPhone} keyboardType="phone-pad"
                    placeholder="e.g. +94 77 123 4567" maxLength={40} editable={!busy}
                    onChangeText={(value) => changeField('targetPhone', value)} error={fieldErrors.targetPhone} />
                  <Text style={styles.hint}>Include the country code where possible.</Text>
                  <Field label="Relationship (optional)" value={form.relationship} autoCapitalize="words"
                    placeholder="e.g. Parent, friend, neighbour" maxLength={40} editable={!busy}
                    onChangeText={(value) => changeField('relationship', value)} error={fieldErrors.relationship} />
                </>
              )}
              {actionError || error ? (
                <Text accessibilityRole="alert" style={styles.errorText}>{actionError || error}</Text>
              ) : null}
              {busy ? (
                <View style={styles.saving}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.hint}>Saving changes...</Text>
                </View>
              ) : null}
              <View style={styles.actions}>
                <Button title="Cancel" onPress={closeDialog} disabled={busy} secondary />
                <Button title={deleting ? 'Delete contact' : 'Save contact'} disabled={unavailable}
                  onPress={deleting
                    ? () => performAction(() => deleteTrustedContact(uid, deleting.id), 'Contact deleted.')
                    : saveContact} />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export default function TrustedCircleScreen() {
  const { user, loading } = useAuth();
  if (loading) {
    return <View style={styles.state}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }
  // Remount local form/mutation state when accounts change.
  return <TrustedCircleContent key={user?.uid || 'signed-out'} uid={user?.uid} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, lineHeight: 23, marginVertical: 12 },
  button: { minHeight: 46, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', color: COLORS.card },
  secondaryButton: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.primary },
  secondaryButtonText: { color: COLORS.primaryDark },
  disabled: { opacity: 0.5 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  list: { gap: 12, marginTop: 24 },
  count: { fontSize: 14, color: COLORS.textSecondary },
  card: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.borderDark,
    borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 19, fontWeight: '600', color: COLORS.textPrimary },
  phone: { fontSize: 17, color: COLORS.textPrimary, marginTop: 8 },
  relationship: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  notice: { color: COLORS.safeGreen, fontSize: 15, marginTop: 16 },
  overlay: { flex: 1, backgroundColor: COLORS.overlay, padding: 20, justifyContent: 'center' },
  dialog: { backgroundColor: COLORS.card, borderRadius: 16, maxHeight: '90%', width: '100%',
    maxWidth: 520, alignSelf: 'center' },
  dialogContent: { padding: 24 },
  dialogTitle: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: COLORS.borderDark, borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 12, minHeight: 48, fontSize: 16, color: COLORS.textPrimary },
  invalidInput: { borderColor: COLORS.dangerRed },
  errorText: { color: COLORS.dangerRed, fontSize: 14, lineHeight: 21, marginTop: 6 },
  hint: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12, flexShrink: 1 },
  saving: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
});
