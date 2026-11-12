import { FamilyScreen as ScrollView, FamilyText as Text, FamilyButton as Button } from '../../components/parentchild/FamilyUI';
import React, { useCallback, useState } from 'react';
import { View, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getChildren, unlinkChild } from '../../services/parentChildService';
import { ROUTES } from '../../constants/routes';
import PetItemSection from '../../components/parentchild/PetItemSection';
import AddChildModal from '../../components/parentchild/AddChildModal';

export default function ParentDashboardScreen() {
  const { user } = useAuth(); const { colors } = useTheme(); const navigation = useNavigation();
  const [children, setChildren] = useState([]); const [busy, setBusy] = useState(true);
  const [error, setError] = useState(''); const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    try { setChildren(await getChildren(user.uid)); setError(''); }
    catch (e) { setChildren([]); setError(e.message); }
    finally { setBusy(false); }
  }, [user.uid]);
  useFocusEffect(useCallback(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, [load]));
  async function remove(id) {
    try { await unlinkChild(id); await load(); } catch (e) { setError(e.message); }
  }
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, gap: 18 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
    <Text style={{ fontSize: 26, color: colors.textPrimary }}>Family safety</Text>
    <Text style={{ color: colors.textSecondary }}>Location and safety updates from linked child accounts.</Text>
    <Button title="Link a child account" onPress={() => setAdding(true)} />
    {busy && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {!busy && !error && !children.length && <Text>No accepted links yet. Send a request and ask your child to accept it.</Text>}
    {children.map(child => <View key={child.id} style={{ backgroundColor: colors.surface, padding: 18, borderRadius: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, color: colors.textPrimary }}>{child.targetName}</Text>
      {child.sosActive && <Text style={{ color: colors.dangerRed }}>Emergency help requested. Contact your child immediately.</Text>}
      <Text>{child.currentZoneName}</Text>
      <Text>{child.lastLocation?.timestamp ? `Last update: ${new Date(child.lastLocation.timestamp).toLocaleString()}` : 'No device location received'}</Text>
      <Text>{child.isOnline ? 'Recent location received' : 'Location unavailable or older than 2 minutes'}</Text>
      <Button title="View location" onPress={() => navigation.navigate(ROUTES.CHILD_LOCATION, { childId: child.id })} />
      <Button title="Manage safe zones" onPress={() => navigation.navigate(ROUTES.SAFE_ZONES, { childId: child.id })} />
      <Button title="View history" onPress={() => navigation.navigate(ROUTES.CHILD_HISTORY, { childId: child.id })} />
      <Button title="Unlink account" onPress={() => remove(child.id)} />
    </View>)}
    <PetItemSection />
    <AddChildModal visible={adding} onClose={() => setAdding(false)} onSuccess={load} />
  </ScrollView>;
}
