import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, Button, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getChildById, saveSafeZone, deleteSafeZone } from '../../services/parentChildService';

export default function SafeZonesScreen() {
  const { params } = useRoute(); const linkId = params?.childId;
  const [child, setChild] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState(''); const [radius, setRadius] = useState('250');
  async function load() {
    try { setChild(await getChildById(linkId)); setError(''); } catch (e) { setChild(null); setError(e.message); }
  }
  useEffect(() => { if (linkId) load(); else setError('Choose a child from the Family screen.'); }, [linkId]);
  async function save() {
    setBusy(true);
    try {
      if (!latitude.trim() || !longitude.trim()) throw new Error('Enter both coordinates or use the last received location.');
      await saveSafeZone(linkId, { name, latitude: Number(latitude), longitude: Number(longitude), radius: Number(radius) });
      setName(''); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    try { await deleteSafeZone(linkId, id); await load(); } catch (e) { setError(e.message); }
  }
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text style={{ fontSize: 24 }}>Safe zones</Text>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {child && <>
      <Text>Set a real centre and radius. Zone membership uses the last received GPS position.</Text>
      {child.safeZones.map(zone => <View key={zone.id} style={{ gap: 10 }}>
        <Text>{zone.name}: {zone.radius} m ({zone.isInside ? 'Inside' : 'Outside or unavailable'})</Text>
        <Button title={`Delete ${zone.name}`} onPress={() => remove(zone.id)} disabled={busy} />
      </View>)}
      <TextInput accessibilityLabel="Zone name" placeholder="Zone name" value={name} onChangeText={setName} />
      <TextInput accessibilityLabel="Latitude" placeholder="Latitude" value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" />
      <TextInput accessibilityLabel="Longitude" placeholder="Longitude" value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" />
      <TextInput accessibilityLabel="Radius in metres" placeholder="Radius in metres" value={radius} onChangeText={setRadius} keyboardType="numeric" />
      <Button title="Use last received location" disabled={!child.lastLocation} onPress={() => { setLatitude(String(child.lastLocation.latitude)); setLongitude(String(child.lastLocation.longitude)); }} />
      <Button title={busy ? 'Saving...' : 'Save safe zone'} onPress={save} disabled={busy} />
    </>}
  </ScrollView>;
}
