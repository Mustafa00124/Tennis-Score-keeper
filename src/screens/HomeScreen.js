import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ImageBackground,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getAllMatches,
  getAllPlayers,
  createMatchup,
  createPlayer,
  getPlayerStats,
  getAllTournaments,
} from '../db/database';

const HEADER_HEIGHT = 56;

/** From all matches (one per day), build unique matchup pairs (one per player pair). */
function uniqueMatchupsFromMatches(matchList) {
  if (!Array.isArray(matchList)) return [];
  const byPair = {};
  for (const m of matchList) {
    if (!m || m.player1_id == null || m.player2_id == null) continue;
    const id1 = m.player1_id;
    const id2 = m.player2_id;
    const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
    if (!byPair[key]) {
      const p1Id = id1 < id2 ? id1 : id2;
      const p2Id = id1 < id2 ? id2 : id1;
      const p1Name = id1 < id2 ? m.player1_name : m.player2_name;
      const p2Name = id1 < id2 ? m.player2_name : m.player1_name;
      byPair[key] = {
        player1_id: p1Id,
        player2_id: p2Id,
        player1_name: p1Name,
        player2_name: p2Name,
        lastPlayedDate: m.date_played || '',
        matchCount: 0,
      };
    }
    byPair[key].matchCount += 1;
    const d = (m.date_played || '').slice(0, 10);
    if (d && (!byPair[key].lastPlayedDate || d > byPair[key].lastPlayedDate.slice(0, 10))) {
      byPair[key].lastPlayedDate = m.date_played || '';
    }
  }
  return Object.values(byPair).sort((a, b) => (b.lastPlayedDate || '').localeCompare(a.lastPlayedDate || ''));
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [playerStats, setPlayerStats] = useState({});
  const [addMatchupVisible, setAddMatchupVisible] = useState(false);
  const [addPlayerVisible, setAddPlayerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('matches');
  const [player1Id, setPlayer1Id] = useState(null);
  const [player2Id, setPlayer2Id] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState('');

  const load = useCallback(async () => {
    const [matchList, playerList, tournamentList] = await Promise.all([
      getAllMatches(),
      getAllPlayers(),
      getAllTournaments(),
    ]);
    setPlayers(playerList);
    setTournaments(tournamentList);
    const matchups = uniqueMatchupsFromMatches(matchList);
    setMatches(matchups);
    const stats = await Promise.all(
      playerList.map((p) => getPlayerStats(p.id).then((s) => ({ id: p.id, ...s })))
    );
    setPlayerStats(Object.fromEntries(stats.map((s) => [s.id, s])));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAddMatchup = useCallback(() => {
    setPlayer1Id(null);
    setPlayer2Id(null);
    setAddMatchupVisible(true);
  }, []);

  const handleCreateMatchup = useCallback(async () => {
    if (!player1Id || !player2Id) {
      Alert.alert('Select players', 'Choose both players.');
      return;
    }
    if (player1Id === player2Id) {
      Alert.alert('Same player', 'Choose two different players.');
      return;
    }
    try {
      const matchId = await createMatchup(player1Id, player2Id);
      setAddMatchupVisible(false);
      await load();
      navigation.navigate('MatchDetail', { matchId });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not create matchup');
    }
  }, [player1Id, player2Id, load, navigation]);

  const openAddPlayer = useCallback(() => {
    setNewPlayerName('');
    setAddPlayerVisible(true);
  }, []);

  const handleAddPlayer = useCallback(async () => {
    const name = newPlayerName.trim();
    if (!name) return;
    try {
      await createPlayer(name);
      setNewPlayerName('');
      setAddPlayerVisible(false);
      await load();
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A player with this name already exists.');
      } else {
        Alert.alert('Error', e.message || 'Could not add player');
      }
    }
  }, [newPlayerName, load]);

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../media/tennis.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.backgroundOverlay} />
        <View style={[styles.headerSpacer, { paddingTop: insets.top + HEADER_HEIGHT }]}>
        {/* Floating pill tab bar */}
        <View style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabSegment, activeTab === 'matches' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('matches')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'matches' ? styles.tabTextActive : styles.tabTextInactive]}>
              Match up
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabSegment, activeTab === 'players' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('players')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'players' ? styles.tabTextActive : styles.tabTextInactive]}>
              Players
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabSegment, activeTab === 'tournaments' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('tournaments')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'tournaments' ? styles.tabTextActive : styles.tabTextInactive]}>
              Tournaments
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {activeTab === 'matches' ? 'Match ups' : activeTab === 'players' ? 'Players' : 'Tournaments'}
          </Text>
          <TouchableOpacity
            style={styles.plusBtn}
            onPress={
              activeTab === 'matches'
                ? openAddMatchup
                : activeTab === 'players'
                  ? openAddPlayer
                  : () => navigation.navigate('NewTournament')
            }
          >
            <Text style={styles.plusText}>+</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'matches' ? (
            matches.length === 0 ? (
              <Text style={styles.emptyHint}>No match ups. Tap + to add.</Text>
            ) : (
              matches.map((mu) => (
                <MatchUpCard
                  key={`${mu.player1_id}-${mu.player2_id}`}
                  matchup={mu}
                  onPress={() =>
                    navigation.navigate('MatchupStats', {
                      player1Id: mu.player1_id,
                      player2Id: mu.player2_id,
                      player1Name: mu.player1_name,
                      player2Name: mu.player2_name,
                    })
                  }
                  onAddDay={async () => {
                    try {
                      const newMatchId = await createMatchup(mu.player1_id, mu.player2_id);
                      navigation.navigate('MatchDetail', { matchId: newMatchId });
                    } catch (e) {
                      Alert.alert('Error', e.message || 'Could not add day');
                    }
                  }}
                />
              ))
            )
          ) : activeTab === 'players' ? (
            players.length === 0 ? (
              <Text style={styles.emptyHint}>No players. Tap + to add.</Text>
            ) : (
              players.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  stats={playerStats[p.id]}
                  onPress={() => navigation.navigate('PlayerDetail', { playerId: p.id, playerName: p.name })}
                />
              ))
            )
          ) : tournaments.length === 0 ? (
            <Text style={styles.emptyHint}>No tournaments. Tap + to create.</Text>
          ) : (
            tournaments.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                onPress={() => navigation.navigate('TournamentDetail', { tournamentId: t.id, tournamentName: t.name })}
              />
            ))
          )}
        </ScrollView>
      </View>
        </View>
      </ImageBackground>

      {/* Add match up modal */}
      <Modal visible={addMatchupVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New match up</Text>
            {players.length < 2 ? (
              <>
                <Text style={styles.modalHint}>Add at least 2 players first (use + in Players).</Text>
                <TouchableOpacity style={styles.modalBtn} onPress={() => setAddMatchupVisible(false)}>
                  <Text style={styles.modalBtnText}>OK</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalLabel}>Player 1</Text>
                <View style={styles.chipRow}>
                  {players.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, player1Id === p.id && styles.chipSelected]}
                      onPress={() => setPlayer1Id(p.id)}
                    >
                      <Text style={[styles.chipText, player1Id === p.id && styles.chipTextSelected]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.modalLabel}>Player 2</Text>
                <View style={styles.chipRow}>
                  {players.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, player2Id === p.id && styles.chipSelected]}
                      onPress={() => setPlayer2Id(p.id)}
                    >
                      <Text style={[styles.chipText, player2Id === p.id && styles.chipTextSelected]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setAddMatchupVisible(false)}>
                    <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtn} onPress={handleCreateMatchup}>
                    <Text style={styles.modalBtnText}>Create</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setAddMatchupVisible(false)}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add player modal */}
      <Modal visible={addPlayerVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New player</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Player name"
              placeholderTextColor="#999"
              value={newPlayerName}
              onChangeText={setNewPlayerName}
              autoCapitalize="words"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setAddPlayerVisible(false)}>
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={handleAddPlayer}>
                <Text style={styles.modalBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setAddPlayerVisible(false)}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/** Ripple timing: 0.5s between each of 3 ripples, then 2s pause. Cycle 5.2s so all three stay in sync. */
