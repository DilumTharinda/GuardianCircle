import { FamilyScreen as ScrollView, FamilyText as Text, FamilyButton as Button } from '../../components/parentchild/FamilyUI';
import React, { useEffect, useState } from 'react';
import { View, Share } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getChildHistory, clearChildHistory } from '../../services/parentChildService';

export default function ChildHistoryScreen() {
  const { params } = useRoute(); const linkId = params?.childId;
  const [events, setEvents] = useState([]); const [day, setDay] = useState('today'); const [error, setError] = useState('');
  async function load() {
    try { setEvents(await getChildHistory(linkId, day)); setError(''); } catch (e) { setEvents([]); setError(e.message); }
  }
  useEffect(() => { if (linkId) load(); else setError('Choose a child from the Family screen.'); }, [linkId, day]);
  async function clear() { try { await clearChildHistory(linkId); await load(); } catch (e) { setError(e.message); } }
  async function share() {
    try { await Share.share({ message: events.map(e => `${e.fullDate}: ${e.title}`).join('\n') || 'No recorded events for this date.' }); }
    catch (e) { setError(e.message); }
  }
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text style={{ fontSize: 24 }}>Recorded safety events</Text>
    <Button title={day === 'today' ? 'Show yesterday' : 'Show today'} onPress={() => setDay(day === 'today' ? 'yesterday' : 'today')} />
    <Button title="Refresh" onPress={load} />
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {!error && !events.length && <Text>No events recorded for this day.</Text>}
    {events.map(event => <View key={event.id}><Text>{event.title}</Text><Text>{event.timestamp}</Text></View>)}
    <Button title="Share recorded events" onPress={share} disabled={!events.length} />
    <Button title="Clear history" onPress={clear} disabled={!events.length} />
  </ScrollView>;
}
