import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, UIManager, View,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getForegroundLocationSnapshot } from '../../services/locationService';
import { useAuth } from '../../context/AuthContext';
import { useJourney } from '../../hooks/useJourney';
import { useUnsafeZones } from '../../hooks/useUnsafeZones';
import { ARRIVAL_THRESHOLD_METERS, formatElapsed } from '../../utils/journeyMath';
import JourneyShareModal from '../../components/journey/JourneyShareModal';
import UnsafeLocationReportModal from '../../components/journey/UnsafeLocationReportModal';

let MapView = null;
let Marker = null;
let Polyline = null;
let Circle = null;
let Heatmap = null;
let PROVIDER_GOOGLE = null;
let nativeHeatmapAvailable = false;
const HEATMAP_GRADIENT = {
  colors: ['#FFF176', '#FB8C00', '#E53935'],
  startPoints: [0.1, 0.5, 1],
  colorMapSize: 256,
};

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default || Maps;
    Marker = Maps.Marker;
    Polyline = Maps.Polyline;
    Circle = Maps.Circle;
    Heatmap = Maps.Heatmap;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
    const managerName = Platform.OS === 'android' ? 'AIRMapHeatmap' : 'AIRGoogleMapHeatmap';
    try {
      nativeHeatmapAvailable = Boolean(Heatmap && UIManager.getViewManagerConfig?.(managerName));
    } catch (_) {
      nativeHeatmapAvailable = false;
    }
  } catch (e) {
    console.warn('[MapScreen] react-native-maps not loaded, using fallback');
  }
}

const UnsafeZoneOverlay = React.memo(function UnsafeZoneOverlay({ visible, points }) {
  if (!visible || points.length === 0) return null;
  if (nativeHeatmapAvailable) {
    return <Heatmap points={points} radius={35} opacity={0.55} gradient={HEATMAP_GRADIENT} />;
  }
  if (!Circle) return null;
  return points.map((point) => (
    <Circle key={`${point.latitude}:${point.longitude}`}
      center={{ latitude: point.latitude, longitude: point.longitude }}
      radius={Math.min(300, 90 + Math.sqrt(point.weight) * 35)}
      fillColor="rgba(229, 57, 53, 0.22)" strokeColor="rgba(183, 28, 28, 0.5)"
      strokeWidth={1} />
  ));
});

