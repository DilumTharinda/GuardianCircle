import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ROUTES } from '../constants/routes';
import { useTheme } from '../context/ThemeContext';
import LostFoundScreen from '../screens/lostfound/LostFoundScreen';
import ReportLostScreen from '../screens/lostfound/ReportLostScreen';
import ReportFoundScreen from '../screens/lostfound/ReportFoundScreen';
import MatchChatScreen from '../screens/lostfound/MatchChatScreen';
import CommunityFeedScreen from '../screens/lostfound/CommunityFeedScreen';
import LostFoundDetailScreen from '../screens/lostfound/LostFoundDetailScreen';

const Stack = createStackNavigator();

export default function LostFoundNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.darkGreen,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
        },
      }}
    >
      <Stack.Screen
        name={ROUTES.LOST_FOUND_LIST}
        component={LostFoundScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name={ROUTES.REPORT_LOST}
        component={ReportLostScreen}
        options={{ title: 'Report Lost Item' }}
      />
      <Stack.Screen
        name={ROUTES.REPORT_FOUND}
        component={ReportFoundScreen}
        options={{ title: 'Report Found Item' }}
      />
      <Stack.Screen
        name={ROUTES.MATCH_CHAT}
        component={MatchChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name={ROUTES.COMMUNITY_FEED}
        component={CommunityFeedScreen}
        options={{ title: 'Community Reports' }}
      />
      <Stack.Screen
        name={ROUTES.LOST_FOUND_DETAIL}
        component={LostFoundDetailScreen}
        options={{ title: 'Report Details' }}
      />
    </Stack.Navigator>
  );
}