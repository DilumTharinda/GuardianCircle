import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ROUTES } from '../constants/routes';
import LostFoundScreen from '../screens/lostfound/LostFoundScreen';
import ReportLostScreen from '../screens/lostfound/ReportLostScreen';
import ReportFoundScreen from '../screens/lostfound/ReportFoundScreen';

const Stack = createStackNavigator();

export default function LostFoundNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#E53935' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen
        name={ROUTES.LOST_FOUND_LIST}
        component={LostFoundScreen}
        options={{ title: 'Lost & Found' }}
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
    </Stack.Navigator>
  );
}