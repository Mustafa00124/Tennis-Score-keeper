import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ImageBackground,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getTournamentWithBracket,
  setTournamentMatchWinner,
  setTournamentMatchRemark,
  linkTournamentMatchToAppMatch,
  createMatchup,
  getHeadToHead,
} from '../db/database';
import { gamesInValidRange, setNeedsTiebreak, isSetValidForSave, isSetComplete } from '../utils/tennisScoring';

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
const BK_UNIT = 132;           // vertical slot height for one first-round match (enough for winner + score/date)
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
          {hasWinner && (match.score || match.match_date) && (
            <Text style={{ fontSize: 9, color: '#666', marginTop: 1 }} numberOfLines={1}>
              {[match.score, match.match_date].filter(Boolean).join(' · ')}
            </Text>
          )}
          {bothApp && h2h && (h2h.setsWon ?? 0) + (h2h.setsLost ?? 0) > 0 && (
            <Text style={{ fontSize: 9, color: '#5a7a5a', marginTop: 1 }} numberOfLines={1}>
              Sets {h2h.setsWon}–{h2h.setsLost}
            </Text>
          )}
          {!hasWinner && (match.player1_name !== 'TBD' || match.player2_name !== 'TBD') && (
            <Text style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>Tap to set winner</Text>
          )}
          {match.remark ? (
            <Text style={{ fontSize: 9, color: '#666', marginTop: 4, fontStyle: 'italic' }} numberOfLines={2}>{match.remark}</Text>
          ) : null}
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
  const [remarkModalMatch, setRemarkModalMatch] = useState(null);
  const [remarkModalValue, setRemarkModalValue] = useState('');
  const [matchResultModalMatch, setMatchResultModalMatch] = useState(null);
  const [resultWinnerId, setResultWinnerId] = useState(null);
  const [resultSets, setResultSets] = useState([{ gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' }]);
  const [resultDate, setResultDate] = useState('');
  const [savingResult, setSavingResult] = useState(false);

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
              const h2h = await getHeadToHead(a, b);
              byMatch[m.id] = h2h;
            } catch (e) {
              if (__DEV__) console.warn('TournamentDetail: H2H load failed for match', m.id, e?.message);
            }
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
    async (match, participantId, details = {}) => {
      try {
        await setTournamentMatchWinner(match.id, participantId, details);
        await load();
      } catch (e) {
        Alert.alert('Error', e.message || 'Could not set winner');
      }
    },
    [load]
  );

  const getTodayDateString = useCallback(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }, []);

  const parseScoreToSets = useCallback((scoreStr) => {
    if (!scoreStr || typeof scoreStr !== 'string') return [{ gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' }];
    const parts = scoreStr.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return [{ gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' }];
    return parts.map((part) => {
      const tiebreakMatch = part.match(/^(\d+)-(\d+)\s*\((\d+)-(\d+)\)\s*$/);
      if (tiebreakMatch) {
        return { gamesPlayer1: tiebreakMatch[1], gamesPlayer2: tiebreakMatch[2], tiebreakPlayer1: tiebreakMatch[3], tiebreakPlayer2: tiebreakMatch[4] };
      }
      const gamesMatch = part.match(/^(\d+)-(\d+)\s*$/);
      if (gamesMatch) {
        return { gamesPlayer1: gamesMatch[1], gamesPlayer2: gamesMatch[2], tiebreakPlayer1: '', tiebreakPlayer2: '' };
      }
      return { gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' };
    });
  }, []);

  const openResultModal = useCallback((match) => {
    setMatchResultModalMatch(match);
    setResultWinnerId(null);
    setResultSets(parseScoreToSets(match.score));
    setResultDate(match.match_date ?? getTodayDateString());
  }, [getTodayDateString, parseScoreToSets]);

  const closeResultModal = useCallback(() => {
    setMatchResultModalMatch(null);
    setResultWinnerId(null);
    setResultSets([{ gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' }]);
    setResultDate('');
  }, []);

  const addResultSet = useCallback(() => {
    setResultSets((s) => [...s, { gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' }]);
  }, []);

  const removeResultSet = useCallback((index) => {
    setResultSets((s) => s.filter((_, i) => i !== index));
  }, []);

  const updateResultSet = useCallback((index, field, value) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    setResultSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'gamesPlayer1' || field === 'gamesPlayer2') {
        const g = parseInt(value, 10);
        if (Number.isInteger(g) && g > 7) next[index][field] = '7';
      }
      return next;
    });
  }, []);

  const getValidResultSets = useCallback(() => {
    return resultSets
      .map((s) => {
        const a = s.gamesPlayer1 === '' ? null : parseInt(s.gamesPlayer1, 10);
        const b = s.gamesPlayer2 === '' ? null : parseInt(s.gamesPlayer2, 10);
        if (a == null || b == null || !Number.isInteger(a) || !Number.isInteger(b)) return null;
        if (!gamesInValidRange(a, b)) return null;
        const tb1 = s.tiebreakPlayer1 === '' ? undefined : s.tiebreakPlayer1;
        const tb2 = s.tiebreakPlayer2 === '' ? undefined : s.tiebreakPlayer2;
        return { gamesPlayer1: a, gamesPlayer2: b, tiebreakPlayer1: tb1, tiebreakPlayer2: tb2 };
      })
      .filter((s) => s != null && (s.gamesPlayer1 > 0 || s.gamesPlayer2 > 0));
  }, [resultSets]);

  const formatSetsToScoreString = useCallback((validSets) => {
    return validSets
      .map((s) => {
        if (s.tiebreakPlayer1 != null && s.tiebreakPlayer2 != null && String(s.tiebreakPlayer1) !== '' && String(s.tiebreakPlayer2) !== '') {
          return `${s.gamesPlayer1}-${s.gamesPlayer2}(${s.tiebreakPlayer1}-${s.tiebreakPlayer2})`;
        }
        return `${s.gamesPlayer1}-${s.gamesPlayer2}`;
      })
      .join(' - ');
  }, []);

  const saveMatchResult = useCallback(async () => {
    const match = matchResultModalMatch;
    if (!match || !resultWinnerId) {
      Alert.alert('Select winner', 'Choose the winning player.');
      return;
    }
    const validSets = getValidResultSets();
    if (validSets.length === 0) {
      Alert.alert('Add at least one set', 'Games must be 0–7. For 7–6 or 6–7 add tiebreak score.');
      return;
    }
    for (let i = 0; i < validSets.length; i++) {
      const s = validSets[i];
      const tb1 = s.tiebreakPlayer1 != null && s.tiebreakPlayer1 !== '' ? String(s.tiebreakPlayer1) : undefined;
      const tb2 = s.tiebreakPlayer2 != null && s.tiebreakPlayer2 !== '' ? String(s.tiebreakPlayer2) : undefined;
      if (!isSetValidForSave(s.gamesPlayer1, s.gamesPlayer2, tb1, tb2)) {
        Alert.alert(
          'Invalid set score',
          setNeedsTiebreak(s.gamesPlayer1, s.gamesPlayer2)
            ? 'Set 7–6 or 6–7 requires a tiebreak score (e.g. 7–4).'
            : 'Use valid tennis set scores: 6–0 to 7–5, or 7–6/6–7 with tiebreak.'
        );
        return;
      }
    }
    const completedSets = validSets.filter((s) => {
      const tb1 = s.tiebreakPlayer1 != null && s.tiebreakPlayer1 !== '' ? String(s.tiebreakPlayer1) : undefined;
      const tb2 = s.tiebreakPlayer2 != null && s.tiebreakPlayer2 !== '' ? String(s.tiebreakPlayer2) : undefined;
      return isSetComplete(s.gamesPlayer1, s.gamesPlayer2, tb1, tb2);
    });
    setSavingResult(true);
    try {
      const scoreString = formatSetsToScoreString(validSets);
      await setTournamentMatchWinner(match.id, resultWinnerId, {
        score: scoreString,
        match_date: resultDate.trim() || undefined,
      });
      await load();
      closeResultModal();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save result');
    } finally {
      setSavingResult(false);
    }
  }, [matchResultModalMatch, resultWinnerId, resultSets, resultDate, getValidResultSets, formatSetsToScoreString, load, closeResultModal]);

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

  const openRemarkModal = useCallback((match) => {
    setRemarkModalMatch(match);
    setRemarkModalValue(match.remark || '');
  }, []);

  const saveRemark = useCallback(async () => {
    if (!remarkModalMatch) return;
    try {
      await setTournamentMatchRemark(remarkModalMatch.id, remarkModalValue.trim() || null);
      setRemarkModalMatch(null);
      setRemarkModalValue('');
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save remark');
    }
  }, [remarkModalMatch, remarkModalValue, load]);

  const openMatchActions = useCallback(
    (match) => {
      const hasWinner = !!match.winner_participant_id;
      const bothAppPlayers = match.player1_app_id && match.player2_app_id;
      if (!hasWinner) {
        openResultModal(match);
      } else {
        const doneButtons = [
          { text: match.remark ? 'Edit remark' : 'Add remark', onPress: () => openRemarkModal(match) },
        ];
        if (bothAppPlayers && !match.linked_match_id) doneButtons.push({ text: 'Add to app matches', onPress: () => handleAddToMatches(match) });
        doneButtons.push({ text: 'Cancel', style: 'cancel' });
        Alert.alert(match.player1_name + ' vs ' + match.player2_name, 'Add or edit remark for this match', doneButtons);
      }
    },
    [openResultModal, handleAddToMatches, openRemarkModal]
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
      const hasResult = !!m.winner_participant_id;
      if (p1Id && pts[p1Id]) {
        if (hasResult) pts[p1Id].played++;
        if (m.winner_participant_id === p1Id) {
          pts[p1Id].won++;
          pts[p1Id].points += 3;
        } else if (m.winner_participant_id) pts[p1Id].lost++;
      }
      if (p2Id && pts[p2Id]) {
        if (hasResult) pts[p2Id].played++;
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
    } catch (e) {
      if (__DEV__) console.warn('TournamentDetail: tournament images parse failed', e?.message);
    }
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
                          {hasWinner && (match.score || match.match_date) && (
                            <Text style={styles.bracketScoreDate} numberOfLines={1}>
                              {[match.score, match.match_date].filter(Boolean).join(' · ')}
                            </Text>
                          )}
                          {bothApp &&
                            (h2hByMatchId[match.id]?.setsWon ?? 0) + (h2hByMatchId[match.id]?.setsLost ?? 0) >
                              0 && (
                              <Text style={styles.bracketH2h} numberOfLines={1}>
                                Sets: {h2hByMatchId[match.id].setsWon}–{h2hByMatchId[match.id].setsLost}
                              </Text>
                            )}
                          {!hasWinner && <Text style={styles.bracketTapHint}>Tap to set winner</Text>}
                          {match.remark ? (
                            <Text style={styles.bracketRemark} numberOfLines={2}>{match.remark}</Text>
                          ) : null}
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

        <Modal visible={!!remarkModalMatch} animationType="slide" transparent>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.remarkModalOverlay}
          >
            <View style={styles.remarkModalCard}>
              <Text style={styles.remarkModalTitle}>
                {remarkModalMatch ? `${remarkModalMatch.player1_name} vs ${remarkModalMatch.player2_name}` : ''}
              </Text>
              <Text style={styles.remarkModalLabel}>Remark (optional)</Text>
              <TextInput
                style={styles.remarkModalInput}
                placeholder="e.g. Rain delay, court 2"
                placeholderTextColor="#999"
                value={remarkModalValue}
                onChangeText={setRemarkModalValue}
                multiline
                numberOfLines={3}
              />
              <View style={styles.remarkModalButtons}>
                <TouchableOpacity style={styles.remarkModalBtnSecondary} onPress={() => { setRemarkModalMatch(null); setRemarkModalValue(''); }}>
                  <Text style={styles.remarkModalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.remarkModalBtn} onPress={saveRemark}>
                  <Text style={styles.remarkModalBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal visible={!!matchResultModalMatch} animationType="slide" transparent>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.modalCard}>
              {matchResultModalMatch && (
                <>
                  <Text style={styles.modalTitle}>Set match result</Text>
                  <Text style={styles.modalSubtitle}>
                    {matchResultModalMatch.player1_name || 'TBD'} vs {matchResultModalMatch.player2_name || 'TBD'}
                  </Text>

                  <Text style={styles.inputLabel}>Winner (required)</Text>
                  <View style={styles.winnerRow}>
                    <TouchableOpacity
                      style={[
                        styles.winnerBtn,
                        resultWinnerId === matchResultModalMatch.player1_participant_id && styles.winnerBtnActive,
                      ]}
                      onPress={() => setResultWinnerId(matchResultModalMatch.player1_participant_id)}
                    >
                      <Text
                        style={[
                          styles.winnerBtnText,
                          resultWinnerId === matchResultModalMatch.player1_participant_id && styles.winnerBtnTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {matchResultModalMatch.player1_name || 'TBD'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.winnerBtn,
                        resultWinnerId === matchResultModalMatch.player2_participant_id && styles.winnerBtnActive,
                      ]}
                      onPress={() => setResultWinnerId(matchResultModalMatch.player2_participant_id)}
                    >
                      <Text
                        style={[
                          styles.winnerBtnText,
                          resultWinnerId === matchResultModalMatch.player2_participant_id && styles.winnerBtnTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {matchResultModalMatch.player2_name || 'TBD'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.resultSetHeader}>
                    <Text style={styles.inputLabel}>Set scores (games 0–7)</Text>
                    <TouchableOpacity onPress={addResultSet} style={styles.addSetLink}>
                      <Text style={styles.addSetLinkText}>+ Add set</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.setHint}>7–6 or 6–7 requires tiebreak. Incomplete sets are saved but not counted in W/L.</Text>
                  {resultSets.map((set, i) => {
                    const g1 = set.gamesPlayer1 === '' ? null : parseInt(set.gamesPlayer1, 10);
                    const g2 = set.gamesPlayer2 === '' ? null : parseInt(set.gamesPlayer2, 10);
                    const needsTiebreak = Number.isInteger(g1) && Number.isInteger(g2) && setNeedsTiebreak(g1, g2);
                    const p1Name = matchResultModalMatch.player1_name || 'P1';
                    const p2Name = matchResultModalMatch.player2_name || 'P2';
                    return (
                      <View key={i} style={styles.resultSetBlock}>
                        <View style={styles.resultSetRow}>
                          <Text style={styles.resultSetNum}>Set {i + 1}</Text>
                          <TextInput
                            style={styles.resultSetInput}
                            keyboardType="number-pad"
                            maxLength={2}
                            value={set.gamesPlayer1}
                            onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateResultSet(i, 'gamesPlayer1', t)}
                            placeholder={p1Name.slice(0, 6)}
                            placeholderTextColor="#999"
                          />
                          <Text style={styles.resultSetDash}>–</Text>
                          <TextInput
                            style={styles.resultSetInput}
                            keyboardType="number-pad"
                            maxLength={2}
                            value={set.gamesPlayer2}
                            onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateResultSet(i, 'gamesPlayer2', t)}
                            placeholder={p2Name.slice(0, 6)}
                            placeholderTextColor="#999"
                          />
                          {resultSets.length > 1 && (
                            <TouchableOpacity onPress={() => removeResultSet(i)} style={styles.removeSetBtn}>
                              <Text style={styles.removeSetBtnText}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        {needsTiebreak && (
                          <View style={styles.tiebreakRow}>
                            <Text style={styles.tiebreakLabel}>Tiebreak</Text>
                            <TextInput
                              style={styles.tiebreakInput}
                              keyboardType="number-pad"
                              maxLength={2}
                              value={set.tiebreakPlayer1}
                              onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateResultSet(i, 'tiebreakPlayer1', t)}
                              placeholder="7"
                              placeholderTextColor="#999"
                            />
                            <Text style={styles.resultSetDash}>–</Text>
                            <TextInput
                              style={styles.tiebreakInput}
                              keyboardType="number-pad"
                              maxLength={2}
                              value={set.tiebreakPlayer2}
                              onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateResultSet(i, 'tiebreakPlayer2', t)}
                              placeholder="4"
                              placeholderTextColor="#999"
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}

                  <Text style={styles.inputLabel}>Date</Text>
                  <TextInput
                    style={styles.input}
                    value={resultDate}
                    onChangeText={setResultDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#999"
                  />

                  <View style={styles.modalButtons}>
                    <TouchableOpacity style={styles.modalBtnSecondary} onPress={closeResultModal}>
                      <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, savingResult && styles.modalBtnDisabled]}
                      onPress={saveMatchResult}
                      disabled={savingResult}
                    >
                      <Text style={styles.modalBtnText}>{savingResult ? 'Saving…' : 'Save'}</Text>
                    </TouchableOpacity>
                  </View>
                  {matchResultModalMatch.player1_app_id && matchResultModalMatch.player2_app_id && (
                    <TouchableOpacity
                      style={styles.addToMatchesLink}
                      onPress={() => {
                        closeResultModal();
                        handleAddToMatches(matchResultModalMatch);
                      }}
                    >
                      <Text style={styles.addToMatchesLinkText}>Add to app matches (record full score there)</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
  bracketMatchCardDone: { borderLeftWidth: 3, borderLeftColor: '#1a472a' },
  bracketPlayer: { fontSize: 12, color: '#1a1a1a' },
  bracketWinner: { fontWeight: '700', color: '#1a472a' },
  bracketVs: { fontSize: 10, color: '#888', marginVertical: 2 },
  bracketWinnerLabel: { fontSize: 10, color: '#1a472a', fontWeight: '600', marginTop: 2 },
  bracketScoreDate: { fontSize: 9, color: '#666', marginTop: 1 },
  bracketH2h: { fontSize: 9, color: '#5a6a5a', marginTop: 1 },
  bracketTapHint: { fontSize: 9, color: '#888', marginTop: 2 },
  bracketRemark: { fontSize: 9, color: '#666', marginTop: 4, fontStyle: 'italic' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: '#555', marginBottom: 16 },
  inputLabel: { fontSize: 13, color: '#555', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1a1a1a',
  },
  resultSetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  addSetLink: { padding: 8 },
  addSetLinkText: { color: '#1a472a', fontWeight: '600', fontSize: 14 },
  setHint: { fontSize: 12, color: '#666', marginBottom: 10 },
  resultSetBlock: { marginBottom: 12 },
  resultSetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  resultSetNum: { width: 44, fontSize: 14, color: '#666' },
  resultSetInput: {
    width: 56,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 18,
    textAlign: 'center',
    color: '#1a1a1a',
  },
  resultSetDash: { fontSize: 18, color: '#666' },
  tiebreakRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 52, gap: 8, marginBottom: 4 },
  tiebreakLabel: { width: 56, fontSize: 12, color: '#888' },
  tiebreakInput: {
    width: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    textAlign: 'center',
    color: '#1a1a1a',
  },
  removeSetBtn: { padding: 8 },
  removeSetBtnText: { color: '#c53030', fontSize: 16 },
  winnerRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  winnerBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  winnerBtnActive: { borderColor: '#1a472a', backgroundColor: 'rgba(26,71,42,0.1)' },
  winnerBtnText: { fontSize: 14, color: '#555', fontWeight: '500' },
  winnerBtnTextActive: { color: '#1a472a', fontWeight: '700' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalBtn: { flex: 1, backgroundColor: '#1a472a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalBtnSecondary: { flex: 1, backgroundColor: '#efefef', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnSecondaryText: { color: '#444', fontWeight: '600', fontSize: 16 },
  modalBtnDisabled: { opacity: 0.6 },
  addToMatchesLink: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  addToMatchesLinkText: { fontSize: 13, color: '#1a472a', fontWeight: '600' },

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
  remarkModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  remarkModalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  remarkModalTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  remarkModalLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  remarkModalInput: {
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  remarkModalButtons: { flexDirection: 'row', gap: 12 },
  remarkModalBtn: { flex: 1, backgroundColor: '#1a472a', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  remarkModalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  remarkModalBtnSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#eee' },
  remarkModalBtnSecondaryText: { color: '#333', fontWeight: '600' },
});

export default function TournamentDetailScreen(props) {
  return (
    <TournamentDetailErrorBoundary>
      <TournamentDetailScreenInner {...props} />
    </TournamentDetailErrorBoundary>
  );
}
