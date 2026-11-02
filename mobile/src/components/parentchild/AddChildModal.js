import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Button } from 'react-native';
import { sendLinkRequest } from '../../services/parentChildAccounts';

export default function AddChildModal({ visible, onClose, onSuccess }) {
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true); setError('');
    try {
      const request = await sendLinkRequest(null, { id: accountId });
      setAccountId(''); onSuccess(request); onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={{ padding: 24, gap: 20 }}>
      <Text style={{ fontSize: 22 }}>Link a child account</Text>
      <Text>Ask your child to share the account ID displayed on their Family screen. Tracking starts only after they accept your request.</Text>
      <TextInput accessibilityLabel="Child account ID" placeholder="Child account ID" value={accountId} onChangeText={setAccountId} autoCapitalize="none" autoCorrect={false} style={{ borderWidth: 1, padding: 12 }} />
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      <Button title={busy ? 'Sending...' : 'Send request'} disabled={busy || !accountId.trim()} onPress={submit} />
      <Button title="Cancel" disabled={busy} onPress={onClose} />
    </View>
  </Modal>;
}
