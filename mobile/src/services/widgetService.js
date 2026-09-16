import { Linking } from 'react-native';
import { triggerSOS } from './sosService';
import { TRIGGER_TYPES } from '../constants/alertTriggers';

/**
 * Initializes listeners for lockscreen / homescreen widget shortcuts and deep links.
 * Deep link scheme: guardiancircle://sos
 * 
 * @param {Function} onWidgetTriggered - Callback when widget fires an SOS
 */
export function initWidgetListener(onWidgetTriggered) {
  // Handle initial URL when app is opened directly from a widget or notification
  Linking.getInitialURL().then((url) => {
    if (url && (url.includes('sos') || url.includes('emergency'))) {
      handleWidgetAction(url, onWidgetTriggered);
    }
  }).catch((err) => {
    console.warn('[widgetService] Error getting initial URL:', err);
  });

  // Handle URL events while app is running in background/foreground
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (url && (url.includes('sos') || url.includes('emergency'))) {
      handleWidgetAction(url, onWidgetTriggered);
    }
  });

  return () => {
    subscription.remove();
  };
}

async function handleWidgetAction(url, onWidgetTriggered) {
  console.log('⚡ [widgetService] Emergency widget shortcut activated with URL:', url);
  try {
    const alertId = await triggerSOS(TRIGGER_TYPES.WIDGET, { sourceUrl: url });
    onWidgetTriggered?.(alertId);
  } catch (e) {
    console.warn('[widgetService] Widget SOS dispatch failed:', e);
  }
}

/**
 * Helper to trigger widget action directly from UI test or simulation
 */
export async function triggerWidgetSOS() {
  return await triggerSOS(TRIGGER_TYPES.WIDGET, { simulated: true });
}