export default function MapScreen() {
  const { user } = useAuth();
  const focused = useIsFocused();
  const [locationState, setLocationState] = useState({ status: 'loading' });
  const [destination, setDestination] = useState(null);
  const [destinationName, setDestinationName] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNotice, setReportNotice] = useState(null);
  const [showUnsafeLayer, setShowUnsafeLayer] = useState(true);
  const requestId = useRef(0);
  const mapRef = useRef(null);
  const mapAvailable = MapView && Marker && Polyline && Platform.OS !== 'web';
  const journey = useJourney(user?.uid, focused);
  const unsafeZones = useUnsafeZones(
    user?.uid,
    Boolean(mapAvailable && focused && showUnsafeLayer
      && (locationState.status === 'success' || journey.location)),
  );

  const loadLocation = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLocationState({ status: 'loading' });

    const result = await getForegroundLocationSnapshot();
    // Ignore results after blur/unmount, or after a newer request has started.
    if (currentRequest === requestId.current) {
      setLocationState(result);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!mapAvailable) return;

      loadLocation();
      return () => {
        requestId.current += 1;
      };
    }, [loadLocation, mapAvailable])
  );

  async function openSettings() {
    const currentRequest = requestId.current;
    try {
      await Linking.openSettings();
    } catch (error) {
      if (currentRequest === requestId.current) {
        setLocationState((previous) => ({
          ...previous,
          message: 'Could not open Settings. Open your device settings manually, allow location access, then tap Retry.',
        }));
      }
    }
  }

  function selectDestination(event) {
    if (!['idle'].includes(journey.phase) || journey.loadError) return;
    const coordinate = event?.nativeEvent?.coordinate;
    if (!Number.isFinite(coordinate?.latitude) || !Number.isFinite(coordinate?.longitude)) return;
    setDestination({ latitude: coordinate.latitude, longitude: coordinate.longitude });
    setDestinationName('');
  }

  function confirmEndJourney() {
    Alert.alert('End journey?', 'This will cancel the active journey and stop GPS tracking.', [
      { text: 'Keep tracking', style: 'cancel' },
      { text: 'End journey', style: 'destructive', onPress: journey.end },
    ]);
  }

  useEffect(() => {
    const location = journey.location;
    if (journey.phase !== 'active' || !location || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
  }, [journey.location, journey.phase]);

  useEffect(() => {
    setShareNotice(null);
  }, [journey.journey?.id]);

  useEffect(() => {
    setReportOpen(false);
    setReportNotice(null);
    setShowUnsafeLayer(true);
  }, [user?.uid]);

  useEffect(() => {
    if (!focused) setReportOpen(false);
  }, [focused]);

  if (!mapAvailable) {
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Map unavailable</Text>
        <Text style={styles.statusMessage}>
          Open this screen in a supported Android or iOS app to view the map.
        </Text>
      </View>
    );
  }

  if (locationState.status !== 'success' && !journey.location) {
    const loading = locationState.status === 'loading';
    const permissionDenied = locationState.status === 'permission-denied';
    const title = permissionDenied
      ? 'Location permission needed'
      : locationState.status === 'services-disabled'
        ? 'Location services are off'
        : 'Location unavailable';

    return (
      <View style={styles.statusContainer} accessibilityLiveRegion="polite">
        {loading ? (
          <>
            <ActivityIndicator size="large" color="#E53935" />
            <Text style={styles.loadingText}>Getting your location...</Text>
          </>
        ) : (
          <>
            <Text style={styles.statusTitle}>{title}</Text>
            <Text style={styles.statusMessage}>{locationState.message}</Text>
            {permissionDenied && locationState.canAskAgain === false && (
              <TouchableOpacity
                style={styles.button}
                onPress={openSettings}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Open Settings</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.button}
              onPress={loadLocation}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Retry</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  const mapLocation = locationState.status === 'success' ? locationState : journey.location;
  const { latitude, longitude, accuracy, timestamp } = mapLocation;
  const activeOrComplete = ['active', 'arrived', 'cancelled'].includes(journey.phase);
  const currentCoordinate = activeOrComplete && journey.location
    ? { latitude: journey.location.latitude, longitude: journey.location.longitude }
    : { latitude, longitude };
  const shownDestination = activeOrComplete ? journey.journey?.destination : destination;
  const distanceLabel = journey.distance == null
    ? 'Waiting for GPS'
    : journey.distance < 1000
      ? `${Math.round(journey.distance)} m`
      : `${(journey.distance / 1000).toFixed(2)} km`;
  const trackingLabel = journey.tracking === 'watching' ? 'Tracking live GPS'
    : journey.tracking === 'acquiring' ? 'Acquiring GPS'
      : journey.tracking === 'paused' ? 'Foreground tracking paused'
        : journey.tracking === 'error' ? 'GPS tracking needs attention' : 'Tracking stopped';

  return (
    <View style={styles.container}>
      {/* Mount after GPS succeeds so initialRegion uses this snapshot. */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onLongPress={selectDestination}
      >
        <UnsafeZoneOverlay visible={showUnsafeLayer} points={unsafeZones.points} />
        <Marker
          coordinate={currentCoordinate}
          title={journey.phase === 'active' && journey.tracking !== 'watching'
            ? 'Last journey location' : 'Your current location'}
          description={journey.phase === 'active' ? trackingLabel : 'Current GPS snapshot'}
        />
        {shownDestination && (
          <Marker coordinate={shownDestination} pinColor="#1976D2" title="Journey destination"
            description={journey.journey?.destinationName || destinationName.trim() || 'Selected destination'} />
        )}
        {journey.pathSegments.map((segment, index) => segment.length > 1 ? (
          <Polyline key={`${index}-${segment[0].timestamp}`} coordinates={segment}
            strokeColor="#1976D2" strokeWidth={5} />
        ) : null)}
      </MapView>

      <ScrollView style={styles.overlay} contentContainerStyle={styles.overlayContent}
        keyboardShouldPersistTaps="handled">
        {journey.phase === 'loading' ? (
          <View style={styles.inlineRow}>
            <ActivityIndicator color="#E53935" />
            <Text style={styles.snapshotText}>Checking for an active journey...</Text>
          </View>
        ) : journey.phase === 'idle' ? (
          <>
            <Text style={styles.text}>Start a journey</Text>
            <Text style={styles.snapshotText}>Long-press the map to choose your destination.</Text>
            {destination && (
              <>
                <TextInput style={styles.input} value={destinationName} maxLength={120}
                  placeholder="Destination name (optional)" placeholderTextColor="#757575"
                  onChangeText={setDestinationName} accessibilityLabel="Destination name" />
                <Text style={styles.coordinateText}>
                  {destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}
                </Text>
                <TouchableOpacity style={styles.button} onPress={() => journey.start(destination, destinationName)}
                  disabled={journey.loadError != null} accessibilityRole="button">
                  <Text style={styles.buttonText}>Start journey</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkButton} onPress={() => setDestination(null)}
                  accessibilityRole="button"><Text style={styles.linkText}>Clear destination</Text></TouchableOpacity>
              </>
            )}
            {!destination && (
              <>
                <Text style={styles.snapshotText}>Current location captured at {new Date(timestamp).toLocaleTimeString()}</Text>
                {accuracy !== null && <Text style={styles.snapshotText}>Accuracy: about {Math.round(accuracy)} m</Text>}
              </>
            )}
            <Text style={styles.thresholdText}>Journey sharing becomes available after a journey starts.</Text>
            {journey.loadError && (
              <ErrorNotice message={journey.loadError} action="Retry journey load" onPress={journey.retryLoad} />
            )}
            {journey.locationError && (
              <LocationNotice error={journey.locationError} openSettings={openSettings}
                action="Try starting again" onPress={() => journey.start(destination, destinationName)} />
            )}
            {journey.persistenceError && <ErrorNotice message={journey.persistenceError} />}
          </>
        ) : journey.phase === 'starting' ? (
          <View style={styles.inlineRow}>
            <ActivityIndicator color="#E53935" />
            <Text style={styles.snapshotText}>Saving journey and acquiring GPS...</Text>
          </View>
        ) : journey.phase === 'active' ? (
          <>
            <Text style={styles.text}>{journey.journey.destinationName}</Text>
            <View style={styles.metrics}>
              <Metric label="Elapsed" value={formatElapsed(journey.elapsedMs)} />
              <Metric label="Distance" value={distanceLabel} />
            </View>
            <Text style={styles.statusText}>{trackingLabel}</Text>
            <Text style={styles.thresholdText}>
              Auto check-in confirms two accurate GPS fixes within {ARRIVAL_THRESHOLD_METERS} m.
            </Text>
            {journey.locationError && (
              <LocationNotice error={journey.locationError} openSettings={openSettings}
                action="Resume GPS" onPress={journey.resume} />
            )}
            {['paused', 'error'].includes(journey.tracking) && !journey.locationError && (
              <TouchableOpacity style={styles.button} onPress={journey.resume} accessibilityRole="button">
                <Text style={styles.buttonText}>Resume foreground GPS</Text>
              </TouchableOpacity>
            )}
            {shareNotice && <Text accessibilityLiveRegion="polite" style={styles.shareNotice}>{shareNotice}</Text>}
            <TouchableOpacity style={[styles.button, styles.shareButton]} onPress={() => {
              setShareNotice(null); setReportOpen(false); setShareOpen(true);
            }} accessibilityRole="button"><Text style={styles.buttonText}>Share journey update</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.endButton]} onPress={confirmEndJourney}
              accessibilityRole="button"><Text style={styles.buttonText}>End journey</Text></TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.text}>{journey.phase === 'arrived' ? 'Checked in' : 'Journey ended'}</Text>
            <Text style={styles.snapshotText}>{journey.journey?.destinationName}</Text>
            <Text style={styles.snapshotText}>Elapsed: {formatElapsed(journey.elapsedMs)}</Text>
            {journey.pendingSave ? (
              <ErrorNotice message={journey.persistenceError || 'Final journey status is waiting to be saved.'}
                action={journey.saving ? 'Saving...' : 'Retry save'} onPress={journey.retrySave}
                disabled={journey.saving} />
            ) : (
              <TouchableOpacity style={styles.button} onPress={() => {
                journey.reset(); setDestination(null); setDestinationName('');
              }} accessibilityRole="button"><Text style={styles.buttonText}>Done</Text></TouchableOpacity>
            )}
          </>
        )}
        <UnsafeZonePanel zones={unsafeZones} visible={showUnsafeLayer}
          nativeHeatmap={nativeHeatmapAvailable}
          visualizationAvailable={Boolean(nativeHeatmapAvailable || Circle)}
          onToggle={() => setShowUnsafeLayer((current) => !current)} />
        {reportNotice && (
          <Text accessibilityLiveRegion="polite" style={styles.reportNotice}>{reportNotice}</Text>
        )}
        <TouchableOpacity style={[styles.button, styles.reportButton]} onPress={() => {
          setReportNotice(null); setShareOpen(false); setReportOpen(true);
        }} accessibilityRole="button">
          <Text style={styles.buttonText}>Report unsafe location</Text>
        </TouchableOpacity>
      </ScrollView>
      {shareOpen && (
        <JourneyShareModal visible uid={user?.uid} journeyState={journey}
          onClose={() => setShareOpen(false)} onShared={setShareNotice} />
      )}
      {reportOpen && (
        <UnsafeLocationReportModal visible uid={user?.uid}
          onClose={() => setReportOpen(false)} onReported={setReportNotice} />
      )}
    </View>
  );
}

function Metric({ label, value }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function ErrorNotice({ message, action, onPress, disabled }) {
  return (
    <View style={styles.errorBox} accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{message}</Text>
      {action && <TouchableOpacity style={styles.linkButton} onPress={onPress} disabled={disabled}
        accessibilityRole="button"><Text style={styles.linkText}>{action}</Text></TouchableOpacity>}
    </View>
  );
}

function LocationNotice({ error, openSettings, action, onPress }) {
  return (
    <View style={styles.errorBox} accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{error.message}</Text>
      {error.status === 'permission-denied' && error.canAskAgain === false && (
        <TouchableOpacity style={styles.linkButton} onPress={openSettings} accessibilityRole="button">
          <Text style={styles.linkText}>Open Settings</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.linkButton} onPress={onPress} accessibilityRole="button">
        <Text style={styles.linkText}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function UnsafeZonePanel({ zones, visible, nativeHeatmap, visualizationAvailable, onToggle }) {
  const reportLabel = zones.reportCount === 1 ? 'report' : 'reports';
  return (
    <View style={styles.heatmapBox}>
      <View style={styles.heatmapHeader}>
        <Text style={styles.heatmapTitle}>User-reported safety concerns</Text>
        <TouchableOpacity style={styles.layerToggle} onPress={onToggle}
          accessibilityRole="switch" accessibilityState={{ checked: visible }}>
          <Text style={styles.layerToggleText}>{visible ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>
      {!visible ? (
        <Text style={styles.heatmapText}>The report-area layer is hidden.</Text>
      ) : zones.status === 'loading' ? (
        <View style={styles.inlineRow} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color="#E53935" />
          <Text style={styles.heatmapText}>Loading user-submitted reports...</Text>
        </View>
      ) : zones.status === 'error' ? (
        <ErrorNotice message={zones.error} action="Retry report layer" onPress={zones.retry} />
      ) : zones.status === 'empty' ? (
        <>
          <Text style={styles.heatmapText}>
            {zones.fromCache
              ? 'No cached reports are available. Reconnect and refresh to check for updates.'
              : 'No open user-submitted reports are available to display.'}
          </Text>
          <TouchableOpacity style={styles.linkButton} onPress={zones.retry} accessibilityRole="button">
            <Text style={styles.linkText}>Refresh reports</Text>
          </TouchableOpacity>
        </>
      ) : !visualizationAvailable ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          Report-area visualization is unavailable in this app build.
        </Text>
      ) : zones.status === 'ready' ? (
        <>
          <Text style={styles.heatmapText}>
            {zones.reportCount} open {reportLabel} loaded as {nativeHeatmap ? 'heat shading' : 'coarse density areas'}.
          </Text>
          <View style={styles.legendRow} accessibilityLabel="Stronger shading means more reports nearby">
            <View style={[styles.legendSwatch, { backgroundColor: '#FFF176' }]} />
            <View style={[styles.legendSwatch, { backgroundColor: '#FB8C00' }]} />
            <View style={[styles.legendSwatch, { backgroundColor: '#E53935' }]} />
            <Text style={styles.legendText}>More reports nearby</Text>
          </View>
          {zones.fromCache && (
            <Text style={styles.heatmapMeta}>Showing cached reports while Firestore reconnects.</Text>
          )}
          {zones.truncated && (
            <Text style={styles.heatmapMeta}>A capped view is shown to keep the map responsive.</Text>
          )}
          {Number.isFinite(zones.updatedAtMs) && (
            <Text style={styles.heatmapMeta}>
              Updates automatically. Last update {new Date(zones.updatedAtMs).toLocaleTimeString()}.
            </Text>
          )}
          <TouchableOpacity style={styles.linkButton} onPress={zones.retry} accessibilityRole="button">
            <Text style={styles.linkText}>Refresh reports</Text>
          </TouchableOpacity>
        </>
      ) : null}
      <Text style={styles.heatmapDisclaimer}>
        Reports are user-submitted and do not determine whether an area is safe or unsafe.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  map: { flex: 1 },
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#424242',
    marginTop: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  overlay: {
    position: 'absolute',
    top: 20,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    maxHeight: '48%',
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  overlayContent: { padding: 14, alignItems: 'stretch', gap: 8 },
  text: { fontSize: 16, fontWeight: 'bold', color: '#E53935' },
  snapshotText: { fontSize: 13, color: '#424242', textAlign: 'center' },
  coordinateText: { fontSize: 12, color: '#616161', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 10, color: '#212121', backgroundColor: '#FFF', fontSize: 15 },
  linkButton: { paddingVertical: 8, alignItems: 'center' },
  linkText: { color: '#1976D2', fontSize: 14, fontWeight: '600' },
  inlineRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  metrics: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, borderRadius: 8, backgroundColor: '#F5F5F5', padding: 9, alignItems: 'center' },
  metricLabel: { color: '#757575', fontSize: 12 },
  metricValue: { color: '#212121', fontSize: 16, fontWeight: '700', marginTop: 2 },
  statusText: { color: '#2E7D32', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  thresholdText: { color: '#616161', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  endButton: { backgroundColor: '#C62828' },
  shareButton: { backgroundColor: '#1976D2' },
  shareNotice: { color: '#1565C0', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  reportButton: { backgroundColor: '#C62828' },
  reportNotice: { color: '#2E7D32', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  heatmapBox: { borderWidth: 1, borderColor: '#FFE0B2', backgroundColor: '#FFF8E1',
    borderRadius: 9, padding: 10, marginTop: 4 },
  heatmapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heatmapTitle: { flex: 1, color: '#5D4037', fontSize: 13, fontWeight: '700' },
  heatmapText: { color: '#5D4037', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  heatmapMeta: { color: '#795548', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4 },
  heatmapDisclaimer: { color: '#6D4C41', fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  layerToggle: { minHeight: 34, minWidth: 52, borderWidth: 1, borderColor: '#C62828',
    borderRadius: 8, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  layerToggleText: { color: '#B71C1C', fontSize: 12, fontWeight: '700' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 7 },
  legendSwatch: { width: 13, height: 13, borderRadius: 7 },
  legendText: { color: '#6D4C41', fontSize: 11, marginLeft: 3 },
  errorBox: { borderRadius: 8, padding: 10, backgroundColor: '#FFEBEE' },
  errorText: { color: '#B71C1C', fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