const RIPPLE_DURATION = 4200;
const RIPPLE_CYCLE = 5200;

/** Ripple starts from a point at top-left corner (center at 0,0), with a short soft fade-in so it's not abrupt. */
const RIPPLE_FADE_IN_MS = 220;
const RIPPLE_EXPAND_DURATION = RIPPLE_DURATION - RIPPLE_FADE_IN_MS;

/** Small green ripples from top-left: 3 overlapping ripples with 0.5s stagger, then 2s pause. */
function GreenRippleOverlay() {
  const s1 = useRef(new Animated.Value(0)).current;
  const o1 = useRef(new Animated.Value(0)).current;
  const s2 = useRef(new Animated.Value(0)).current;
  const o2 = useRef(new Animated.Value(0)).current;
  const s3 = useRef(new Animated.Value(0)).current;
  const o3 = useRef(new Animated.Value(0)).current;

  const runRipple = (scale, opacity) =>
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.08, duration: RIPPLE_FADE_IN_MS, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.52, duration: RIPPLE_FADE_IN_MS, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 5.5, duration: RIPPLE_EXPAND_DURATION, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.14, duration: RIPPLE_EXPAND_DURATION, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ]);

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.sequence([runRipple(s1, o1), Animated.delay(RIPPLE_CYCLE - RIPPLE_DURATION)])
    );
    const loop2 = Animated.loop(
      Animated.sequence([Animated.delay(500), runRipple(s2, o2), Animated.delay(RIPPLE_CYCLE - 500 - RIPPLE_DURATION)])
    );
    const loop3 = Animated.loop(
      Animated.sequence([Animated.delay(1000), runRipple(s3, o3), Animated.delay(RIPPLE_CYCLE - 1000 - RIPPLE_DURATION)])
    );
    loop1.start();
    loop2.start();
    loop3.start();
    return () => {
      loop1.stop();
      loop2.stop();
      loop3.stop();
    };
  }, [s1, o1, s2, o2, s3, o3]);

  return (
    <View style={styles.gradientOverlayWrap} pointerEvents="none">
      <Animated.View style={[styles.greenRippleCircle, { opacity: o1, transform: [{ scale: s1 }] }]} />
      <Animated.View style={[styles.greenRippleCircle, { opacity: o2, transform: [{ scale: s2 }] }]} />
      <Animated.View style={[styles.greenRippleCircle, { opacity: o3, transform: [{ scale: s3 }] }]} />
    </View>
  );
}

