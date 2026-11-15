import React, { useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isChild, isParent } from '../constants/roles';
import { ROUTES } from '../constants/routes';
import ThemeToggle from '../components/ThemeToggle';
import { scale, verticalScale, normalize } from '../utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import screens
import HomeScreen from '../screens/shell/HomeScreen';
import SOSScreen from '../screens/safety/SOSScreen';
import MapScreen from '../screens/journey/MapScreen';
import CircleFindNavigator from './CircleFindNavigator';
import ProfileScreen from '../screens/account/ProfileScreen';
import ParentDashboardScreen from '../screens/parentchild/ParentDashboardScreen';

const Tab = createBottomTabNavigator();

// Icon map — Ionicons name for each route
const TAB_ICONS = {
  [ROUTES.HOME]:        { active: 'home', inactive: 'home-outline' },
  [ROUTES.SAFETY]:      { active: 'shield', inactive: 'shield-outline' },
  [ROUTES.MAP]:         { active: 'map', inactive: 'map-outline' },
  [ROUTES.CIRCLE_FIND]: { active: 'search', inactive: 'search-outline' },
  [ROUTES.LOST_FOUND]:  { active: 'search', inactive: 'search-outline' },
  [ROUTES.PROFILE]:     { active: 'person', inactive: 'person-outline' },
};

export default function MainTabNavigator() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const childMode = userProfile && isChild(userProfile.role);
  const parentMode = userProfile && isParent(userProfile.role);
  const lastMapTapRef = useRef(0);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
          const iconName = focused ? icons.active : icons.inactive;
          return <Ionicons name={iconName} size={focused ? 24 : 22} color={color} />;
        },
        tabBarActiveTintColor: colors.darkGreenMid,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom > 0 ? insets.bottom : verticalScale(12),
          paddingTop: verticalScale(4),
          height: insets.bottom > 0 ? verticalScale(60) + insets.bottom : verticalScale(70),
        },
        tabBarLabelStyle: {
          fontSize: normalize(10),
          fontWeight: '600',
          marginTop: 0,
        },
        headerStyle: { backgroundColor: colors.darkGreen },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerRight: () => <ThemeToggle style={{ marginRight: scale(15) }} iconColor="#fff" />,
      })}
    >
      <Tab.Screen
        name={ROUTES.HOME}
        component={parentMode ? ParentDashboardScreen : HomeScreen}
        options={{ 
          title: parentMode ? 'Family' : 'Home', 
          tabBarLabel: parentMode ? 'Family' : 'Home', 
          headerShown: parentMode ? true : false // Parent dashboard doesn't have a custom header, it uses the native one
        }}
      />
      <Tab.Screen
        name={ROUTES.SAFETY}
        component={SOSScreen}
        options={{ title: 'Safety', tabBarLabel: 'Safety', headerShown: false }}
      />
      {/* Hide Map tab for child accounts to simplify their UI */}
      {!childMode && (
        <Tab.Screen
          name={ROUTES.MAP}
          component={MapScreen}
          options={{ title: 'Map', tabBarLabel: 'Map', headerShown: false }}
          listeners={({ navigation }) => ({
            tabPress: () => {
              const now = Date.now();
              if (now - lastMapTapRef.current < 500) {
                // Double tap detected on Map icon -> Open half window for unsafe location report
                lastMapTapRef.current = 0;
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch (_) {}
                DeviceEventEmitter.emit('OPEN_UNSAFE_REPORT');
                navigation.navigate(ROUTES.MAP, { openReport: now });
              } else {
                lastMapTapRef.current = now;
              }
            },
          })}
        />
      )}
      <Tab.Screen
        name={ROUTES.CIRCLE_FIND}
        component={CircleFindNavigator}
        options={{ title: 'CircleFind', tabBarLabel: 'CircleFind', headerShown: false }}
      />
      <Tab.Screen
        name={ROUTES.PROFILE}
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarLabel: 'Profile', headerShown: false }}
      />
    </Tab.Navigator>
  );
}