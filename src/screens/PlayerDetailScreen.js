import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMatchesForPlayer, getPlayerStats, getMatchResult } from '../db/database';

export default function PlayerDetailScreen({ route }) {
  const { playerId, playerName } = route.params || {};
  const [matches, setMatches] = useState([]);
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    if (!playerId) return;
    const [matchList, playerStats] = await Promise.all([
      getMatchesForPlayer(playerId),
      getPlayerStats(playerId),
    ]);
    setMatches(matchList);
    setStats(playerStats);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!playerId) {
    return <Text style={styles.hint}>Invalid player</Text>;
  }

  const renderMatch = ({ item }) => {
    const opponent = item.player1_id === playerId ? item.player2_name : item.player1_name;
    const isPlayer1 = item.player1_id === playerId;
    return (
      <MatchRow
        matchId={item.id}
        date={item.date_played}
        opponent={opponent}
        isPlayer1={isPlayer1}
        playerId={playerId}
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{playerName}</Text>
        {stats && (
          <View style={styles.statsRow}>
            <StatBlock value={stats.matchesPlayed} label="Matches" />
            <StatBlock value={stats.wins} label="Wins" />
            <StatBlock value={stats.losses} label="Losses" />
            <StatBlock value={stats.winPercentage.toFixed(1) + '%'} label="Win %" />
          </View>
        )}
      </View>
      <Text style={styles.sectionTitle}>Match history</Text>
      {matches.length === 0 ? (
        <Text style={styles.hint}>No matches yet.</Text>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMatch}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function StatBlock({ value, label }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MatchRow({ matchId, date, opponent, isPlayer1, playerId }) {
  const [result, setResult] = useState(null);
  React.useEffect(() => {
    let cancelled = false;
    getMatchResult(matchId).then((r) => {
      if (!cancelled && r) setResult(r);
    });
    return () => { cancelled = true; };
  }, [matchId]);

  if (!result) return <View style={styles.matchRow}><Text style={styles.matchText}>— vs {opponent} ({date})</Text></View>;

  const won = result.winnerId === playerId;
  const setsFor = isPlayer1 ? result.setsPlayer1 : result.setsPlayer2;
  const setsAgainst = isPlayer1 ? result.setsPlayer2 : result.setsPlayer1;
  const scoreStr = `${setsFor}-${setsAgainst}`;

  return (
    <View style={[styles.matchRow, won && styles.matchRowWin]}>
      <Text style={styles.matchText}>
        {won ? 'W' : 'L'} {scoreStr} vs {opponent}
      </Text>
      <Text style={styles.matchDate}>{date}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  name: { fontSize: 24, fontWeight: '700', color: '#1a472a', marginBottom: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statBlock: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginHorizontal: 16, marginBottom: 8, color: '#333' },
  list: { padding: 16, paddingBottom: 32 },
  matchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  matchRowWin: { borderLeftColor: '#1a472a' },
  matchText: { fontSize: 16, color: '#1a1a1a' },
  matchDate: { fontSize: 14, color: '#666' },
  hint: { padding: 24, textAlign: 'center', color: '#666' },
});
