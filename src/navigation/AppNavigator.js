import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import MatchDetailScreen from '../screens/MatchDetailScreen';
import MatchupStatsScreen from '../screens/MatchupStatsScreen';
import PlayerDetailScreen from '../screens/PlayerDetailScreen';

const Stack = createNativeStackNavigator();

function HomeButton({ navigation }) {
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Home')}
      style={styles.homeBtn}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Text style={styles.homeBtnText}>🏠 Home</Text>
    </TouchableOpacity>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={({ navigation, route }) => ({
        headerLargeTitle: false,
        headerLeft: route.name === 'Home' ? undefined : () => <HomeButton navigation={navigation} />,
      })}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Tennis Score' }} />
      <Stack.Screen
        name="MatchupStats"
        component={MatchupStatsScreen}
        options={({ route }) => ({
          title: route.params?.player1Name && route.params?.player2Name
            ? `${route.params.player1Name} vs ${route.params.player2Name}`
            : 'Matchup stats',
        })}
      />
      <Stack.Screen
        name="MatchDetail"
        component={MatchDetailScreen}
        options={{ title: 'Edit match' }}
      />
      <Stack.Screen
        name="PlayerDetail"
        component={PlayerDetailScreen}
        options={({ route }) => ({ title: route.params?.playerName ?? 'Player' })}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  homeBtn: { paddingLeft: 4, paddingVertical: 8, paddingRight: 12 },
  homeBtnText: { fontSize: 16, color: '#1a472a', fontWeight: '600' },
});
