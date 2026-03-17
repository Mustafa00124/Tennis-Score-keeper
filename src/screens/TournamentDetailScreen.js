import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ImageBackground,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getTournamentWithBracket,
  setTournamentMatchWinner,
  linkTournamentMatchToAppMatch,
  createMatchup,
  getTournamentH2H,
} from '../db/database';

/** Catches render errors and shows a message instead of blank */
class TournamentDetailErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('TournamentDetailScreen error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={errorBoundaryStyles.wrap}>
          <Text style={errorBoundaryStyles.text}>Something went wrong loading this tournament.</Text>
          <Text style={errorBoundaryStyles.sub}>{this.state.error?.message || ''}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
const errorBoundaryStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#1a2e1a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { fontSize: 16, color: '#fff', textAlign: 'center' },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8, textAlign: 'center' },
});

const ROUND_LABELS = ['Final', 'Semi-final', 'Quarter-final', 'Round of 16', 'Round of 32'];
const BRACKET_SLOT_HEIGHT = 20;
const BRACKET_MATCH_HEIGHT = 52;
const BRACKET_COLUMN_WIDTH = 130;
const BRACKET_HALF_CARD = BRACKET_MATCH_HEIGHT / 2;

function getRoundLabel(roundIndex, totalRounds) {
  const idx = totalRounds - 1 - roundIndex;
  return ROUND_LABELS[idx] ?? `Round ${roundIndex + 1}`;
}

/** Vertical position (from top) for match at (round, matchIndex) in a bracket with totalRounds. */
function bracketSlotTop(round, matchIndex, totalRounds) {
  const base = (2 * matchIndex + 1) * Math.pow(2, totalRounds - 1 - round) * BRACKET_SLOT_HEIGHT;
  return Math.max(0, base - BRACKET_HALF_CARD);
}

