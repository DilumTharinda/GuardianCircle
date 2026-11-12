import { FamilyScreen as ScrollView, FamilyText as Text, FamilyButton as Button } from '../../components/parentchild/FamilyUI';
import React, { useEffect, useState } from 'react';
import { View, Platform, Linking } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getChildById, subscribeToChildLiveLocation, sendCheckInRequest } from '../../services/parentChildService';
let MapView, Marker;
if (Platform.OS !== 'web') { const maps = require('react-native-maps'); MapView = maps.default; Marker = maps.Marker; }

export default function ChildLocationScreen() {
  const { params } = useRoute(); const linkId = params?.childId;
  const [child, setChild] = useState(null); const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true; setChild(null); setError('');
    if (!linkId) { setError('Choose a child from the Family screen.'); return; }
    getChildById(linkId).then(value => { if (active) setChild(value); }).catch(e => { if (active) setError(e.message); });
    const stop = subscribeToChildLiveLocation(linkId, value => { if (active) { setChild(value); setError(''); } }, e => { if (active) { setChild(null); setError(e.message); } });
    return () => { active = false; stop(); };
  }, [linkId]);
  async function request() {
    try { await sendCheckInRequest(linkId); setMessage('Request saved. Your child will see it when their app refreshes.'); }
    catch (e) { setError(e.message); }
  }
  const location = child?.lastLocation;
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {child && <>
      <Text style={{ fontSize: 24 }}>{child.targetName}</Text>
      {child.sosActive && <Text>Emergency help requested</Text>}
      {!location && <Text>No location has been received from the child device.</Text>}
      {location && <>
        <Text>Updated: {location.timestamp ? new Date(location.timestamp).toLocaleString() : 'Timestamp unavailable'}</Text>
        <Text>Coordinates: {location.latitude}, {location.longitude}</Text>
        <Text>Accuracy: {location.accuracy == null ? 'Unavailable' : `${Math.round(location.accuracy)} metres`}</Text>
        {MapView ? <View style={{ height: 340 }}><MapView style={{ flex: 1 }} region={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.015, longitudeDelta: 0.015 }}><Marker coordinate={location} title={child.targetName} /></MapView></View> : <Button title="Open location in map" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`)} />}
      </>}
      <Button title="Request check-in" onPress={request} />
      {!!message && <Text>{message}</Text>}
    </>}
  </ScrollView>;
}
