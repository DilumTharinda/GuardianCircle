import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { isChild } from '../constants/roles';
import { ROUTES } from '../constants/routes';
import { COLORS } from '../constants/theme';

// Import screens
import HomeScreen from '../screens/shell/HomeScreen';
import SOSScreen from '../screens/safety/SOSScreen';
import MapScreen from '../screens/journey/MapScreen';
import LostFoundNavigator from './LostFoundNavigator';
import ProfileScreen from '../screens/account/ProfileScreen';

const Tab = createBottomTabNavigator();

// Icon map — Ionicons name for each route
const TAB_ICONS = {
  [ROUTES.HOME]:       { active: 'home', inactive: 'home-outline' },
  [ROUTES.SAFETY]:     { active: 'shield', inactive: 'shield-outline' },
  [ROUTES.MAP]:        { active: 'map', inactive: 'map-outline' },
  [ROUTES.LOST_FOUND]: { active: 'search', inactive: 'search-outline' },
  [ROUTES.PROFILE]:    { active: 'person', inactive: 'person-outline' },
};

export default function MainTabNavigator() {
  const { userProfile } = useAuth();
  const childMode = userProfile && isChild(userProfile.role);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
          const iconName = focused ? icons.active : icons.inactive;
          return <Ionicons name={iconName} size={focused ? 24 : 22} color={color} />;
        },
        tabBarActiveTintColor: COLORS.darkGreenMid,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          paddingBottom: 6,
          paddingTop: 4,
          height: 62,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 0,
        },
        headerStyle: { backgroundColor: COLORS.darkGreen },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      })}
    >
      <Tab.Screen
        name={ROUTES.HOME}
        component={HomeScreen}
        options={{ title: 'Home', tabBarLabel: 'Home', headerShown: false }}
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
        component={LostFoundNavigator}
        options={{ title: 'Lost & Found', tabBarLabel: 'Lost&Found', headerShown: false }}
      />
      <Tab.Screen
        name={ROUTES.PROFILE}
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarLabel: 'Profile', headerShown: false }}
      />
    </Tab.Navigator>
  );
}