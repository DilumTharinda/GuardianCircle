import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';
import { ROUTES } from '../constants/routes';

// Parent-Child Module Screens (Member 5)
import ParentDashboardScreen from '../screens/parentchild/ParentDashboardScreen';
import ChildLocationScreen from '../screens/parentchild/ChildLocationScreen';
import SafeZonesScreen from '../screens/parentchild/SafeZonesScreen';
import ChildHistoryScreen from '../screens/parentchild/ChildHistoryScreen';
import TrustedCircleScreen from '../screens/account/TrustedCircleScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#E53935' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerBackTitle: 'Back',
      }}
    >
      {user ? (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />

          {/* Member 5: Parent-Child Tracking Screens */}
          <Stack.Screen
            name={ROUTES.PARENT_DASHBOARD}
            component={ParentDashboardScreen}
            options={{
              title: 'Parent Dashboard',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name={ROUTES.CHILD_LOCATION}
            component={ChildLocationScreen}
            options={{
              title: 'Live Child Location',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name={ROUTES.SAFE_ZONES}
            component={SafeZonesScreen}
            options={{
              title: 'Manage Safe Zones',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name={ROUTES.CHILD_HISTORY}
            component={ChildHistoryScreen}
            options={{
              title: 'Location History',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name={ROUTES.TRUSTED_CIRCLE}
            component={TrustedCircleScreen}
            options={{
              title: 'Trusted Circle',
              headerShown: true,
            }}
          />
        </>
      ) : (
        <Stack.Screen
          name="Auth"
          component={AuthNavigator}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}