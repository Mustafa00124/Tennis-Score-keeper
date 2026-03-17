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

function getRoundLabel(roundIndex, totalRounds) {
  const idx = totalRounds - 1 - roundIndex;
  return ROUND_LABELS[idx] ?? `Round ${roundIndex + 1}`;
}

// ─── Knockout bracket layout constants ───────────────────────────────────────
const BK_CARD_W = 152;
const BK_CARD_H = 76;
const BK_CONN_W = 52;          // width of the connector zone between columns
const BK_COL_W = BK_CARD_W + BK_CONN_W;
const BK_UNIT = 100;           // vertical slot height for one first-round match
const BK_LINE = 2;
const BK_LINE_COLOR = 'rgba(255,255,255,0.65)';

/**
 * Renders a tree-style knockout bracket.
 *
 * Layout maths (per round r, 0 = first round):
 *   slotH  = totalH / numMatchesInRound
 *   card   centred at (i + 0.5) * slotH
 *   connector pair p: topCY=(2p+0.5)*slotH  botCY=(2p+1.5)*slotH  midCY=(2p+1)*slotH
 */
function KnockoutBracket({ matchesByRound, roundIndices, totalRounds, openMatchActions, h2hByMatchId }) {
  if (!roundIndices.length) return null;
  const numFirstRound = matchesByRound[roundIndices[0]]?.length || 0;
  if (numFirstRound === 0) return null;

  const totalH = numFirstRound * BK_UNIT;
  const numCols = roundIndices.length;
  const bracketW = numCols * BK_CARD_W + Math.max(0, numCols - 1) * BK_CONN_W;

  const elements = [];

  roundIndices.forEach((round, colIdx) => {
    const roundMatches = (matchesByRound[round] || [])
      .slice()
      .sort((a, b) => (a.match_index_in_round ?? 0) - (b.match_index_in_round ?? 0));
    const numMatches = roundMatches.length;
    if (numMatches === 0) return;

    const slotH = totalH / numMatches;
    const colX = colIdx * BK_COL_W;

    // ── Match cards ──────────────────────────────────────────────────────────
    roundMatches.forEach((match, i) => {
      const centerY = (i + 0.5) * slotH;
      const cardTop = Math.round(centerY - BK_CARD_H / 2);
      const hasWinner = !!match.winner_participant_id;
      const p1Won = match.winner_participant_id === match.player1_participant_id;
      const p2Won = match.winner_participant_id === match.player2_participant_id;
      const h2h = h2hByMatchId[match.id];
      const bothApp = match.player1_app_id && match.player2_app_id;

      elements.push(
        <TouchableOpacity
          key={`card-${round}-${i}`}
          style={{
            position: 'absolute', left: colX, top: cardTop,
            width: BK_CARD_W, minHeight: BK_CARD_H,
            backgroundColor: 'rgba(255,255,255,0.78)',
            borderRadius: 10, padding: 8,
            borderLeftWidth: 3,
            borderLeftColor: hasWinner ? '#1a472a' : 'rgba(180,200,180,0.7)',
            borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.9)',
            borderRightColor: 'rgba(255,255,255,0.9)',
            borderBottomColor: 'rgba(255,255,255,0.9)',
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.13, shadowRadius: 3, elevation: 2,
          }}
          onPress={() => openMatchActions(match)}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 12, fontWeight: p1Won ? '700' : '400', color: p1Won ? '#1a472a' : '#1a1a1a' }} numberOfLines={1}>
            {match.player1_name || 'TBD'}
          </Text>
          <Text style={{ fontSize: 10, color: '#aaa', marginVertical: 1 }}>vs</Text>
          <Text style={{ fontSize: 12, fontWeight: p2Won ? '700' : '400', color: p2Won ? '#1a472a' : '#1a1a1a' }} numberOfLines={1}>
            {match.player2_name || 'TBD'}
          </Text>
          {hasWinner && (
            <Text style={{ fontSize: 10, color: '#1a472a', fontWeight: '600', marginTop: 3 }} numberOfLines={1}>
              ✓ {p1Won ? match.player1_name : match.player2_name}
            </Text>
          )}
          {bothApp && h2h && h2h.wins != null && (
            <Text style={{ fontSize: 9, color: '#5a7a5a', marginTop: 1 }} numberOfLines={1}>
              H2H {h2h.wins}–{h2h.losses}
            </Text>
          )}
          {!hasWinner && (match.player1_name !== 'TBD' || match.player2_name !== 'TBD') && (
            <Text style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>Tap to set winner</Text>
          )}
        </TouchableOpacity>
      );
    });

    // ── Connector lines to next column ───────────────────────────────────────
    if (colIdx < numCols - 1) {
      const halfConn = BK_CONN_W / 2;
      const numPairs = Math.floor(numMatches / 2);
      for (let p = 0; p < numPairs; p++) {
        const topCY = Math.round((2 * p + 0.5) * slotH);
        const botCY = Math.round((2 * p + 1.5) * slotH);
        const midCY = Math.round((topCY + botCY) / 2);
        const cx = colX + BK_CARD_W;
        // horizontal stub from right edge of top card
        elements.push(<View key={`lth-${round}-${p}`} style={{ position: 'absolute', left: cx, top: topCY - 1, width: halfConn, height: BK_LINE, backgroundColor: BK_LINE_COLOR }} />);
        // horizontal stub from right edge of bottom card
        elements.push(<View key={`lbh-${round}-${p}`} style={{ position: 'absolute', left: cx, top: botCY - 1, width: halfConn, height: BK_LINE, backgroundColor: BK_LINE_COLOR }} />);
        // vertical bar joining the two stubs
        elements.push(<View key={`lv-${round}-${p}`} style={{ position: 'absolute', left: cx + halfConn - 1, top: topCY, width: BK_LINE, height: botCY - topCY, backgroundColor: BK_LINE_COLOR }} />);
        // horizontal line from midpoint into the next round's card
        elements.push(<View key={`lmh-${round}-${p}`} style={{ position: 'absolute', left: cx + halfConn, top: midCY - 1, width: halfConn, height: BK_LINE, backgroundColor: BK_LINE_COLOR }} />);
      }
    }
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
      <View style={{ paddingBottom: 24, paddingRight: 16 }}>
        {/* Round labels */}
        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          {roundIndices.map((round, colIdx) => (
            <View key={round} style={{ width: colIdx < numCols - 1 ? BK_COL_W : BK_CARD_W, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.92)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {getRoundLabel(round, totalRounds)}
              </Text>
            </View>
          ))}
        </View>
        {/* Canvas */}
        <View style={{ width: bracketW, height: totalH }}>
          {elements}
        </View>
      </View>
    </ScrollView>
  );
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
  const participants = data?.participants;
  const isRoundRobin = data?.tournament?.format === 'round_robin';

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

  const leagueTable = useMemo(() => {
    if (!isRoundRobin || !participants?.length || !matches) return [];
    const pts = {};
    participants.forEach((p) => {
      pts[p.id] = { participant: p, played: 0, won: 0, lost: 0, points: 0 };
    });
    matches.forEach((m) => {
      const p1Id = m.player1_participant_id;
      const p2Id = m.player2_participant_id;
      if (p1Id && pts[p1Id]) {
        pts[p1Id].played++;
        if (m.winner_participant_id === p1Id) {
          pts[p1Id].won++;
          pts[p1Id].points += 3;
        } else if (m.winner_participant_id) pts[p1Id].lost++;
      }
      if (p2Id && pts[p2Id]) {
        pts[p2Id].played++;
        if (m.winner_participant_id === p2Id) {
          pts[p2Id].won++;
          pts[p2Id].points += 3;
        } else if (m.winner_participant_id) pts[p2Id].lost++;
      }
    });
    return Object.values(pts)
      .map((row) => ({ ...row, displayName: row.participant?.display_name || 'TBD' }))
      .sort((a, b) => b.points - a.points || b.won - a.won);
  }, [isRoundRobin, participants, matches]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ImageBackground source={require('../../media/Tournament.jpg')} style={styles.backgroundImage} resizeMode="cover">
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
        <ImageBackground source={require('../../media/Tournament.jpg')} style={styles.backgroundImage} resizeMode="cover">
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

  return (
    <View style={styles.container}>
      <ImageBackground source={require('../../media/Tournament.jpg')} style={styles.backgroundImage} resizeMode="cover">
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
              {isRoundRobin ? `Round robin · ${tournament.draw_size} players` : `${tournament.draw_size}-draw`} · {isComplete ? 'Complete' : 'Ongoing'}
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

          {isRoundRobin ? (
            <>
              <Text style={styles.bracketTitle}>League table</Text>
              <View style={styles.leagueTable}>
                <View style={styles.leagueHeaderRow}>
                  <Text style={[styles.leagueCell, styles.leagueCellRank]}>#</Text>
                  <Text style={[styles.leagueCell, styles.leagueCellPlayer]}>Player</Text>
                  <Text style={[styles.leagueCell, styles.leagueCellNum]}>Pld</Text>
                  <Text style={[styles.leagueCell, styles.leagueCellNum]}>W</Text>
                  <Text style={[styles.leagueCell, styles.leagueCellNum]}>L</Text>
                  <Text style={[styles.leagueCell, styles.leagueCellNum]}>Pts</Text>
                </View>
                {leagueTable.map((row, idx) => (
                  <View key={row.participant?.id ?? idx} style={styles.leagueRow}>
                    <Text style={[styles.leagueCell, styles.leagueCellRank]}>{idx + 1}</Text>
                    <Text style={[styles.leagueCell, styles.leagueCellPlayer]} numberOfLines={1}>{row.displayName}</Text>
                    <Text style={[styles.leagueCell, styles.leagueCellNum]}>{row.played}</Text>
                    <Text style={[styles.leagueCell, styles.leagueCellNum]}>{row.won}</Text>
                    <Text style={[styles.leagueCell, styles.leagueCellNum]}>{row.lost}</Text>
                    <Text style={[styles.leagueCell, styles.leagueCellNum]}>{row.points}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.bracketTitle, { marginTop: 20 }]}>Fixtures</Text>
              {roundIndices.map((round) => {
                const roundMatches = matchesByRound[round] || [];
                return (
                  <View key={round} style={styles.roundRobinRound}>
                    <Text style={styles.roundRobinRoundLabel}>Round {round + 1}</Text>
                    {roundMatches.map((match) => {
                      const hasWinner = !!match.winner_participant_id;
                      const p1Won = match.winner_participant_id === match.player1_participant_id;
                      const p2Won = match.winner_participant_id === match.player2_participant_id;
                      const bothApp = match.player1_app_id && match.player2_app_id;
                      return (
                        <TouchableOpacity
                          key={match.id}
                          style={[styles.roundRobinMatchCard, hasWinner && styles.bracketMatchCardDone]}
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
            </>
          ) : (
            <>
              <Text style={styles.bracketTitle}>Bracket</Text>
              <KnockoutBracket
                matchesByRound={matchesByRound}
                roundIndices={roundIndices}
                totalRounds={totalRounds}
                openMatchActions={openMatchActions}
                h2hByMatchId={h2hByMatchId}
              />
            </>
          )}
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
    width: 122,
    minHeight: 52,
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

  leagueTable: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  leagueHeaderRow: { flexDirection: 'row', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' },
  leagueRow: { flexDirection: 'row', paddingVertical: 6 },
  leagueCell: { fontSize: 13, color: '#1a1a1a' },
  leagueCellRank: { width: 24, fontWeight: '700' },
  leagueCellPlayer: { flex: 1, marginLeft: 4 },
  leagueCellNum: { width: 32, textAlign: 'center', fontWeight: '600' },
  roundRobinRound: { marginBottom: 16 },
  roundRobinRoundLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginBottom: 6, textTransform: 'uppercase' },
  roundRobinMatchCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
});

export default function TournamentDetailScreen(props) {
  return (
    <TournamentDetailErrorBoundary>
      <TournamentDetailScreenInner {...props} />
    </TournamentDetailErrorBoundary>
  );
}
