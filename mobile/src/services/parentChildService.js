import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * TOGGLE: Set to true to strictly prevent Firebase quota consumption during development and testing.
 * When true, all operations read/write from local AsyncStorage and rich realistic mock data.
 */
export const USE_MOCK_DATA = true;

const STORAGE_KEYS = {
  CHILDREN: '@guardiancircle_mock_children_v4',
  HISTORY: '@guardiancircle_mock_history_v4',
  PETS_ITEMS: '@guardiancircle_mock_pets_items_v4',
};

// ==========================================
// HAVERSINE GEOFENCE UTILITY
// ==========================================

/**
 * Calculates distance between two coordinates in meters using the Haversine formula.
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return 0;
  }
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Evaluates whether a location coordinate is inside a given safe zone.
 */
export function isInsideZone(childLocation, zone) {
  if (!childLocation || !zone) return false;
  const distance = calculateDistance(
    childLocation.latitude,
    childLocation.longitude,
    zone.latitude,
    zone.longitude
  );
  return distance <= zone.radius;
}

// ==========================================
// INITIAL REALISTIC SRI LANKAN MOCK DATA
// ==========================================

const INITIAL_MOCK_CHILDREN = [
  {
    id: 'child_kasun_01',
    type: 'child',
    ownerUid: 'parent_user_default',
    targetUid: 'child_uid_kasun',
    targetName: 'Kasun Perera',
    targetAge: 11,
    targetPhone: '+94 77 123 4567',
    targetPhotoURL: 'https://images.unsplash.com/photo-1543332164-6e82f355badc?w=150',
    avatarEmoji: '👦',
    permissions: {
      viewLocation: true,
      receiveSOS: true,
      receiveJourney: true,
    },
    linkedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    status: 'active',
    batteryLevel: 88,
    isOnline: true,
    speed: 'Walking • 3 km/h',
    sosActive: false,
    sosTimestamp: null,
    currentZoneName: 'Ananda College, Colombo 10',
    lastLocation: {
      latitude: 6.9271,
      longitude: 79.8612,
      address: 'Ananda College, Kottawa Road / Maradana, Colombo 10',
      timestamp: new Date().toISOString(),
    },
    safeZones: [
      {
        id: 'sz_kasun_school',
        name: 'Ananda College, Colombo 10',
        icon: '🏫',
        color: '#1976D2',
        latitude: 6.9271,
        longitude: 79.8612,
        radius: 250, // meters
        isInside: true,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_kasun_home',
        name: 'Home (Havelock Town, Colombo 05)',
        icon: '🏠',
        color: '#2E7D32',
        latitude: 6.8858,
        longitude: 79.8661,
        radius: 150,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_kasun_tuition',
        name: 'Rotary Hall Tuition, Nugegoda',
        icon: '📚',
        color: '#00897B',
        latitude: 6.8728,
        longitude: 79.8913,
        radius: 200,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_kasun_park',
        name: 'Viharamahadevi Park, Colombo 07',
        icon: '🌳',
        color: '#FB8C00',
        latitude: 6.9120,
        longitude: 79.8630,
        radius: 300,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_kasun_grandma',
        name: "Grandmother's House (Kandy)",
        icon: '👵',
        color: '#7B1FA2',
        latitude: 7.2680,
        longitude: 80.6025,
        radius: 250,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
    ],
  },
  {
    id: 'child_senuri_02',
    type: 'child',
    ownerUid: 'parent_user_default',
    targetUid: 'child_uid_senuri',
    targetName: 'Senuri Jayasinghe',
    targetAge: 15,
    targetPhone: '+94 71 890 1234',
    targetPhotoURL: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    avatarEmoji: '👧',
    permissions: {
      viewLocation: true,
      receiveSOS: true,
      receiveJourney: true,
    },
    linkedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    status: 'active',
    batteryLevel: 74,
    isOnline: true,
    speed: 'Stationary • Classroom 10-B',
    sosActive: false,
    sosTimestamp: null,
    currentZoneName: 'Visakha Vidyalaya, Colombo 04',
    lastLocation: {
      latitude: 6.8883,
      longitude: 79.8596,
      address: 'Visakha Vidyalaya, Vajira Road, Bambalapitiya, Colombo 04',
      timestamp: new Date(Date.now() - 4 * 60000).toISOString(),
    },
    safeZones: [
      {
        id: 'sz_senuri_school',
        name: 'Visakha Vidyalaya, Colombo 04',
        icon: '🏫',
        color: '#1976D2',
        latitude: 6.8883,
        longitude: 79.8596,
        radius: 250,
        isInside: true,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_senuri_home',
        name: 'Home (Havelock Town, Colombo 05)',
        icon: '🏠',
        color: '#2E7D32',
        latitude: 6.8858,
        longitude: 79.8661,
        radius: 150,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_senuri_sports',
        name: 'Royal College Sports Complex',
        icon: '⚽',
        color: '#FB8C00',
        latitude: 6.9010,
        longitude: 79.8620,
        radius: 350,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_senuri_police',
        name: 'Bambalapitiya Police Station (Safe Point)',
        icon: '🛡️',
        color: '#D32F2F',
        latitude: 6.8920,
        longitude: 79.8560,
        radius: 150,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
    ],
  },
  {
    id: 'child_thisara_03',
    type: 'child',
    ownerUid: 'parent_user_default',
    targetUid: 'child_uid_thisara',
    targetName: 'Thisara Fernando',
    targetAge: 8,
    targetPhone: '+94 76 543 2109',
    targetPhotoURL: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=150',
    avatarEmoji: '🧒',
    permissions: {
      viewLocation: true,
      receiveSOS: true,
      receiveJourney: true,
    },
    linkedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    status: 'active',
    batteryLevel: 92,
    isOnline: true,
    speed: 'Stationary • Primary Block',
    sosActive: false,
    sosTimestamp: null,
    currentZoneName: 'Kelaniya Junior Primary School',
    lastLocation: {
      latitude: 6.9744,
      longitude: 79.9161,
      address: 'Kelaniya Junior Primary, Kandy Road, Dalugama, Kelaniya',
      timestamp: new Date().toISOString(),
    },
    safeZones: [
      {
        id: 'sz_thisara_school',
        name: 'Kelaniya Junior Primary School',
        icon: '🏫',
        color: '#1976D2',
        latitude: 6.9744,
        longitude: 79.9161,
        radius: 200,
        isInside: true,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_thisara_home',
        name: 'Home (Kiribathgoda Residence)',
        icon: '🏠',
        color: '#2E7D32',
        latitude: 6.9780,
        longitude: 79.9280,
        radius: 150,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
      {
        id: 'sz_thisara_hospital',
        name: 'Kiribathgoda Base Hospital (Safe Haven)',
        icon: '🏥',
        color: '#D32F2F',
        latitude: 6.9800,
        longitude: 79.9320,
        radius: 200,
        isInside: false,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
    ],
  },
];

const INITIAL_MOCK_HISTORY = {
  child_kasun_01: [
    {
      id: 'hist_k1',
      type: 'safe_zone_entry',
      title: 'Entered Safe Zone',
      locationName: 'Ananda College, Colombo 10',
      timestamp: '07:45 AM',
      fullDate: new Date().toISOString(),
      category: 'zone',
      color: '#2E7D32',
      icon: '🟢',
      description: 'Kasun arrived safely inside Ananda College gate.',
    },
    {
      id: 'hist_k2',
      type: 'check_in',
      title: 'Interval Check-in',
      locationName: 'Science Lab & Library Quadrangle',
      timestamp: '11:30 AM',
      fullDate: new Date().toISOString(),
      category: 'checkin',
      color: '#1976D2',
      icon: '🔵',
      description: 'Automated check-in confirmed. Battery at 88%.',
    },
    {
      id: 'hist_k3',
      type: 'battery_info',
      title: 'Battery Status Healthy',
      locationName: 'Ananda College, Colombo 10',
      timestamp: '01:15 PM',
      fullDate: new Date().toISOString(),
      category: 'status',
      color: '#FB8C00',
      icon: '🔋',
      description: 'Device battery level: 88%. Dialog 4G connection strong.',
    },
    {
      id: 'hist_k4',
      type: 'safe_zone_exit',
      title: 'Left Safe Zone (Yesterday)',
      locationName: 'Rotary Hall Tuition, Nugegoda',
      timestamp: '05:30 PM',
      fullDate: new Date(Date.now() - 86400000).toISOString(),
      category: 'zone',
      color: '#FB8C00',
      icon: '🟡',
      description: 'Science revision class finished. Returning home by bus.',
    },
    {
      id: 'hist_k5',
      type: 'safe_zone_entry',
      title: 'Arrived at Home (Yesterday)',
      locationName: 'Home (Havelock Town, Colombo 05)',
      timestamp: '06:10 PM',
      fullDate: new Date(Date.now() - 86400000).toISOString(),
      category: 'zone',
      color: '#2E7D32',
      icon: '📍',
      description: 'Arrived home safely in Colombo 05.',
    },
  ],
  child_senuri_02: [
    {
      id: 'hist_s1',
      type: 'safe_zone_entry',
      title: 'Entered Safe Zone',
      locationName: 'Visakha Vidyalaya, Colombo 04',
      timestamp: '07:30 AM',
      fullDate: new Date().toISOString(),
      category: 'zone',
      color: '#2E7D32',
      icon: '🟢',
      description: 'Senuri entered school premises through Vajira Road gate.',
    },
    {
      id: 'hist_s2',
      type: 'check_in',
      title: 'Midday Attendance Check-in',
      locationName: 'Auditorium & Senior Hall',
      timestamp: '12:45 PM',
      fullDate: new Date().toISOString(),
      category: 'checkin',
      color: '#1976D2',
      icon: '🔵',
      description: 'Automated location broadcast verified.',
    },
    {
      id: 'hist_s3',
      type: 'safe_zone_exit',
      title: 'Left Safe Zone (Yesterday)',
      locationName: 'Royal College Sports Complex',
      timestamp: '05:15 PM',
      fullDate: new Date(Date.now() - 86400000).toISOString(),
      category: 'zone',
      color: '#FB8C00',
      icon: '🟡',
      description: 'Badminton practice concluded.',
    },
  ],
  child_thisara_03: [
    {
      id: 'hist_t1',
      type: 'safe_zone_entry',
      title: 'Entered Safe Zone',
      locationName: 'Kelaniya Junior Primary School',
      timestamp: '07:50 AM',
      fullDate: new Date().toISOString(),
      category: 'zone',
      color: '#2E7D32',
      icon: '🟢',
      description: 'Thisara arrived at school with school van.',
    },
    {
      id: 'hist_t2',
      type: 'check_in',
      title: 'Interval Check-in',
      locationName: 'School Playground',
      timestamp: '10:30 AM',
      fullDate: new Date().toISOString(),
      category: 'checkin',
      color: '#1976D2',
      icon: '🔵',
      description: 'Interval playtime check-in confirmed.',
    },
  ],
};

const INITIAL_MOCK_PETS_ITEMS = [
  {
    id: 'tag_pet_01',
    type: 'pet',
    name: 'Rocky (German Shepherd, Collar BLE)',
    tagCode: 'GC-BLE-LK01',
    avatarEmoji: '🐕',
    batteryLevel: 94,
    status: 'in_range',
    rssi: -52,
    distanceEstimate: '~2.8m away',
    lastSeen: 'Just now',
    locationAddress: 'Front Garden / Main Gate (Colombo 05)',
    isRinging: false,
  },
  {
    id: 'tag_pet_02',
    type: 'pet',
    name: 'Milo (White Persian Cat)',
    tagCode: 'GC-BLE-LK02',
    avatarEmoji: '🐈',
    batteryLevel: 89,
    status: 'in_range',
    rssi: -68,
    distanceEstimate: '~6.5m away',
    lastSeen: '2 mins ago',
    locationAddress: 'Balcony / Rooftop Area',
    isRinging: false,
  },
  {
    id: 'tag_item_01',
    type: 'item',
    name: "Kasun's School Backpack (Ananda College)",
    tagCode: 'GC-BLE-LK03',
    avatarEmoji: '🎒',
    batteryLevel: 82,
    status: 'in_range',
    rssi: -71,
    distanceEstimate: '~8.0m away',
    lastSeen: '1 min ago',
    locationAddress: 'With Kasun at Ananda College, Colombo 10',
    isRinging: false,
  },
  {
    id: 'tag_item_02',
    type: 'item',
    name: 'Yamaha Scooter & House Keys',
    tagCode: 'GC-BLE-LK04',
    avatarEmoji: '🔑',
    batteryLevel: 96,
    status: 'in_range',
    rssi: -45,
    distanceEstimate: '~1.5m away',
    lastSeen: 'Just now',
    locationAddress: 'Living Room Key Stand (Colombo 05)',
    isRinging: false,
  },
  {
    id: 'tag_item_03',
    type: 'item',
    name: 'HP Laptop Bag (Lavindi)',
    tagCode: 'GC-BLE-LK05',
    avatarEmoji: '💼',
    batteryLevel: 75,
    status: 'out_of_range',
    rssi: -94,
    distanceEstimate: 'Out of range',
    lastSeen: '35m ago',
    locationAddress: 'Study Room Table / Office',
    isRinging: false,
  },
];

// ==========================================
// LOCAL PERSISTENCE HELPERS
// ==========================================

async function getStoredChildren() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CHILDREN);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEYS.CHILDREN, JSON.stringify(INITIAL_MOCK_CHILDREN));
      return INITIAL_MOCK_CHILDREN;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[parentChildService] Storage read error, using initial mock:', err);
    return INITIAL_MOCK_CHILDREN;
  }
}

