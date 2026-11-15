import { collection, query, where, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import { getDistanceKm, formatDistance, formatRelativeTime } from './circleFindService';

const LOCAL_ALERTS_KEY = '@guardiancircle_local_alerts';
const MAX_EMERGENCY_ALERT_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const locallyResolvedAlertIds = new Set();

/**
 * Checks whether an alert is within the 2-hour active TTL window.
 */
function isAlertWithinTwoHours(data) {
  if (!data) return false;
  let timeMillis = 0;
  if (data.timestamp?.toDate) {
    timeMillis = data.timestamp.toDate().getTime();
  } else if (data.timestamp?.toMillis) {
    timeMillis = data.timestamp.toMillis();
  } else if (typeof data.timestamp === 'number') {
    timeMillis = data.timestamp;
  } else if (typeof data.createdAt === 'number') {
    timeMillis = data.createdAt;
  } else if (typeof data.timestamp === 'string') {
    const parsed = new Date(data.timestamp).getTime();
    if (!isNaN(parsed)) timeMillis = parsed;
  }
  if (!timeMillis) return true;
  return (Date.now() - timeMillis) <= MAX_EMERGENCY_ALERT_AGE_MS;
}

/**
 * Parses Alert documents into Nearby Activity objects.
 */
function parseAlertDoc(docId, data, userCoords) {
  const loc = data.location || {};
  const lat = loc.lat || loc.latitude;
  const lng = loc.lng || loc.longitude;

  let distanceKm = null;
  if (userCoords?.latitude && userCoords?.longitude && typeof lat === 'number' && typeof lng === 'number') {
    distanceKm = getDistanceKm(userCoords.latitude, userCoords.longitude, lat, lng);
  }

  return {
    id: docId,
    type: 'sos',
    title: `SOS: ${data.userName || 'Emergency Alert'}`,
    sub: loc.address || 'Active SOS alert in your vicinity',
    chip: 'EMERGENCY',
    chipType: 'sos',
    priority: 100,
    createdAt: data.timestamp?.toMillis ? data.timestamp.toMillis() : (data.timestamp || data.createdAt || Date.now()),
    distanceKm,
    distanceText: distanceKm !== null ? formatDistance(distanceKm) : null,
    data: {
      alertId: docId,
      location: loc,
    },
  };
}

/**
 * Parses Report documents into Nearby Activity objects (Unsafe hazards or CircleFind items).
 */
function parseReportDoc(docId, data, userCoords) {
  if (data.status === 'deleted' || data.isDeleted === true || data.status === 'resolved' || data.status === 'returned') {
    return null;
  }

  const isUnsafeZone = data.type === 'unsafe_location';
  const loc = data.location || {};
  // Convert GeoPoint or Object coordinate accurately
  let lat = null;
  let lng = null;
  if (loc && typeof loc.latitude === 'number') {
    lat = loc.latitude;
    lng = loc.longitude;
  } else if (loc && typeof loc.lat === 'number') {
    lat = loc.lat;
    lng = loc.lng;
  }

  let distanceKm = null;
  if (userCoords?.latitude && userCoords?.longitude && typeof lat === 'number' && typeof lng === 'number') {
    distanceKm = getDistanceKm(userCoords.latitude, userCoords.longitude, lat, lng);
  }

  if (isUnsafeZone) {
    const distLabel = distanceKm !== null ? formatDistance(distanceKm) : null;
    const timeLabel = formatRelativeTime(data.createdAt);
    const subParts = [data.category || 'Caution area', distLabel, timeLabel].filter(Boolean);

    return {
      id: docId,
      type: 'unsafe_hazard',
      title: `Unsafe: ${data.category || 'Reported area'}`,
      sub: subParts.join(' · '),
      chip: 'Caution',
      chipType: 'warn',
      priority: 80,
      createdAt: data.createdAt,
      distanceKm,
      distanceText: distLabel,
      data: {
        hazardId: docId,
        location: { latitude: lat, longitude: lng },
        category: data.category,
        description: data.description,
      },
    };
  }

  const status = data.status || 'missing';
  const distLabel = distanceKm !== null ? formatDistance(distanceKm) : null;
  const subLabel = data.location?.addressName || (distLabel ? `${distLabel} away` : 'Reported nearby');
  const isUrgent = data.isUrgent || data.category === 'Child';

  return {
    id: docId,
    type: 'circlefind',
    title: data.title || `${data.category || 'Missing'} item`,
    sub: subLabel,
    chip: isUrgent ? 'URGENT' : (status === 'spotted' ? 'Spotted' : 'Missing'),
    chipType: isUrgent ? 'sos' : 'missing',
    priority: isUrgent ? 95 : 60,
    category: data.category,
    createdAt: data.createdAt,
    distanceKm,
    distanceText: distLabel,
    data: {
      reportId: docId,
    },
  };
}

/**
 * Subscribes in real-time to active SOS Alerts and Reports.
 * Immediately invokes callback whenever any alert or report changes.
 *
 * @param {Object|null} userCoords - { latitude, longitude }
 * @param {Function} onUpdate - callback(activitiesArray)
 * @param {number} maxItems - Maximum items to show (default 4)
 * @returns {Function} unsubscribe function
 */
export function subscribeToNearbyActivities(userCoords, onUpdate, maxItems = 4) {
  let sosActivities = [];
  let reportActivities = [];

  const mergeAndEmit = async () => {
    // Also include any locally stored active alerts for zero-latency local feedback
    let localSOS = [];
    try {
      const localAlertsRaw = await AsyncStorage.getItem(LOCAL_ALERTS_KEY);
      if (localAlertsRaw) {
        const parsed = JSON.parse(localAlertsRaw);
        if (Array.isArray(parsed)) {
          parsed.filter(a => a.status === 'active' && !locallyResolvedAlertIds.has(a.id) && isAlertWithinTwoHours(a)).forEach(alert => {
            localSOS.push(parseAlertDoc(alert.id || 'local_alert', alert, userCoords));
          });
        }
      }
    } catch (_) {}

    // Combine SOS: deduplicate by id
    const alertMap = new Map();
    sosActivities.forEach(item => {
      if (item && !locallyResolvedAlertIds.has(item.id) && isAlertWithinTwoHours(item)) {
        alertMap.set(item.id, item);
      }
    });
    localSOS.forEach(item => {
      if (!alertMap.has(item.id) && !locallyResolvedAlertIds.has(item.id)) alertMap.set(item.id, item);
    });

    const combined = [...Array.from(alertMap.values()), ...reportActivities];

  // Sort: Emergency SOS first (priority: 100), then Urgent child alerts (95), then Unsafe hazard spots (80), then Missing CircleFind items (60)
  // Inside each tier, sort by closest distance, then most recent
  combined.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.distanceKm !== null && b.distanceKm !== null && Math.abs(a.distanceKm - b.distanceKm) > 0.1) {
      return a.distanceKm - b.distanceKm;
    }
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
    return timeB - timeA;
  });

  // Guarantee diverse representation: show active emergency SOS, but ensure reported unsafe zones and CircleFind posts are surfaced
  const finalItems = [];
  const sosList = combined.filter(item => item.type === 'sos');
  const hazardList = combined.filter(item => item.type === 'unsafe_hazard');
  const circleFindList = combined.filter(item => item.type === 'circlefind');

  // Add up to 2 active SOS alerts
  sosList.slice(0, 2).forEach(item => finalItems.push(item));

  // If there are unsafe hazards or CircleFind items, include them next
  hazardList.forEach(item => {
    if (finalItems.length < maxItems && !finalItems.some(f => f.id === item.id)) {
      finalItems.push(item);
    }
  });

  circleFindList.forEach(item => {
    if (finalItems.length < maxItems && !finalItems.some(f => f.id === item.id)) {
      finalItems.push(item);
    }
  });

  // If still room, fill with remaining items in sorted order
  combined.forEach(item => {
    if (finalItems.length < maxItems && !finalItems.some(f => f.id === item.id)) {
      finalItems.push(item);
    }
  });

  onUpdate(finalItems.slice(0, maxItems));
  };

  // 1. Live listener for active Alerts
  const alertsQuery = query(
    collection(db, 'Alerts'),
    where('status', '==', 'active'),
    limit(6)
  );

  const unsubAlerts = onSnapshot(
    alertsQuery,
    (snapshot) => {
      sosActivities = [];
      snapshot.forEach((docSnap) => {
        const item = parseAlertDoc(docSnap.id, docSnap.data(), userCoords);
        if (item) sosActivities.push(item);
      });
      mergeAndEmit();
    },
    (error) => {
      console.warn('[nearbyActivityService] onSnapshot alerts error:', error?.message || error);
      mergeAndEmit();
    }
  );

  // 2. Live listener for reports
  const reportsQuery = query(
    collection(db, 'reports'),
    limit(25)
  );

  const unsubReports = onSnapshot(
    reportsQuery,
    (snapshot) => {
      reportActivities = [];
      snapshot.forEach((docSnap) => {
        const item = parseReportDoc(docSnap.id, docSnap.data(), userCoords);
        if (item) reportActivities.push(item);
      });
      mergeAndEmit();
    },
    (error) => {
      console.warn('[nearbyActivityService] onSnapshot reports error:', error?.message || error);
      mergeAndEmit();
    }
  );

  // 3. Listen to local device emergency alert events for instant reactive refresh
  const sub = DeviceEventEmitter.addListener('EMERGENCY_ALERT_UPDATED', (payload) => {
    if (payload?.alertId && (payload?.status === 'resolved' || payload?.status === 'cancelled')) {
      locallyResolvedAlertIds.add(payload.alertId);
      sosActivities = sosActivities.filter((a) => a.id !== payload.alertId);
    }
    mergeAndEmit();
  });

  // Periodic pruning ticker every 60 seconds to auto-remove alerts passing the 2-hour threshold
  const pruneInterval = setInterval(() => {
    mergeAndEmit();
  }, 60000);

  return () => {
    unsubAlerts();
    unsubReports();
    sub?.remove?.();
    clearInterval(pruneInterval);
  };
}

/**
 * One-off fetch helper for compatibility.
 */
export async function getNearbyActivities(userCoords = null, maxItems = 4) {
  return new Promise((resolve) => {
    const unsubscribe = subscribeToNearbyActivities(userCoords, (items) => {
      unsubscribe();
      resolve(items);
    }, maxItems);
  });
}

