import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getTournamentWithBracket,
  setTournamentMatchWinner,
  linkTournamentMatchToAppMatch,
  createMatchup,
  getTournamentH2H,
} from '../db/database';

const ROUND_LABELS = ['Final', 'Semi-final', 'Quarter-final', 'Round of 16', 'Round of 32'];

function getRoundLabel(roundIndex, totalRounds) {
  const idx = totalRounds - 1 - roundIndex;
  return ROUND_LABELS[idx] ?? `Round ${roundIndex + 1}`;
}

export default function TournamentDetailScreen({ route, navigation }) {
  const { tournamentId, tournamentName } = route.params || {};
  const [data, setData] = useState(null);
  const [h2hByMatchId, setH2hByMatchId] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const bracket = await getTournamentWithBracket(tournamentId);
      setData(bracket);
      const byMatch = {};
      for (const m of bracket.matches || []) {
        const a = m.player1_app_id;
        const b = m.player2_app_id;
        if (a && b) {
          const h2h = await getTournamentH2H(tournamentId, a, b);
          byMatch[m.id] = h2h;
        }
      }
      setH2hByMatchId(byMatch);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSetWinner = useCallback(
    async (match, participantId) => {
      try {
        await setTournamentMatchWinner(match.id, participantId);
        await load();
      } catch (e) {
        Alert.alert('Error', e.message || 'Could not set winner');
      }
    },
    [load]
  );

  const handleAddToMatches = useCallback(
    async (match) => {
      const p1AppId = match.player1_app_id;
      const p2AppId = match.player2_app_id;
      if (!p1AppId || !p2AppId) return;
      try {
        const matchId = await createMatchup(p1AppId, p2AppId);
        await linkTournamentMatchToAppMatch(match.id, matchId);
        await load();
        navigation.navigate('MatchDetail', { matchId });
      } catch (e) {
        Alert.alert('Error', e.message || 'Could not add match');
      }
    },
    [load, navigation]
  );

  const openMatchActions = useCallback(
    (match) => {
      const hasWinner = !!match.winner_participant_id;
      const bothAppPlayers = match.player1_app_id && match.player2_app_id;
      if (!hasWinner) {
        const buttons = [
          { text: 'Cancel', style: 'cancel' },
          { text: `Winner: ${match.player1_name}`, onPress: () => handleSetWinner(match, match.player1_participant_id) },
          { text: `Winner: ${match.player2_name}`, onPress: () => handleSetWinner(match, match.player2_participant_id) },
        ];
        if (bothAppPlayers) buttons.push({ text: 'Add to app matches', onPress: () => handleAddToMatches(match) });
        Alert.alert(match.player1_name + ' vs ' + match.player2_name, 'Set winner or add to app matches', buttons);
      } else if (bothAppPlayers && !match.linked_match_id) {
        Alert.alert(
          'Add to matches',
          'Add this match to your main match list to record scores and stats?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add', onPress: () => handleAddToMatches(match) },
          ]
        );
      }
    },
    [handleSetWinner, handleAddToMatches]
  );

  if (loading || !data) {
    return <View style={styles.centered}><Text style={styles.loading}>Loading…</Text></View>;
  }

  const { tournament, matches } = data;
  const totalRounds = tournament.draw_size <= 2 ? 1 : Math.log2(tournament.draw_size);
  const isComplete = tournament.status === 'complete';
  let imageList = [];
  if (tournament.images) {
    try {
      imageList = typeof tournament.images === 'string' ? JSON.parse(tournament.images) : (tournament.images || []);
    } catch (_) {}
  }
  if (!Array.isArray(imageList)) imageList = [];

  const matchesByRound = {};
  matches.forEach((m) => {
    if (!matchesByRound[m.round]) matchesByRound[m.round] = [];
    matchesByRound[m.round].push(m);
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {imageList.length > 0 && (
          <View style={styles.headerImageWrap}>
            <Image source={{ uri: imageList[0] }} style={styles.headerImage} />
          </View>
        )}
        <Text style={styles.title}>{tournament.name}</Text>
        <Text style={styles.meta}>
          {tournament.draw_size}-draw · {isComplete ? 'Complete' : 'Ongoing'}
          {tournament.date ? ` · ${tournament.date}` : ''}
        </Text>
        {tournament.description ? (
          <Text style={styles.description}>{tournament.description}</Text>
        ) : null}
        {tournament.remarks ? (
          <Text style={styles.remarks}>{tournament.remarks}</Text>
        ) : null}
        {imageList.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll}>
            {imageList.map((uri, idx) => (
              <Image key={idx} source={{ uri }} style={styles.thumb} />
            ))}
          </ScrollView>
        )}
      </View>
      {Object.keys(matchesByRound)
        .map(Number)
        .sort((a, b) => a - b)
        .map((round) => (
          <View key={round} style={styles.roundBlock}>
            <Text style={styles.roundTitle}>{getRoundLabel(round, totalRounds)}</Text>
            {matchesByRound[round].map((match) => {
              const hasWinner = !!match.winner_participant_id;
              const winnerId = match.winner_participant_id;
              const p1Won = winnerId === match.player1_participant_id;
              const p2Won = winnerId === match.player2_participant_id;
              const bothApp = match.player1_app_id && match.player2_app_id;
              return (
                <TouchableOpacity
                  key={match.id}
                  style={[styles.matchCard, hasWinner && styles.matchCardDone]}
                  onPress={() => openMatchActions(match)}
                  activeOpacity={0.7}
                >
                  <View style={styles.matchRow}>
                    <Text
                      style={[
                        styles.playerName,
                        p1Won && styles.winnerName,
                      ]}
                      numberOfLines={1}
                    >
                      {match.player1_name || 'TBD'}
                    </Text>
                    <Text style={styles.vs}>vs</Text>
                    <Text
                      style={[
                        styles.playerName,
                        p2Won && styles.winnerName,
                      ]}
                      numberOfLines={1}
                    >
                      {match.player2_name || 'TBD'}
                    </Text>
                  </View>
                  {hasWinner && (
                    <Text style={styles.winnerLabel}>
                      Winner: {p1Won ? match.player1_name : match.player2_name}
                    </Text>
                  )}
                  {bothApp && (h2hByMatchId[match.id]?.wins != null || h2hByMatchId[match.id]?.losses != null) && (
                    <Text style={styles.h2hLabel}>
                      Tournament H2H: {h2hByMatchId[match.id].wins}–{h2hByMatchId[match.id].losses}
                    </Text>
                  )}
                  {bothApp && !match.linked_match_id && (
                    <Text style={styles.addHint}>Tap to add to app matches</Text>
                  )}
                  {!hasWinner && <Text style={styles.tapHint}>Tap to set winner</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loading: { fontSize: 16, color: '#666' },
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  headerImageWrap: { marginBottom: 10, borderRadius: 12, overflow: 'hidden' },
  headerImage: { width: '100%', height: 180, backgroundColor: '#e8ece8' },
  title: { fontSize: 22, fontWeight: '700', color: '#1a472a' },
  meta: { fontSize: 14, color: '#666', marginTop: 4 },
  description: { fontSize: 14, color: '#333', marginTop: 8, lineHeight: 20 },
  remarks: { fontSize: 13, color: '#666', marginTop: 4, fontStyle: 'italic' },
  thumbScroll: { marginTop: 10, marginHorizontal: -16 },
  thumb: { width: 80, height: 80, borderRadius: 8, marginRight: 8, backgroundColor: '#e8ece8' },
  roundBlock: { marginBottom: 24 },
  roundTitle: { fontSize: 15, fontWeight: '700', color: '#5a6a5a', marginBottom: 10 },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#c9a227',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  matchCardDone: { borderLeftColor: '#6b7b6b' },
  matchRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  playerName: { fontSize: 15, color: '#1a1a1a', flex: 1 },
  winnerName: { fontWeight: '700', color: '#1a472a' },
  vs: { fontSize: 12, color: '#888', marginHorizontal: 6 },
  winnerLabel: { fontSize: 12, color: '#1a472a', marginTop: 4, fontWeight: '600' },
  h2hLabel: { fontSize: 11, color: '#5a6a5a', marginTop: 2, fontStyle: 'italic' },
  addHint: { fontSize: 11, color: '#c9a227', marginTop: 2 },
  tapHint: { fontSize: 11, color: '#888', marginTop: 2 },
});