async function saveStoredChildren(children) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CHILDREN, JSON.stringify(children));
  } catch (err) {
    console.warn('[parentChildService] Storage write error:', err);
  }
}

async function getStoredHistory() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(INITIAL_MOCK_HISTORY));
      return INITIAL_MOCK_HISTORY;
    }
    return JSON.parse(raw);
  } catch (err) {
    return INITIAL_MOCK_HISTORY;
  }
}

async function saveStoredHistory(history) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch (err) {
    console.warn('[parentChildService] Storage history write error:', err);
  }
}

async function getStoredPetsItems() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PETS_ITEMS);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEYS.PETS_ITEMS, JSON.stringify(INITIAL_MOCK_PETS_ITEMS));
      return INITIAL_MOCK_PETS_ITEMS;
    }
    return JSON.parse(raw);
  } catch (err) {
    return INITIAL_MOCK_PETS_ITEMS;
  }
}

async function saveStoredPetsItems(items) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PETS_ITEMS, JSON.stringify(items));
  } catch (err) {
    console.warn('[parentChildService] Storage pets write error:', err);
  }
}

// ==========================================
// SERVICE API METHODS
// ==========================================

/**
 * Fetch all linked children for the current parent user.
 */
export async function getChildren(parentUid = 'parent_user_default') {
  if (USE_MOCK_DATA) {
    return await getStoredChildren();
  }

  try {
    const q = query(
      collection(db, 'linkedEntities'),
      where('ownerUid', '==', parentUid),
      where('type', '==', 'child'),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return await getStoredChildren(); // Graceful fallback
    }
    const results = [];
    snap.forEach((docSnap) => {
      results.push({ id: docSnap.id, ...docSnap.data() });
    });
    return results;
  } catch (err) {
    console.warn('[parentChildService] Firestore getChildren fallback:', err);
    return await getStoredChildren();
  }
}

