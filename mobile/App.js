import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

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
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
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