/** Liquid-style gradient overlay: gradient is larger than the card and drifts so the highlight visibly moves. */
function LiquidGradientOverlay() {
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(driftX, {
            toValue: 36,
            duration: 5000,
            useNativeDriver: true,
          }),
          Animated.timing(driftY, {
            toValue: 24,
            duration: 5000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(driftX, {
            toValue: 0,
            duration: 5000,
            useNativeDriver: true,
          }),
          Animated.timing(driftY, {
            toValue: 0,
            duration: 5000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [driftX, driftY]);
  return (
    <View style={styles.gradientOverlayWrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.liquidGradientLayer,
          {
            transform: [
              { translateX: driftX },
              { translateY: driftY },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255,255,255,0.06)',
            'rgba(255,255,255,0.18)',
            'rgba(255,255,255,0.08)',
            'transparent',
          ]}
          locations={[0, 0.35, 0.5, 0.65, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function MatchUpCard({ matchup, onPress, onAddDay }) {
  const dateLabel = matchup.lastPlayedDate ? matchup.lastPlayedDate.slice(0, 10) : 'No days yet';
  const daysLabel = matchup.matchCount > 0 ? `${matchup.matchCount} day${matchup.matchCount !== 1 ? 's' : ''}` : null;
  return (
    <TouchableOpacity style={styles.matchCard} onPress={onPress} activeOpacity={0.7}>
      <GreenRippleOverlay />
      <LiquidGradientOverlay />
      <View style={styles.matchCardInner}>
          <View style={styles.matchCardHeader}>
            <Text style={styles.matchCardVs} numberOfLines={2}>
              {matchup.player1_name} vs {matchup.player2_name}
            </Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={(e) => {
                e.stopPropagation();
                onAddDay?.();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.matchCardDate}>Last played: {dateLabel}</Text>
          {daysLabel ? (
            <Text style={styles.matchCardRemarks} numberOfLines={1}>{daysLabel}</Text>
          ) : null}
          <Text style={styles.matchCardTap}>Tap for stats · Add for new day</Text>
        </View>
    </TouchableOpacity>
  );
}

function PlayerCard({ player, stats, onPress }) {
  const statLine = stats
    ? `${stats.matchesPlayed} M · ${stats.wins}W ${stats.losses}L${stats.matchesPlayed > 0 ? ` · ${stats.winPercentage.toFixed(0)}%` : ''}`
    : null;
  return (
    <TouchableOpacity style={styles.playerCard} onPress={onPress} activeOpacity={0.7}>
      <GreenRippleOverlay />
      <LiquidGradientOverlay />
      <View style={styles.playerCardInner}>
        <Text style={styles.playerCardName} numberOfLines={1}>{player.name}</Text>
        {statLine ? <Text style={styles.playerCardStats} numberOfLines={1}>{statLine}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function TournamentCard({ tournament, onPress }) {
  const isComplete = tournament.status === 'complete';
  const metaParts = [`${tournament.draw_size}-draw`, isComplete ? 'Complete' : 'Ongoing'];
  if (tournament.date) metaParts.push(tournament.date);
  return (
    <TouchableOpacity style={[styles.tournamentCard, isComplete && styles.tournamentCardComplete]} onPress={onPress} activeOpacity={0.7}>
      <GreenRippleOverlay />
      <LiquidGradientOverlay />
      <View style={styles.tournamentCardInner}>
        <Text style={styles.tournamentCardName} numberOfLines={1}>{tournament.name}</Text>
        <Text style={styles.tournamentCardMeta} numberOfLines={1}>
          {metaParts.join(' · ')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a2e1a' },
  backgroundImage: { flex: 1 },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  headerSpacer: {
    flex: 1,
  },
  tabBarWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  tabSegment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSegmentActive: {
    backgroundColor: '#1a472a',
    shadowColor: '#1a472a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  tabSegmentInactive: {
    backgroundColor: 'transparent',
  },
  tabText: { fontSize: 16, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabTextInactive: { color: 'rgba(255,255,255,0.9)' },
  content: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: { fontSize: 22, color: '#fff', fontWeight: '300', lineHeight: 24 },
  cardScroll: { flex: 1 },
  cardScrollContent: { paddingBottom: 24 },
  emptyHint: { color: 'rgba(255,255,255,0.9)', fontSize: 14, paddingVertical: 12, paddingHorizontal: 4, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  matchCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  gradientOverlayWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 14,
  },
  greenRippleCircle: {
    position: 'absolute',
    left: -60,
    top: -60,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(18, 85, 45, 0.38)',
  },
  liquidGradientLayer: {
    position: 'absolute',
    width: '200%',
    height: '200%',
    left: '-50%',
    top: '-50%',
  },
  matchCardInner: { padding: 14 },
  matchCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  matchCardVs: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  addBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#1a472a' },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  matchCardDate: { fontSize: 12, color: '#666', marginTop: 4 },
  matchCardRemarks: { fontSize: 11, color: '#888', marginTop: 2, fontStyle: 'italic' },
  matchCardTap: { fontSize: 11, color: '#1a472a', marginTop: 4, opacity: 0.9 },
  playerCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  playerCardInner: { padding: 14 },
  playerCardName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  playerCardStats: { fontSize: 12, color: '#666', marginTop: 4 },
  tournamentCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  tournamentCardComplete: { opacity: 0.88 },
  tournamentCardInner: { padding: 14 },
  tournamentCardName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  tournamentCardMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 20 },
  modalHint: { color: '#666', marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 12 },
  nameInput: {
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 20,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: { borderColor: '#1a472a', backgroundColor: '#e8f0e8' },
  chipText: { fontSize: 14, color: '#333' },
  chipTextSelected: { color: '#1a472a', fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: '#1a472a', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#eee',
  },
  modalBtnSecondaryText: { color: '#333', fontWeight: '600' },
  modalClose: { position: 'absolute', top: 16, right: 16, padding: 8 },
  modalCloseText: { fontSize: 20, color: '#666' },
});
