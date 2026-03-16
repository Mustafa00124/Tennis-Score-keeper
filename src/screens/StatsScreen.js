import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllPlayers, getPlayerStats, getHeadToHead } from '../db/database';

export default function StatsScreen() {
  const [players, setPlayers] = useState([]);
  const [statsList, setStatsList] = useState([]);
  const [h2h, setH2h] = useState([]);

  const load = useCallback(async () => {
    const list = await getAllPlayers();
    setPlayers(list);
    const stats = await Promise.all(list.map((p) => getPlayerStats(p.id).then((s) => ({ ...p, ...s }))));
    setStatsList(stats.filter((s) => s.matchesPlayed > 0).sort((a, b) => b.wins - a.wins));

    const pairs = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const record = await getHeadToHead(list[i].id, list[j].id);
        if (record.wins + record.losses > 0) {
          pairs.push({
            player1: list[i],
            player2: list[j],
            ...record,
          });
        }
      }
    }
    setH2h(pairs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Overview</Text>
      {statsList.length === 0 ? (
        <Text style={styles.hint}>Play some matches to see stats.</Text>
      ) : (
        <View style={styles.card}>
          {statsList.map((p) => (
            <View key={p.id} style={styles.statRow}>
              <Text style={styles.statName}>{p.name}</Text>
              <View style={styles.statNums}>
                <Text style={styles.statNum}>{p.matchesPlayed} M</Text>
                <Text style={styles.statNum}>{p.wins} W</Text>
                <Text style={styles.statNum}>{p.losses} L</Text>
                <Text style={styles.statNum}>{p.totalSetsWon} sets</Text>
                <Text style={styles.statNum}>{p.totalGamesWon} games</Text>
                <Text style={[styles.statNum, styles.winPct]}>{p.winPercentage.toFixed(1)}%</Text>
                <Text style={styles.statNum}>Streak: {p.currentWinStreak ?? 0}</Text>
                <Text style={styles.statNum}>Best: {p.bestWinStreak ?? 0}</Text>
                <Text style={styles.statNum}>Bagels: {p.bagelsServed ?? 0}</Text>
                <Text style={styles.statNum}>Breadsticks: {p.breadsticksServed ?? 0}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.title}>Head-to-head</Text>
      {h2h.length === 0 ? (
        <Text style={styles.hint}>No head-to-head data yet.</Text>
      ) : (
        <View style={styles.card}>
          {h2h.map((item, i) => (
            <View key={i} style={styles.h2hRow}>
              <Text style={styles.h2hNames}>
                {item.player1.name} vs {item.player2.name}
              </Text>
              <Text style={styles.h2hScore}>
                {item.wins}-{item.losses}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a472a', marginBottom: 12, marginTop: 8 },
  hint: { color: '#666', marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statRow: { marginBottom: 14 },
  statName: { fontSize: 17, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  statNums: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statNum: { fontSize: 14, color: '#444' },
  winPct: { fontWeight: '700', color: '#1a472a' },
  h2hRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  h2hNames: { fontSize: 15, color: '#1a1a1a', flex: 1 },
  h2hScore: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
});
