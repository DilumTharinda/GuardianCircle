import React, { useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Set global font scaling limit to avoid UI breaks on devices with large system fonts
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.maxFontSizeMultiplier = 1.3;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.maxFontSizeMultiplier = 1.3;

// Suppress known web-specific benign framework notices without affecting native app debugging
if (Platform.OS === 'web') {
  LogBox.ignoreLogs([
    'Animated: `useNativeDriver` is not supported',
    'The Geocoding API has been removed in SDK 49',
    'google.maps.Marker is deprecated',
    '<gmp-advanced-marker>',
  ]);
  // Also filter console.warn in web browser console for standard Google Maps web component notes
  if (typeof console !== 'undefined' && console.warn) {
    const origWarn = console.warn;
    console.warn = (...args) => {
      const msg = args[0] ? String(args[0]) : '';
      if (
        msg.includes('useNativeDriver') ||
        msg.includes('gmp-advanced-marker') ||
        msg.includes('gmp-pin') ||
        msg.includes('Geocoding API has been removed')
      ) {
        return;
      }
      origWarn.apply(console, args);
    };
  }
}
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { EmergencyAlertProvider } from './src/context/EmergencyAlertContext';
import AppNavigator from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationService';
import { initOfflineDb } from './src/services/offlineStorageService';
 
 
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught:', error, errorInfo);
  }
  resetError = () => {
    this.setState({ hasError: false, error: null });
  };
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>GuardianCircle</Text>
          <Text style={styles.errorSubtitle}>Something went wrong while rendering:</Text>
          <Text style={styles.errorMsg}>{String(this.state.error?.message || this.state.error)}</Text>
          <TouchableOpacity style={styles.resetBtn} onPress={this.resetError} activeOpacity={0.8}>
            <Text style={styles.resetBtnText}>🔄 Reset & Continue</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
 
export default function App() {
  useEffect(() => {
    initOfflineDb();
  }, []);
 
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <EmergencyAlertProvider>
              <NavigationContainer ref={navigationRef}>
                <StatusBar style="auto" />
                <AppNavigator />
              </NavigationContainer>
            </EmergencyAlertProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
 
const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E53935',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  errorMsg: {
    fontSize: 12,
    color: '#D32F2F',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: 16,
  },
  resetBtn: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  resetBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
 