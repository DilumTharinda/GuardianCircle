import * as Location from 'expo-location';

// One foreground watch per session; writes are serialized and intermediate fixes coalesced.
export function startChildLocationTracking({ publish, onStatus, onError }) {
  let stopped = false; let watcher; let pending; let writing = false;
  const active = () => !stopped;
  async function drain() {
    if (writing || stopped) return;
    writing = true;
    try {
      while (pending && !stopped) {
        const fix = pending; pending = null;
        try { await publish(fix.coords, active); if (!stopped) onStatus('Location synchronized'); }
        catch (error) { if (!stopped) onError(error); }
      }
    } finally { writing = false; }
  }
  async function start() {
    try {
      onStatus('Requesting location permission');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (stopped) return;
      if (permission.status !== 'granted') throw new Error('Location permission denied. Enable it in device settings to share your position.');
      if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on device location services.');
      if (stopped) return;
      onStatus('Waiting for a GPS fix');
      const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 }, fix => {
        if (!stopped) { pending = fix; drain(); }
      }, message => { if (!stopped) onError(new Error(message || 'Location watch failed.')); });
      if (stopped) subscription.remove(); else watcher = subscription;
    } catch (error) { if (!stopped) onError(error); }
  }
  start();
  return () => { stopped = true; pending = null; watcher?.remove(); };
}
