import * as Location from 'expo-location';
import { auth, db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where, serverTimestamp, updateDoc, setDoc, deleteDoc, addDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { requireTrackingRole } from './parentChildAccounts';
import { ROLES } from '../constants/roles';
export { sendLinkRequest, getPendingRequests, acceptLinkRequest } from './parentChildAccounts';

export function validCoordinates(coords) {
  return !!coords && Number.isFinite(coords.latitude) && Math.abs(coords.latitude) <= 90
    && Number.isFinite(coords.longitude) && Math.abs(coords.longitude) <= 180;
}
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!validCoordinates({ latitude: lat1, longitude: lon1 }) || !validCoordinates({ latitude: lat2, longitude: lon2 })) return Infinity;
  const rad = value => value * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))));
}
export function isInsideZone(location, zone) {
  return !!zone && Number.isFinite(zone.radius) && zone.radius > 0 && calculateDistance(location?.latitude, location?.longitude, zone.latitude, zone.longitude) <= zone.radius;
}
const iso = timestamp => timestamp?.toDate?.()?.toISOString() || null;
const rows = snapshot => snapshot.docs.map(d => ({ ...d.data(), id: d.id }));

export async function requireParentLink(linkId) {
  const parent = await requireTrackingRole(ROLES.PARENT_GUARDIAN);
  const snapshot = await getDoc(doc(db, 'm5Links', linkId));
  if (!snapshot.exists() || snapshot.data().ownerUid !== parent.uid || snapshot.data().status !== 'active') throw new Error('This child is not linked to your account.');
  return { ...snapshot.data(), id: snapshot.id };
}
function mergeLocation(link, live) {
  const lastLocation = validCoordinates(live) ? { latitude: live.latitude, longitude: live.longitude,
    address: live.address || '', timestamp: iso(live.updatedAt), accuracy: live.accuracy ?? null } : null;
  const safeZones = (link.safeZones || []).map(zone => ({ ...zone, isInside: isInsideZone(lastLocation, zone) }));
  return { ...link, lastLocation, safeZones, sosActive: live?.sosActive === true,
    sosTimestamp: iso(live?.sosTimestamp), batteryLevel: null,
    isOnline: !!lastLocation?.timestamp && Date.now() - Date.parse(lastLocation.timestamp) < 120000,
    currentZoneName: safeZones.find(zone => zone.isInside)?.name || (lastLocation ? 'Outside safe zones' : 'Location unavailable'),
    speed: Number.isFinite(live?.speed) && live.speed >= 0 ? `${(live.speed * 3.6).toFixed(1)} km/h` : 'Speed unavailable' };
}
export async function getChildren(parentUid) {
  const parent = await requireTrackingRole(ROLES.PARENT_GUARDIAN);
  if (parentUid && parentUid !== parent.uid) throw new Error('Access denied.');
  const links = rows(await getDocs(query(collection(db, 'm5Links'), where('ownerUid', '==', parent.uid))));
  const children = await Promise.all(links.filter(link => link.status === 'active').map(async link => {
    const snapshot = await getDoc(doc(db, 'm5Locations', link.targetUid));
    return mergeLocation(link, snapshot.exists() ? snapshot.data() : null);
  }));
  if (auth.currentUser?.uid !== parent.uid) throw new Error('Session changed.');
  return children;
}
export async function getChildById(linkId) {
  const link = await requireParentLink(linkId);
  const snapshot = await getDoc(doc(db, 'm5Locations', link.targetUid));
  return mergeLocation(link, snapshot.exists() ? snapshot.data() : null);
}
export function subscribeToChildLiveLocation(linkId, onUpdate, onError = () => {}) {
  let cancelled = false; let unsubscribe = () => {};
  requireParentLink(linkId).then(link => {
    if (cancelled) return;
    unsubscribe = onSnapshot(doc(db, 'm5Locations', link.targetUid), snapshot => {
      if (!cancelled) onUpdate(mergeLocation(link, snapshot.exists() ? snapshot.data() : null));
    }, error => { if (!cancelled) onError(error); });
  }).catch(error => { if (!cancelled) onError(error); });
  return () => { cancelled = true; unsubscribe(); };
}
export async function unlinkChild(linkId) {
  await requireParentLink(linkId);
  await updateDoc(doc(db, 'm5Links', linkId), { status: 'revoked', updatedAt: serverTimestamp() });
}
export async function getSafeZones(linkId) { return (await requireParentLink(linkId)).safeZones || []; }
export async function saveSafeZone(linkId, data) {
  const link = await requireParentLink(linkId);
  if (!data.name?.trim() || !validCoordinates(data) || !Number.isFinite(data.radius) || data.radius < 25 || data.radius > 5000) throw new Error('Enter a name, valid coordinates and a radius between 25 and 5000 metres.');
  const zone = { id: data.id || doc(collection(db, 'm5Links')).id, name: data.name.trim(), latitude: data.latitude,
    longitude: data.longitude, radius: data.radius, icon: data.icon || 'location-outline', color: data.color || '#1976D2',
    notifyOnEntry: data.notifyOnEntry !== false, notifyOnExit: data.notifyOnExit !== false };
  const zones = [...(link.safeZones || []).filter(z => z.id !== zone.id), zone];
  if (zones.length > 20) throw new Error('A maximum of 20 safe zones is supported per child.');
  await updateDoc(doc(db, 'm5Links', linkId), { safeZones: zones, updatedAt: serverTimestamp() });
  return zone;
}
export async function deleteSafeZone(linkId, zoneId) {
  const link = await requireParentLink(linkId);
  await updateDoc(doc(db, 'm5Links', linkId), { safeZones: (link.safeZones || []).filter(z => z.id !== zoneId), updatedAt: serverTimestamp() });
}
export async function getChildHistory(linkId, day = 'today', category = 'all') {
  await requireParentLink(linkId);
  const events = rows(await getDocs(collection(db, 'm5Links', linkId, 'events')));
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (day === 'yesterday') start.setDate(start.getDate() - 1);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return events.map(event => ({ ...event, fullDate: iso(event.createdAt) }))
    .filter(event => event.fullDate && Date.parse(event.fullDate) >= +start && Date.parse(event.fullDate) < +end && (category === 'all' || event.category === category))
    .sort((a, b) => Date.parse(b.fullDate) - Date.parse(a.fullDate))
    .map(event => ({ ...event, timestamp: new Date(event.fullDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }));
}
export async function clearChildHistory(linkId) {
  await requireParentLink(linkId);
  const snapshot = await getDocs(collection(db, 'm5Links', linkId, 'events'));
  // Each batch stays below Firestore's write limit.
  for (let start = 0; start < snapshot.docs.length; start += 400) {
    const batch = writeBatch(db); snapshot.docs.slice(start, start + 400).forEach(d => batch.delete(d.ref)); await batch.commit();
  }
}
export async function sendCheckInRequest(linkId) {
  await requireParentLink(linkId);
  await updateDoc(doc(db, 'm5Links', linkId), { checkInRequested: true, updatedAt: serverTimestamp() });
  return { success: true };
}
async function ownLinks() {
  const child = await requireTrackingRole(ROLES.CHILD_DEPENDENT);
  return { child, links: rows(await getDocs(query(collection(db, 'm5Links'), where('targetUid', '==', child.uid)))).filter(link => link.status === 'active') };
}
export async function getChildLinks() { return (await ownLinks()).links; }
async function childAction(childUid, data, title, category) {
  const { child, links } = await ownLinks();
  if (childUid !== child.uid) throw new Error('Only the child device can publish this update.');
  const batch = writeBatch(db);
  batch.set(doc(db, 'm5Locations', child.uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  for (const link of links) {
    batch.set(doc(collection(db, 'm5Links', link.id, 'events')), { title, category, description: title, createdAt: serverTimestamp(), actorUid: child.uid });
    if (category === 'checkin') batch.update(doc(db, 'm5Links', link.id), { checkInRequested: false, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}
export async function childSendCheckIn(childUid, note = "I'm safe") {
  await childAction(childUid, { lastCheckIn: serverTimestamp(), checkInNote: note.slice(0, 200), sosActive: false, sosTimestamp: null }, 'Child checked in: safe', 'checkin');
}
export async function triggerChildSOS(childUid) {
  await childAction(childUid, { sosActive: true, sosTimestamp: serverTimestamp() }, 'Child requested emergency help', 'alert');
}
export async function getCurrentDeviceLocation() {
  const result = await Location.requestForegroundPermissionsAsync();
  if (result.status !== 'granted') throw new Error('Location permission is required to share your position.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { success: true, coords: position.coords, address: '' };
}
export async function broadcastChildLiveLocation(childUid, coords = null, address = '', isActive = () => true) {
  const child = await requireTrackingRole(ROLES.CHILD_DEPENDENT);
  if (childUid !== child.uid) throw new Error('Only your own device location can be published.');
  const position = coords || (await getCurrentDeviceLocation()).coords;
  if (!validCoordinates(position)) throw new Error('Invalid GPS coordinates.');
  const [previous, linkSnapshot] = await Promise.all([
    getDoc(doc(db, 'm5Locations', child.uid)),
    getDocs(query(collection(db, 'm5Links'), where('targetUid', '==', child.uid))),
  ]);
  if (!isActive() || auth.currentUser?.uid !== child.uid) return;
  const batch = writeBatch(db);
  batch.set(doc(db, 'm5Locations', child.uid), { latitude: position.latitude, longitude: position.longitude,
    accuracy: Number.isFinite(position.accuracy) && position.accuracy >= 0 ? position.accuracy : null,
    speed: Number.isFinite(position.speed) ? position.speed : null, address, updatedAt: serverTimestamp() }, { merge: true });
  if (previous.exists() && validCoordinates(previous.data())) {
    for (const link of rows(linkSnapshot).filter(link => link.status === 'active')) {
      for (const zone of link.safeZones || []) {
        const wasInside = isInsideZone(previous.data(), zone);
        const inside = isInsideZone(position, zone);
        if (wasInside !== inside) {
          const title = `${inside ? 'Entered' : 'Left'} safe zone: ${zone.name}`;
          batch.set(doc(collection(db, 'm5Links', link.id, 'events')), { title, category: 'zone', description: title, actorUid: child.uid, createdAt: serverTimestamp() });
        }
      }
    }
  }
  await batch.commit();
}

// Pet/item profiles are account-scoped records; hardware telemetry is unavailable.
export async function getPetsAndItems() {
  const owner = await requireTrackingRole(ROLES.PARENT_GUARDIAN);
  return rows(await getDocs(query(collection(db, 'm5Items'), where('ownerUid', '==', owner.uid))));
}
export async function addPetOrItem(ownerUid, data) {
  const owner = await requireTrackingRole(ROLES.PARENT_GUARDIAN);
  if (!data?.name?.trim()) throw new Error('Enter a profile name.');
  const record = { ownerUid: owner.uid, name: data.name.trim(), type: data.type === 'pet' ? 'pet' : 'item',
    avatarEmoji: data.avatarEmoji || '', notes: data.notes || '', status: 'unavailable', batteryLevel: null,
    distanceEstimate: 'Hardware telemetry unavailable', lastSeen: 'Unavailable', createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db, 'm5Items'), record); return { ...record, id: ref.id };
}
export async function deletePetOrItem(itemId) {
  const owner = await requireTrackingRole(ROLES.PARENT_GUARDIAN);
  const ref = doc(db, 'm5Items', itemId); const snapshot = await getDoc(ref);
  if (!snapshot.exists() || snapshot.data().ownerUid !== owner.uid) throw new Error('Access denied.');
  await deleteDoc(ref);
}
export async function toggleBleProximity() { throw new Error('Hardware proximity is unavailable.'); }
