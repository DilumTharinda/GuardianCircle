import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { getPetsAndItems, addPetOrItem, deletePetOrItem } from '../../services/parentChildService';
export default function PetItemSection() {
  const [items, setItems] = useState([]); const [name, setName] = useState(''); const [type, setType] = useState('pet'); const [error, setError] = useState('');
  async function load() { try { setItems(await getPetsAndItems()); setError(''); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  async function add() { try { await addPetOrItem(null, { name, type }); setName(''); await load(); } catch (e) { setError(e.message); } }
  async function remove(id) { try { await deletePetOrItem(id); await load(); } catch (e) { setError(e.message); } }
  return <View style={{ gap: 12 }}>
    <Text style={{ fontSize: 22 }}>Pet and valuable profiles</Text>
    <Text>Hardware location, battery and proximity are unavailable.</Text>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {items.map(item => <View key={item.id}><Text>{item.name} ({item.type})</Text><Button title={`Remove ${item.name}`} onPress={() => remove(item.id)} /></View>)}
    <TextInput accessibilityLabel="Pet or item name" placeholder="Profile name" value={name} onChangeText={setName} />
    <Button title={`Type: ${type} (tap to change)`} onPress={() => setType(type === 'pet' ? 'item' : 'pet')} />
    <Button title="Add profile" onPress={add} disabled={!name.trim()} />
  </View>;
}
