import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getForegroundLocationSnapshot, watchForegroundJourneyLocation } from '../services/locationService';
import { createJourney, finishJourney, getActiveJourney, getJourneyErrorMessage } from '../services/journeyService';
import { createJourneyController, initialJourneyState } from '../services/journeyController';

export function useJourney(uid, focused) {
  const [state, setState] = useState(initialJourneyState);
  const [clock, setClock] = useState(Date.now);
  const controller = useRef(null);
  const isForeground = useRef(AppState.currentState === 'active');
  const isFocused = useRef(focused);
  isFocused.current = focused;

  useEffect(() => {
    const storageKey = `@guardiancircle_pending_journey:${uid}`;
    let active = true;
    const current = createJourneyController({
      uid,
      onChange: (next) => { if (active) setState(next); },
      getSnapshot: getForegroundLocationSnapshot,
      watchLocation: watchForegroundJourneyLocation,
      createJourney, finishJourney, getActiveJourney, errorMessage: getJourneyErrorMessage,
      readPending: async () => {
        const value = await AsyncStorage.getItem(storageKey);
        return value ? JSON.parse(value) : null;
      },
      writePending: (journey) => AsyncStorage.setItem(storageKey, JSON.stringify(journey)),
      clearPending: () => AsyncStorage.removeItem(storageKey),
    });
    controller.current = current;
    setState(initialJourneyState());
    if (uid && auth.currentUser?.uid === uid) current.load();
    else current.invalidateSession();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== uid) current.invalidateSession();
    });
    const appState = AppState.addEventListener('change', (next) => {
      isForeground.current = next === 'active';
      if (!isForeground.current) current.pause();
    });
    return () => {
      active = false;
      current.dispose();
      unsubscribe();
      appState.remove();
      if (controller.current === current) controller.current = null;
    };
  }, [uid]);

  useEffect(() => {
    if (!focused) controller.current?.pause();
  }, [focused]);

  useEffect(() => {
    setClock(Date.now());
    if (state.phase !== 'active') return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.phase]);

  return {
    ...state,
    elapsedMs: state.journey
      ? Math.max(0, (state.journey.endedAtMs || clock) - state.journey.startedAtMs) : 0,
    start: (destination, name) => {
      if (isForeground.current && isFocused.current) controller.current?.start(destination, name);
    },
    resume: () => {
      if (isForeground.current && isFocused.current) controller.current?.resume();
    },
    end: () => controller.current?.end(),
    reset: () => controller.current?.reset(),
    retrySave: () => controller.current?.retrySave(),
    retryLoad: () => controller.current?.load(),
  };
}
