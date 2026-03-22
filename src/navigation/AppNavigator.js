import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text, StyleSheet, View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import HomeScreen from '../screens/HomeScreen';
import MatchViewScreen from '../screens/MatchViewScreen';
import MatchDetailScreen from '../screens/MatchDetailScreen';
import MatchupStatsScreen from '../screens/MatchupStatsScreen';
import PlayerDetailScreen from '../screens/PlayerDetailScreen';
import TournamentDetailScreen from '../screens/TournamentDetailScreen';

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

function HeaderTitleWithIcon() {
  return (
    <View style={styles.headerTitleWrap}>
      <Image source={require('../../media/App-Icon.jpg')} style={styles.headerIcon} />
      <Text style={styles.headerTitleText}>Tennis Statbot</Text>
    </View>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={({ navigation, route }) => ({
        headerLargeTitle: false,
        headerRight: route.name === 'Home' ? undefined : () => <HomeButton navigation={navigation} />,
      })}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerTransparent: true,
          headerBackground: () => (
            <LinearGradient
              colors={['#1a472a', '#0f2d1a']}
              style={StyleSheet.absoluteFillObject}
            />
          ),
          headerTitle: () => <HeaderTitleWithIcon />,
          headerLeft: () => null,
          headerBackVisible: false,
        }}
      />
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
        name="MatchView"
        component={MatchViewScreen}
        options={{ title: 'Match' }}
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
      <Stack.Screen
        name="TournamentDetail"
        component={TournamentDetailScreen}
        options={({ route }) => ({ title: route.params?.tournamentName ?? 'Tournament' })}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  homeBtn: { paddingLeft: 12, paddingVertical: 8, paddingRight: 4 },
  homeBtnText: { fontSize: 16, color: '#1a472a', fontWeight: '600' },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
