import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ROUTES } from '../constants/routes';
import { useTheme } from '../context/ThemeContext';
import CircleFindScreen from '../screens/circlefind/CircleFindScreen';
import CircleFindReportScreen from '../screens/circlefind/CircleFindReportScreen';
import CircleFindDetailScreen from '../screens/circlefind/CircleFindDetailScreen';
import MatchChatScreen from '../screens/circlefind/MatchChatScreen';
import CommunityFeedScreen from '../screens/circlefind/CommunityFeedScreen';

const Stack = createStackNavigator();

export default function CircleFindNavigator() {
  const { colors } = useTheme();

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
        name={ROUTES.CIRCLE_FIND_LIST}
        component={CircleFindScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name={ROUTES.CIRCLE_FIND_REPORT}
        component={CircleFindReportScreen}
        options={{ title: 'Report Missing Item' }}
      />
      <Stack.Screen
        name={ROUTES.CIRCLE_FIND_DETAIL}
        component={CircleFindDetailScreen}
        options={{ title: 'Item Details' }}
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
    </Stack.Navigator>
  );
}