/**
 * Get a single linked child by ID.
 */
export async function getChildById(childId) {
  const children = await getStoredChildren();
  return children.find((c) => c.id === childId) || children[0] || null;
}

/**
 * Link a child using a 6-digit device link code (e.g. "GC-849201" or "849201").
 */
export async function linkChildByCode(parentUid = 'parent_user_default', code) {
  const sanitizedCode = (code || '').toUpperCase().trim();
  if (sanitizedCode.length < 4) {
    throw new Error('Please enter a valid 6-digit link code.');
  }

  const newChild = {
    id: `child_linked_${Date.now()}`,
    type: 'child',
    ownerUid: parentUid,
    targetUid: `uid_${sanitizedCode}`,
    targetName: `Child (${sanitizedCode})`,
    targetAge: 10,
    targetPhone: '+1 (555) 000-1122',
    targetPhotoURL: null,
    avatarEmoji: '🧒',
    permissions: {
      viewLocation: true,
      receiveSOS: true,
      receiveJourney: true,
    },
    linkedAt: new Date().toISOString(),
    status: 'active',
    batteryLevel: 95,
    isOnline: true,
    speed: 'Stationary',
    sosActive: false,
    sosTimestamp: null,
    currentZoneName: 'Linked Location',
    lastLocation: {
      latitude: 6.9100,
      longitude: 79.8680,
      address: 'Main Street, Colombo 03',
      timestamp: new Date().toISOString(),
    },
    safeZones: [
      {
        id: `sz_${Date.now()}_home`,
        name: 'Home',
        icon: '🏠',
        color: '#2E7D32',
        latitude: 6.9080,
        longitude: 79.8650,
        radius: 200,
        isInside: true,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
    ],
  };

  const children = await getStoredChildren();
  const updated = [newChild, ...children];
  await saveStoredChildren(updated);

  // Also initialize history
  const history = await getStoredHistory();
  history[newChild.id] = [
    {
      id: `hist_init_${Date.now()}`,
      type: 'check_in',
      title: 'Device Linked Successfully',
      locationName: 'GuardianCircle Network',
      timestamp: 'Just now',
      fullDate: new Date().toISOString(),
      category: 'status',
      color: '#2E7D32',
      icon: '🔗',
      description: `Device linked with code ${sanitizedCode}. Tracking active.`,
    },
  ];
  await saveStoredHistory(history);

  if (!USE_MOCK_DATA) {
    try {
      await setDoc(doc(db, 'linkedEntities', `${parentUid}_${newChild.targetUid}`), {
        ...newChild,
        linkedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[parentChildService] Firestore write failed:', err);
    }
  }

  return newChild;
}

/**
 * Create a managed child profile (child without their own phone/account).
 */
export async function createManagedChildProfile(parentUid = 'parent_user_default', data) {
  if (!data?.name?.trim()) {
    throw new Error("Please provide child's name.");
  }

  const newChild = {
    id: `child_managed_${Date.now()}`,
    type: 'child',
    ownerUid: parentUid,
    targetUid: null, // null for managed profile
    targetName: data.name.trim(),
    targetAge: data.age ? parseInt(data.age, 10) : 8,
    targetPhone: data.phone || '+1 (555) 000-9988',
    targetPhotoURL: null,
    avatarEmoji: data.gender === 'female' ? '👧' : '👦',
    permissions: {
      viewLocation: true,
      receiveSOS: true,
      receiveJourney: true,
    },
    linkedAt: new Date().toISOString(),
    status: 'active',
    batteryLevel: 100,
    isOnline: true,
    speed: 'Stationary',
    sosActive: false,
    sosTimestamp: null,
    currentZoneName: data.defaultZoneName || 'Home (Residence)',
    lastLocation: {
      latitude: data.latitude || 6.9080,
      longitude: data.longitude || 79.8650,
      address: data.address || 'Colombo, Sri Lanka',
      timestamp: new Date().toISOString(),
    },
    safeZones: [
      {
        id: `sz_man_${Date.now()}_home`,
        name: 'Home (Residence)',
        icon: '🏠',
        color: '#2E7D32',
        latitude: data.latitude || 6.9080,
        longitude: data.longitude || 79.8650,
        radius: 200,
        isInside: true,
        notifyOnEntry: true,
        notifyOnExit: true,
      },
    ],
  };

  const children = await getStoredChildren();
  const updated = [newChild, ...children];
  await saveStoredChildren(updated);

  const history = await getStoredHistory();
  history[newChild.id] = [
    {
      id: `hist_m_init_${Date.now()}`,
      type: 'check_in',
      title: 'Managed Profile Created',
      locationName: 'Home',
      timestamp: 'Just now',
      fullDate: new Date().toISOString(),
      category: 'status',
      color: '#2E7D32',
      icon: '👶',
      description: `Managed profile for ${newChild.targetName} created.`,
    },
  ];
  await saveStoredHistory(history);

  return newChild;
}

/**
 * Update child location coordinates and evaluate geofences.
 */
export async function updateChildLocation(childId, coords, address = '') {
  const children = await getStoredChildren();
  const index = children.findIndex((c) => c.id === childId);
  if (index === -1) return null;

  const child = children[index];
  const newLocation = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    address: address || child.lastLocation.address,
    timestamp: new Date().toISOString(),
  };

  // Re-evaluate safe zones
  let insideZoneName = 'In Transit';
  const updatedSafeZones = (child.safeZones || []).map((zone) => {
    const isInside = isInsideZone(newLocation, zone);
    if (isInside) {
      insideZoneName = zone.name;
    }
    return { ...zone, isInside };
  });

  const updatedChild = {
    ...child,
    lastLocation: newLocation,
    currentZoneName: insideZoneName,
    safeZones: updatedSafeZones,
  };

  children[index] = updatedChild;
  await saveStoredChildren(children);
  return updatedChild;
}

/**
 * Get safe zones for a specific child.
 */
export async function getSafeZones(childId) {
  const child = await getChildById(childId);
  return child ? child.safeZones || [] : [];
}

/**
 * Add or update a safe zone for a child.
 */
export async function saveSafeZone(childId, zoneData) {
  const children = await getStoredChildren();
  const index = children.findIndex((c) => c.id === childId);
  if (index === -1) throw new Error('Child not found');

  const child = children[index];
  const zones = [...(child.safeZones || [])];

  const zoneId = zoneData.id || `sz_${Date.now()}`;
  const isInside = isInsideZone(child.lastLocation, zoneData);

  const newZone = {
    id: zoneId,
    name: zoneData.name || 'New Safe Zone',
    icon: zoneData.icon || '📍',
    color: zoneData.color || '#1976D2',
    latitude: zoneData.latitude,
    longitude: zoneData.longitude,
    radius: zoneData.radius || 250,
    isInside,
    notifyOnEntry: zoneData.notifyOnEntry !== false,
    notifyOnExit: zoneData.notifyOnExit !== false,
  };

  const existingIndex = zones.findIndex((z) => z.id === zoneId);
  if (existingIndex >= 0) {
    zones[existingIndex] = newZone;
  } else {
    zones.push(newZone);
  }

  child.safeZones = zones;
  children[index] = child;
  await saveStoredChildren(children);
  return newZone;
}

/**
 * Delete a safe zone from a child.
 */
export async function deleteSafeZone(childId, zoneId) {
  const children = await getStoredChildren();
  const index = children.findIndex((c) => c.id === childId);
  if (index === -1) throw new Error('Child not found');

  const child = children[index];
  child.safeZones = (child.safeZones || []).filter((z) => z.id !== zoneId);
  children[index] = child;
  await saveStoredChildren(children);
  return true;
}

/**
 * Fetch child history events.
 */
export async function getChildHistory(childId, dateFilter = 'today', typeFilter = 'all') {
  const historyMap = await getStoredHistory();
  let events = historyMap[childId] || [];

  if (typeFilter !== 'all') {
    events = events.filter((e) => e.category === typeFilter);
  }

  return events;
}

/**
 * Send a check-in request to a child.
 */
export async function sendCheckInRequest(childId) {
  const child = await getChildById(childId);
  if (!child) throw new Error('Child not found');

  // Record history event
  const history = await getStoredHistory();
  const childEvents = history[childId] || [];
  const newEvent = {
    id: `req_${Date.now()}`,
    type: 'check_in',
    title: 'Check-in Request Sent',
    locationName: child.lastLocation.address || 'Current Location',
    timestamp: 'Just now',
    fullDate: new Date().toISOString(),
    category: 'checkin',
    color: '#1976D2',
    icon: '📲',
    description: `Parent sent check-in ping to ${child.targetName}.`,
  };
  history[childId] = [newEvent, ...childEvents];
  await saveStoredHistory(history);

  return { success: true, message: `Check-in request sent to ${child.targetName}!` };
}

/**
 * Trigger or dismiss simulated SOS for testing UI.
 */
export async function triggerMockSOS(childId, active = true) {
  const children = await getStoredChildren();
  const index = children.findIndex((c) => c.id === childId);
  if (index === -1) return;

  children[index].sosActive = active;
  children[index].sosTimestamp = active ? new Date().toISOString() : null;
  await saveStoredChildren(children);

  if (active) {
    const history = await getStoredHistory();
    const childEvents = history[childId] || [];
    history[childId] = [
      {
        id: `sos_${Date.now()}`,
        type: 'sos_alert',
        title: 'EMERGENCY SOS TRIGGERED',
        locationName: children[index].lastLocation.address,
        timestamp: 'Just now',
        fullDate: new Date().toISOString(),
        category: 'alert',
        color: '#D32F2F',
        icon: '🚨',
        description: `Emergency alert activated by ${children[index].targetName}!`,
      },
      ...childEvents,
    ];
    await saveStoredHistory(history);
  }

  return children[index];
}

/**
 * Resolve / dismiss active SOS for a child.
 */
export async function resolveChildSOS(childId) {
  return await triggerMockSOS(childId, false);
}

// ==========================================
// PET & ITEM BLE TRACKING METHODS
// ==========================================

export async function getPetsAndItems(ownerUid = 'parent_user_default') {
  return await getStoredPetsItems();
}

export async function addPetOrItem(ownerUid = 'parent_user_default', data) {
  if (!data?.name?.trim()) throw new Error('Please enter name');

  const newItem = {
    id: `tag_${Date.now()}`,
    type: data.type || 'item',
    name: data.name.trim(),
    tagCode: `GC-BLE-${Math.floor(1000 + Math.random() * 9000)}`,
    avatarEmoji: data.type === 'pet' ? '🐕' : '🎒',
    batteryLevel: 100,
    status: 'in_range',
    rssi: -58,
    distanceEstimate: '~2.0m away',
    lastSeen: 'Just now',
    locationAddress: 'Nearby (BLE Broadcast)',
    isRinging: false,
  };

  const items = await getStoredPetsItems();
  const updated = [newItem, ...items];
  await saveStoredPetsItems(updated);
  return newItem;
}

export async function toggleBleProximity(itemId) {
  const items = await getStoredPetsItems();
  const index = items.findIndex((i) => i.id === itemId);
  if (index === -1) return;

  const item = items[index];
  const newStatus = item.status === 'in_range' ? 'out_of_range' : 'in_range';
  item.status = newStatus;
  item.rssi = newStatus === 'in_range' ? -52 : -96;
  item.distanceEstimate = newStatus === 'in_range' ? '~3.0m away' : 'Out of range';
  item.lastSeen = 'Just now';

  items[index] = item;
  await saveStoredPetsItems(items);
  return item;
}

export async function pingBleTag(itemId) {
  const items = await getStoredPetsItems();
  const index = items.findIndex((i) => i.id === itemId);
  if (index === -1) return;

  items[index].isRinging = true;
  await saveStoredPetsItems(items);

  // Auto shut-off ring after 4 seconds
  setTimeout(async () => {
    try {
      const refreshed = await getStoredPetsItems();
      const refIdx = refreshed.findIndex((i) => i.id === itemId);
      if (refIdx >= 0) {
        refreshed[refIdx].isRinging = false;
        await saveStoredPetsItems(refreshed);
      }
    } catch (e) {
      // ignore
    }
  }, 4000);

  return items[index];
}
