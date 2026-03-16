import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import MatchDetailScreen from '../screens/MatchDetailScreen';
import PlayersScreen from '../screens/PlayersScreen';
import PlayerDetailScreen from '../screens/PlayerDetailScreen';
import StatsScreen from '../screens/StatsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerLargeTitle: false }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Stack.Screen
        name="MatchDetail"
        component={MatchDetailScreen}
        options={{ title: 'Match details' }}
      />
    </Stack.Navigator>
  );
}

function PlayersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerLargeTitle: true }}>
      <Stack.Screen name="PlayersList" component={PlayersScreen} options={{ title: 'Players' }} />
      <Stack.Screen
        name="PlayerDetail"
        component={PlayerDetailScreen}
        options={({ route }) => ({ title: route.params?.playerName ?? 'Player' })}
      />
    </Stack.Navigator>
  );
}

function TabIcon({ name, focused }) {
  const icons = { Home: '🏠', Players: '👤', Stats: '📊' };
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{icons[name] || '•'}</Text>;
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        headerShown: route.name !== 'Players',
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} options={{ headerShown: false }} />
      <Tab.Screen name="Players" component={PlayersStack} options={{ headerShown: false }} />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{ title: 'Statistics', headerLargeTitle: false }}
      />
    </Tab.Navigator>
  );
}
