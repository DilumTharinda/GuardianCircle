import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { isChild } from '../constants/roles';
import { ROUTES } from '../constants/routes';

// Import screens
import HomeScreen from '../screens/shell/HomeScreen';
import SOSScreen from '../screens/safety/SOSScreen';
import MapScreen from '../screens/journey/MapScreen';
import LostFoundScreen from '../screens/lostfound/LostFoundScreen';
import ProfileScreen from '../screens/account/ProfileScreen';

const Tab = createBottomTabNavigator();

// Simple icon component — replace with a real icon library (e.g., @expo/vector-icons)
function TabIcon({ label, focused }) {
  const iconMap = {
    Home: '🏠', Safety: '🆘', Map: '🗺️', 'Lost & Found': '🔍', Profile: '👤',
  };
  return (
    <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>
      {iconMap[label]}
    </Text>
  );
}

export default function MainTabNavigator() {
  const { userProfile } = useAuth();
  const childMode = userProfile && isChild(userProfile.role);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: '#E53935',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#eee',
          paddingBottom: 4,
          height: 60,
        },
        headerStyle: { backgroundColor: '#E53935' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      })}
    >
      <Tab.Screen
        name={ROUTES.HOME}
        component={HomeScreen}
        options={{ title: 'Home', tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name={ROUTES.SAFETY}
        component={SOSScreen}
        options={{ title: 'Safety', tabBarLabel: 'Safety' }}
      />
      {/* Hide Map tab for child accounts to simplify their UI */}
      {!childMode && (
        <Tab.Screen
          name={ROUTES.MAP}
          component={MapScreen}
          options={{ title: 'Map', tabBarLabel: 'Map' }}
        />
      )}
      <Tab.Screen
        name={ROUTES.LOST_FOUND}
        component={LostFoundScreen}
        options={{ title: 'Lost & Found', tabBarLabel: 'Lost & Found' }}
      />
      <Tab.Screen
        name={ROUTES.PROFILE}
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}