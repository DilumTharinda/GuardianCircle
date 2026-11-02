import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, Button } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { getPendingRequests, acceptLinkRequest, rejectLinkRequest } from '../../services/parentChildAccounts';

export default function ChildDashboardScreen() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try { setRequests(await getPendingRequests(user.uid)); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, [user.uid]);
  async function respond(id, accept) {
    setBusy(true);
    try { await (accept ? acceptLinkRequest(id) : rejectLinkRequest(id)); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
    <Text style={{ fontSize: 24 }}>My Family</Text>
    <Text>Share this account ID only with your parent or guardian:</Text>
    <Text selectable>{user.uid}</Text>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    <Button title="Refresh requests" onPress={load} disabled={busy} />
    {!requests.length && <Text>No pending requests.</Text>}
    {requests.map(request => <View key={request.id} style={{ gap: 10 }}>
      <Text>{request.ownerName} requests access to your location and safety updates.</Text>
      <Text selectable>Parent account: {request.ownerUid}</Text>
      <Button title="Accept tracking" onPress={() => respond(request.id, true)} disabled={busy} />
      <Button title="Reject" onPress={() => respond(request.id, false)} disabled={busy} />
    </View>)}
  </ScrollView>;
}
