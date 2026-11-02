import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, Button, AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { getPendingRequests, acceptLinkRequest, rejectLinkRequest, revokeChildLink } from '../../services/parentChildAccounts';

import { startChildLocationTracking } from '../../services/childLocationTracking';
import { broadcastChildLiveLocation, getChildLinks, childSendCheckIn, triggerChildSOS } from '../../services/parentChildService';

export default function ChildDashboardScreen() {
  const { user } = useAuth();
  const focused = useIsFocused();
  const [sharing, setSharing] = useState(false);
  const [locationStatus, setLocationStatus] = useState('Location sharing is stopped');
  const [links, setLinks] = useState([]);
  const [appState, setAppState] = useState(AppState.currentState || 'active');
  useEffect(() => { const subscription = AppState.addEventListener('change', setAppState); return () => subscription.remove(); }, []);
  useEffect(() => {
    if (!sharing || !focused || appState !== 'active') { setLocationStatus(sharing ? 'Paused while this screen is inactive' : 'Location sharing is stopped'); return; }
    return startChildLocationTracking({
      publish: (coords, active) => broadcastChildLiveLocation(user.uid, coords, '', active),
      onStatus: setLocationStatus,
      onError: e => setLocationStatus(e.message),
    });
  }, [sharing, focused, appState, user.uid]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try { const [pending, active] = await Promise.all([getPendingRequests(user.uid), getChildLinks()]); setRequests(pending); setLinks(active); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, [user.uid]);
  async function respond(id, accept) {
    setBusy(true);
    try { await (accept ? acceptLinkRequest(id) : rejectLinkRequest(id)); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function revoke(id) {
    setBusy(true);
    try { await revokeChildLink(id); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function safetyAction(sos) {
    setBusy(true);
    try { await (sos ? triggerChildSOS(user.uid) : childSendCheckIn(user.uid)); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
    <Text style={{ fontSize: 24 }}>My Family</Text>
    <Text>Share this account ID only with your parent or guardian:</Text>
    <Text selectable>{user.uid}</Text>
    <Text>Location sharing works while this screen is open and the app is in the foreground. Accepted parents can read your last received position until you unlink them.</Text>
    <Text accessibilityLiveRegion="polite">{locationStatus}</Text>
    <Button title={sharing ? 'Stop location sharing' : 'Start location sharing'} onPress={() => setSharing(!sharing)} />
    <Button title="Send safe check-in" disabled={busy} onPress={() => safetyAction(false)} />
    <Button title="Request emergency help from family" disabled={busy} onPress={() => safetyAction(true)} />
    {links.map(link => <View key={link.id}>
      <Text>Linked parent: {link.ownerName}</Text>
      <Text selectable>Parent account: {link.ownerUid}</Text>
      <Button title="Unlink this parent" disabled={busy} onPress={() => revoke(link.id)} />
      {link.checkInRequested && <Text>Your parent requested a check-in. Use Send safe check-in to respond.</Text>}
    </View>)}
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
