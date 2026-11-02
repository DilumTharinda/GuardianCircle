import {
  ARRIVAL_CONFIRMATION_MS, distanceMeters, isArrivalFix, isCoordinate, isFreshJourneyFix,
} from '../utils/journeyMath';

export function initialJourneyState() {
  return {
    phase: 'loading', journey: null, tracking: 'stopped', location: null,
    pathSegments: [], distance: null, locationError: null, persistenceError: null,
    loadError: null, pendingSave: false, saving: false,
  };
}

// Lifecycle logic stays independent of React/native modules for deterministic tests.
export function createJourneyController(deps) {
  const { uid, onChange, now = Date.now } = deps;
  let state = initialJourneyState();
  let disposed = false;
  let generation = 0;
  let removeWatch = null;
  let arrivalSince = null;
  let saving = false;
  let loading = false;

  function publish(patch) {
    if (disposed) return;
    state = { ...state, ...patch };
    onChange(state);
  }

  function stopWatching() {
    generation += 1;
    arrivalSince = null;
    const remove = removeWatch;
    removeWatch = null;
    if (remove) remove();
  }

  function restore(journey, pendingSave = false) {
    publish({
      ...initialJourneyState(), phase: journey.status, journey,
      tracking: journey.status === 'active' ? 'paused' : 'stopped',
      location: journey.currentLocation,
      distance: distanceMeters(journey.currentLocation, journey.destination),
      pendingSave,
      persistenceError: pendingSave ? 'This journey ended on this device. Retry saving its final status.' : null,
    });
  }

  function validPending(journey) {
    return journey?.ownerUid === uid && typeof journey.id === 'string' && !journey.id.includes('/')
      && ['arrived', 'cancelled'].includes(journey.status)
      && isCoordinate(journey.destination) && isCoordinate(journey.currentLocation)
      && Number.isFinite(journey.startedAtMs) && Number.isFinite(journey.endedAtMs)
      && journey.endedAtMs >= journey.startedAtMs;
  }

  async function load() {
    if (disposed || loading || state.phase === 'active' || state.pendingSave) return;
    loading = true;
    const token = ++generation;
    publish({ phase: 'loading', loadError: null });
    try {
      const pending = await deps.readPending();
      if (disposed || token !== generation) return;
      if (pending) {
        if (!validPending(pending)) throw new Error('Invalid saved journey.');
        restore(pending, true);
        return;
      }
      const active = await deps.getActiveJourney(uid);
      if (disposed || token !== generation) return;
      if (active) restore(active);
      else publish({ ...initialJourneyState(), phase: 'idle' });
    } catch (error) {
      if (!disposed && token === generation) {
        publish({ phase: 'idle', loadError: deps.errorMessage(error) });
      }
    } finally {
      loading = false;
    }
  }

  async function saveFinal() {
    if (saving || !state.pendingSave || !state.journey || disposed) return;
    saving = true;
    const journey = state.journey;
    publish({ saving: true, persistenceError: null });
    let localSaved = false;
    try {
      // Preserve a retryable terminal summary before contacting the server.
      try {
        await deps.writePending(journey);
        localSaved = true;
      } catch (_) { /* A successful server write can still complete this journey. */ }
      await deps.finishJourney(uid, journey.id, {
        status: journey.status, endedAtMs: journey.endedAtMs,
        currentLocation: journey.currentLocation,
        distanceToDestinationMeters: distanceMeters(journey.currentLocation, journey.destination),
      });
      await deps.clearPending();
      publish({ pendingSave: false, persistenceError: null });
    } catch (error) {
      publish({ persistenceError: `${deps.errorMessage(error)}${localSaved ? '' : ' Keep this screen open; the retry could not be saved on this device.'}` });
    } finally {
      saving = false;
      publish({ saving: false });
    }
  }

  function end(status = 'cancelled') {
    if (disposed || state.phase !== 'active' || !['arrived', 'cancelled'].includes(status)) return;
    stopWatching();
    const journey = {
      ...state.journey, status, endedAtMs: now(), currentLocation: state.location,
    };
    publish({ phase: status, journey, tracking: 'stopped', locationError: null, pendingSave: true });
    return saveFinal();
  }

  function acceptFix(fix, token) {
    if (disposed || token !== generation || state.phase !== 'active') return;
    if (!isFreshJourneyFix(fix, now()) || fix.timestamp <= (state.location?.timestamp || 0)) return;
    const segments = state.pathSegments.slice();
    const segment = [...(segments.pop() || [])];
    if (!segment.length || distanceMeters(segment[segment.length - 1], fix) >= 3) segment.push(fix);
    // Keep only recent real samples. Never join separate foreground sessions.
    segments.push(segment.slice(-250));
    publish({
      location: fix, distance: distanceMeters(fix, state.journey.destination),
      pathSegments: segments.slice(-8), tracking: 'watching', locationError: null,
    });
    if (isArrivalFix(fix, state.journey.destination, now())) {
      if (arrivalSince === null) arrivalSince = fix.timestamp;
      else if (fix.timestamp - arrivalSince >= ARRIVAL_CONFIRMATION_MS) end('arrived');
    } else arrivalSince = null;
  }

  function resume() {
    if (disposed || state.phase !== 'active' || ['acquiring', 'watching'].includes(state.tracking)) return;
    stopWatching();
    const token = generation;
    publish({ tracking: 'acquiring', locationError: null, pathSegments: [...state.pathSegments, []].slice(-8) });
    try {
      const remove = deps.watchLocation(
        (fix) => acceptFix(fix, token),
        (error) => {
          if (disposed || token !== generation) return;
          stopWatching();
          publish({ tracking: 'error', locationError: error });
        }
      );
      if (disposed || token !== generation) remove();
      else removeWatch = remove;
    } catch (_) {
      stopWatching();
      publish({ tracking: 'error', locationError: { status: 'location-error', message: 'Unable to start GPS. Try again.' } });
    }
  }

  async function start(destination, destinationName) {
    if (disposed || state.phase !== 'idle' || state.loadError || !isCoordinate(destination)) return;
    const token = ++generation;
    publish({ phase: 'starting', locationError: null, persistenceError: null });
    try {
      const fix = await deps.getSnapshot();
      if (disposed) return;
      if (token !== generation) { publish({ phase: 'idle' }); return; }
      if (fix.status !== 'success' || !isFreshJourneyFix(fix, now())) {
        publish({ phase: 'idle', locationError: fix.status === 'success'
          ? { status: 'location-error', message: 'GPS did not return a fresh real position. Try again on a physical device in an open area.' } : fix });
        return;
      }
      const journey = await deps.createJourney(uid, {
        startLocation: fix, destination, destinationName: destinationName?.trim() || 'Selected destination',
        startedAtMs: now(),
      });
      // A late successful create stays resumable in Firestore after unmount.
      if (disposed) return;
      restore(journey);
      if (token === generation) resume();
    } catch (error) {
      publish({ phase: 'idle', persistenceError: deps.errorMessage(error) });
    }
  }

  function pause() {
    if (disposed || !['active', 'starting'].includes(state.phase)) return;
    stopWatching();
    if (state.phase === 'active') publish({ tracking: 'paused', locationError: null });
  }

  function reset() {
    if (disposed || !['arrived', 'cancelled'].includes(state.phase) || state.pendingSave || saving) return;
    publish({ ...initialJourneyState(), phase: 'idle' });
  }

  return {
    load, start, pause, resume, end, reset, retrySave: saveFinal,
    getState: () => state,
    invalidateSession() {
      stopWatching();
      publish({ ...initialJourneyState(), phase: 'idle', loadError: 'Sign in again to manage journeys.' });
      disposed = true;
    },
    dispose() { disposed = true; stopWatching(); },
  };
}