function TournamentDetailScreenInner({ route, navigation }) {
  const params = route?.params ?? {};
  const tournamentId = params.tournamentId;
  const tournamentName = params.tournamentName;
  const [data, setData] = useState(null);
  const [h2hByMatchId, setH2hByMatchId] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tournamentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const bracket = await getTournamentWithBracket(tournamentId);
      setData(bracket || null);
      if (bracket && Array.isArray(bracket.matches)) {
        const byMatch = {};
        for (const m of bracket.matches) {
          const a = m.player1_app_id;
          const b = m.player2_app_id;
          if (a && b) {
            try {
              const h2h = await getTournamentH2H(tournamentId, a, b);
              byMatch[m.id] = h2h;
            } catch (_) {}
          }
        }
        setH2hByMatchId(byMatch);
      }
    } catch (err) {
      setData(null);
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

  const matches = data?.matches;
  const matchesByRound = useMemo(() => {
    const byRound = {};
    (matches || []).forEach((m) => {
      const r = typeof m.round === 'number' ? m.round : 0;
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push(m);
    });
    Object.keys(byRound).forEach((r) => {
      const arr = byRound[r];
      if (Array.isArray(arr)) arr.sort((a, b) => (a.match_index_in_round ?? 0) - (b.match_index_in_round ?? 0));
    });
    return byRound;
  }, [matches]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ImageBackground source={require('../../media/tennis.jpg')} style={styles.backgroundImage} resizeMode="cover">
          <View style={styles.backgroundOverlay} />
          <View style={styles.centered}>
            <Text style={styles.loading}>Loading…</Text>
          </View>
        </ImageBackground>
      </View>
    );
  }

  if (!data || !data.tournament) {
    return (
      <View style={styles.container}>
        <ImageBackground source={require('../../media/tennis.jpg')} style={styles.backgroundImage} resizeMode="cover">
          <View style={styles.backgroundOverlay} />
          <View style={styles.centered}>
            <Text style={styles.loading}>Tournament not found</Text>
          </View>
        </ImageBackground>
      </View>
    );
  }

  const { tournament } = data;
  const drawSize = tournament?.draw_size ?? 8;
  const totalRounds = drawSize <= 2 ? 1 : Math.max(1, Math.floor(Math.log2(drawSize)));
  const isComplete = tournament.status === 'complete';
  let imageList = [];
  if (tournament.images) {
    try {
      imageList = typeof tournament.images === 'string' ? JSON.parse(tournament.images) : (tournament.images || []);
    } catch (_) {}
  }
  if (!Array.isArray(imageList)) imageList = [];

  const roundIndices = Object.keys(matchesByRound)
    .map((r) => parseInt(r, 10))
    .filter((r) => !Number.isNaN(r))
    .sort((a, b) => a - b);
  const firstRoundMatchCount = roundIndices.length > 0 ? (matchesByRound[roundIndices[0]]?.length || 0) : 0;
  const bracketHeight =
    firstRoundMatchCount > 0
      ? firstRoundMatchCount * 2 * Math.pow(2, totalRounds - 1) * BRACKET_SLOT_HEIGHT + BRACKET_MATCH_HEIGHT
      : 200;
  const bracketColumnHeight = 28 + bracketHeight;

  return (
    <View style={styles.container}>
      <ImageBackground source={require('../../media/tennis.jpg')} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.backgroundOverlay} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerGlass}>
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

          <Text style={styles.bracketTitle}>Bracket</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={[styles.bracketScrollContent, { minHeight: bracketColumnHeight + 20 }]}
          >
            {roundIndices.map((round) => {
              const roundMatches = matchesByRound[round] || [];
              return (
                <View key={round} style={[styles.bracketColumn, { width: BRACKET_COLUMN_WIDTH, minHeight: bracketColumnHeight }]}>
                  <Text style={styles.bracketRoundLabel} numberOfLines={1}>
                    {getRoundLabel(round, totalRounds)}
                  </Text>
                  {roundMatches.map((match, i) => {
                    const hasWinner = !!match.winner_participant_id;
                    const winnerId = match.winner_participant_id;
                    const p1Won = winnerId === match.player1_participant_id;
                    const p2Won = winnerId === match.player2_participant_id;
                    const bothApp = match.player1_app_id && match.player2_app_id;
                    const top = bracketSlotTop(round, i, totalRounds);
                    return (
                      <TouchableOpacity
                        key={match.id ?? `r${round}-${i}`}
                        style={[styles.bracketMatchCard, hasWinner && styles.bracketMatchCardDone, { top: 24 + top }]}
                        onPress={() => openMatchActions(match)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.bracketPlayer, p1Won && styles.bracketWinner]} numberOfLines={1}>
                          {match.player1_name || 'TBD'}
                        </Text>
                        <Text style={styles.bracketVs}>vs</Text>
                        <Text style={[styles.bracketPlayer, p2Won && styles.bracketWinner]} numberOfLines={1}>
                          {match.player2_name || 'TBD'}
                        </Text>
                        {hasWinner && (
                          <Text style={styles.bracketWinnerLabel} numberOfLines={1}>
                            ✓ {p1Won ? match.player1_name : match.player2_name}
                          </Text>
                        )}
                        {bothApp && (h2hByMatchId[match.id]?.wins != null || h2hByMatchId[match.id]?.losses != null) && (
                          <Text style={styles.bracketH2h} numberOfLines={1}>
                            H2H: {h2hByMatchId[match.id].wins}–{h2hByMatchId[match.id].losses}
                          </Text>
                        )}
                        {!hasWinner && <Text style={styles.bracketTapHint}>Tap to set winner</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a2e1a' },
  backgroundImage: { flex: 1 },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loading: { fontSize: 16, color: 'rgba(255,255,255,0.95)' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  headerGlass: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  headerImageWrap: { marginBottom: 10, borderRadius: 12, overflow: 'hidden' },
  headerImage: { width: '100%', height: 160, backgroundColor: 'rgba(0,0,0,0.06)' },
  title: { fontSize: 20, fontWeight: '700', color: '#1a472a' },
  meta: { fontSize: 14, color: '#555', marginTop: 4 },
  description: { fontSize: 14, color: '#333', marginTop: 8, lineHeight: 20 },
  remarks: { fontSize: 13, color: '#666', marginTop: 4, fontStyle: 'italic' },
  thumbScroll: { marginTop: 10, marginHorizontal: -8 },
  thumb: { width: 72, height: 72, borderRadius: 8, marginRight: 8, backgroundColor: 'rgba(0,0,0,0.06)' },

  bracketTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bracketScrollContent: { paddingRight: 24, paddingBottom: 20 },
  bracketColumn: {
    marginRight: 12,
    alignItems: 'center',
  },
  bracketRoundLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  bracketMatchCard: {
    position: 'absolute',
    left: 0,
    width: BRACKET_COLUMN_WIDTH - 8,
    minHeight: BRACKET_MATCH_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bracketMatchCardDone: { borderLeftWidth: 3, borderLeftColor: '#1a472a' },
  bracketPlayer: { fontSize: 12, color: '#1a1a1a' },
  bracketWinner: { fontWeight: '700', color: '#1a472a' },
  bracketVs: { fontSize: 10, color: '#888', marginVertical: 2 },
  bracketWinnerLabel: { fontSize: 10, color: '#1a472a', fontWeight: '600', marginTop: 2 },
  bracketH2h: { fontSize: 9, color: '#5a6a5a', marginTop: 1 },
  bracketTapHint: { fontSize: 9, color: '#888', marginTop: 2 },
});

export default function TournamentDetailScreen(props) {
  return (
    <TournamentDetailErrorBoundary>
      <TournamentDetailScreenInner {...props} />
    </TournamentDetailErrorBoundary>
  );
}
