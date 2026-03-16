import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getHeadToHead, getMatchesForPlayer, getMatchResult } from '../db/database';

export default function MatchupStatsScreen({ route, navigation }) {
  const { player1Id, player2Id, player1Name, player2Name } = route.params || {};
  const [h2h, setH2h] = useState(null);
  const [matches, setMatches] = useState([]);

  const load = useCallback(async () => {
    if (!player1Id || !player2Id) return;
    const [record, allMatches] = await Promise.all([
      getHeadToHead(player1Id, player2Id),
      getMatchesForPlayer(player1Id),
    ]);
    setH2h(record);
    const between = allMatches.filter(
      (m) => m.player1_id === player2Id || m.player2_id === player2Id
    );
    setMatches(between);
  }, [player1Id, player2Id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openMatch = useCallback(
    (matchId) => {
      navigation.navigate('MatchDetail', { matchId });
    },
    [navigation]
  );

  if (h2h === null) {
    return <Text style={styles.loading}>Loading…</Text>;
  }

  const title = [player1Name, player2Name].filter(Boolean).join(' vs ') || 'Matchup';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.vs}>{title}</Text>
        <View style={styles.h2hBox}>
          <Text style={styles.h2hLabel}>Head-to-head</Text>
          <Text style={styles.h2hScore}>
            {player1Name} {h2h.wins} – {h2h.losses} {player2Name}
          </Text>
          <Text style={styles.h2hSub}>
            {h2h.wins + h2h.losses} match{h2h.wins + h2h.losses !== 1 ? 'es' : ''} played
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Matches</Text>
      {matches.length === 0 ? (
        <Text style={styles.hint}>No matches recorded yet.</Text>
      ) : (
        matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            player1Id={player1Id}
            player2Id={player2Id}
            onPress={() => openMatch(m.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

function MatchRow({ match, player1Id, player2Id, onPress }) {
  const [result, setResult] = useState(null);
  React.useEffect(() => {
    let cancelled = false;
    getMatchResult(match.id).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => { cancelled = true; };
  }, [match.id]);

  const dateLabel = match.date_played || 'No date';
  const scoreLabel = result
    ? `${result.setsPlayer1}-${result.setsPlayer2} sets`
    : '—';

  return (
    <TouchableOpacity style={styles.matchRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.matchDate}>{dateLabel}</Text>
      <Text style={styles.matchScore}>{scoreLabel}</Text>
      <Text style={styles.matchChevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  content: { padding: 16, paddingBottom: 40 },
  loading: { padding: 24, textAlign: 'center', color: '#666' },
  header: { marginBottom: 24 },
  vs: { fontSize: 20, fontWeight: '700', color: '#1a472a', textAlign: 'center', marginBottom: 16 },
  h2hBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  h2hLabel: { fontSize: 12, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  h2hScore: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  h2hSub: { fontSize: 13, color: '#888', marginTop: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 12 },
  hint: { color: '#666', fontSize: 15, marginBottom: 16 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1a472a',
  },
  matchDate: { fontSize: 15, color: '#333', flex: 1 },
  matchScore: { fontSize: 14, color: '#666', marginRight: 8 },
  matchChevron: { fontSize: 18, color: '#1a472a', fontWeight: '700' },
});
