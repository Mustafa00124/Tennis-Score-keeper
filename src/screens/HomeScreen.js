import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  Image,
  Dimensions,
  PanResponder,
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
  getHeadToHead,
} from '../db/database';
import NewTournamentScreen from './NewTournamentScreen';

const HEADER_HEIGHT = 56;
const SCREEN_W = Dimensions.get('window').width;
const CARD_H = 142;
const STACK_OFFSET = 14;
const SWIPE_THRESH = 60;

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
  const [newTournamentVisible, setNewTournamentVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('matches');
  const [matchLayout, setMatchLayout] = useState('stack'); // 'stack' | 'list'
  const stackContainerAnim = useRef(new Animated.Value(1)).current;
  const listCardAnims = useMemo(() => matches.map(() => new Animated.Value(0)), [matches.length]);

  useEffect(() => {
    if (matchLayout === 'list') listCardAnims.forEach((a) => a.setValue(1));
  }, [listCardAnims, matchLayout]);

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
    const matchupsWithH2h = await Promise.all(
      matchups.map(async (mu) => {
        const h2h = await getHeadToHead(mu.player1_id, mu.player2_id);
        return { ...mu, h2h };
      })
    );
    setMatches(matchupsWithH2h);
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

  const toggleMatchLayout = useCallback(() => {
    const toList = matchLayout === 'stack';
    setMatchLayout(toList ? 'list' : 'stack');

    if (toList) {
      Animated.spring(stackContainerAnim, {
        toValue: 0, tension: 90, friction: 10, useNativeDriver: true,
      }).start(() => {
        Animated.stagger(50, listCardAnims.map((a) =>
          Animated.spring(a, { toValue: 1, tension: 62, friction: 11, useNativeDriver: true })
        )).start();
      });
    } else {
      Animated.stagger(28, [...listCardAnims].reverse().map((a) =>
        Animated.timing(a, { toValue: 0, duration: 105, useNativeDriver: true })
      )).start(() => {
        listCardAnims.forEach((a) => a.setValue(0));
        Animated.spring(stackContainerAnim, {
          toValue: 1, tension: 70, friction: 11, useNativeDriver: true,
        }).start();
      });
    }
  }, [matchLayout, stackContainerAnim, listCardAnims]);

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
        source={require('../../media/Home.jpg')}
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
          {activeTab === 'matches' && matches.length > 0 && (
            <TouchableOpacity onPress={toggleMatchLayout} style={styles.layoutToggleBtn} hitSlop={8}>
              <Text style={styles.layoutToggleIcon}>{matchLayout === 'stack' ? '☰' : '⊟'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.plusBtn}
            onPress={
              activeTab === 'matches'
                ? openAddMatchup
                : activeTab === 'players'
                  ? openAddPlayer
                  : () => setNewTournamentVisible(true)
            }
          >
            <Text style={styles.plusText}>+</Text>
          </TouchableOpacity>
        </View>
          {activeTab === 'matches' ? (
            matches.length === 0 ? (
              <Text style={styles.emptyHint}>No match ups. Tap + to add.</Text>
            ) : (
              <View style={{ flex: 1, position: 'relative' }}>
                <Animated.View
                  pointerEvents={matchLayout === 'stack' ? 'auto' : 'none'}
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      opacity: stackContainerAnim,
                      transform: [{ scale: stackContainerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1], extrapolate: 'clamp' }) }],
                      zIndex: matchLayout === 'stack' ? 2 : 1,
                    },
                  ]}
                >
                  <MatchUpCardStack
                    items={matches}
                    players={players}
                    onPressItem={(mu) =>
                      navigation.navigate('MatchupStats', {
                        player1Id: mu.player1_id,
                        player2Id: mu.player2_id,
                        player1Name: mu.player1_name,
                        player2Name: mu.player2_name,
                      })
                    }
                    onAddDay={async (mu) => {
                      try {
                        const newMatchId = await createMatchup(mu.player1_id, mu.player2_id);
                        navigation.navigate('MatchDetail', { matchId: newMatchId });
                      } catch (e) {
                        Alert.alert('Error', e.message || 'Could not add day');
                      }
                    }}
                  />
                </Animated.View>
                <Animated.View
                  pointerEvents={matchLayout === 'list' ? 'auto' : 'none'}
                  style={[StyleSheet.absoluteFill, { zIndex: matchLayout === 'list' ? 2 : 1 }]}
                >
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                    {matches.map((mu, k) => (
                      <Animated.View
                        key={`${mu.player1_id}-${mu.player2_id}`}
                        style={{
                          opacity: listCardAnims[k],
                          marginBottom: 10,
                          transform: [{ translateY: listCardAnims[k].interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }],
                        }}
                      >
                        <MatchUpCard
                          matchup={mu}
                          players={players}
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
                      </Animated.View>
                    ))}
                  </ScrollView>
                </Animated.View>
              </View>
            )
          ) : (
            <ScrollView
              style={styles.cardScroll}
              contentContainerStyle={styles.cardScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === 'players' ? (
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
          )}
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

      {/* New tournament modal (full wizard) */}
      <Modal visible={newTournamentVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.tournamentSheetCard}>
            <NewTournamentScreen
              navigation={navigation}
              onDismiss={() => setNewTournamentVisible(false)}
              onSuccess={(tournamentId, tournamentName) => {
                setNewTournamentVisible(false);
                load();
                navigation.navigate('TournamentDetail', { tournamentId, tournamentName });
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/**
 * Pulses a green gradient across the card: fades in (transparent → greener) and back, slowly.
 * Gradient runs across the div for a subtle directional tint.
 */
const PULSE_DURATION = 5000;

function CardColorPulse() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: PULSE_DURATION, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: PULSE_DURATION, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity, borderRadius: 14, overflow: 'hidden' }]}
    >
      <LinearGradient
        colors={[
          'rgba(160,220,180,0.5)',
          'rgba(120,195,150,0.55)',
          'rgba(100,180,140,0.45)',
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function MatchUpCardStack({ items, players, onPressItem, onAddDay }) {
  const n = items.length;
  const nRef = useRef(n);
  nRef.current = n;

  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = n > 0 ? activeIdx % n : 0;

  const swipingRef = useRef(false);
  const swipeX = useRef(new Animated.Value(0)).current;
  const visibleCount = Math.min(3, n);

  const doSwipeRef = useRef(null);
  doSwipeRef.current = (dir) => {
    if (swipingRef.current || nRef.current < 2) return;
    swipingRef.current = true;
    Animated.timing(swipeX, {
      toValue: dir > 0 ? -(SCREEN_W * 1.3) : SCREEN_W * 1.3,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      swipeX.setValue(0);
      setActiveIdx((i) => (i + dir + nRef.current) % nRef.current);
      swipingRef.current = false;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        !swipingRef.current &&
        Math.abs(g.dx) > 10 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_, g) => {
        if (!swipingRef.current) swipeX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (swipingRef.current) return;
        const currentN = nRef.current;
        if (currentN < 2) { swipeX.setValue(0); return; }
        const dir = g.dx < -SWIPE_THRESH ? 1 : g.dx > SWIPE_THRESH ? -1 : 0;
        if (dir === 0) {
          Animated.spring(swipeX, { toValue: 0, friction: 7, useNativeDriver: true }).start();
          return;
        }
        doSwipeRef.current?.(dir);
      },
    })
  ).current;

  const activeRotate = swipeX.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ['-5deg', '0deg', '5deg'],
    extrapolate: 'clamp',
  });
  const nextScale = swipeX.interpolate({
    inputRange: [-SCREEN_W * 0.6, 0, SCREEN_W * 0.6],
    outputRange: [1, 0.95, 1],
    extrapolate: 'clamp',
  });
  const nextTransY = swipeX.interpolate({
    inputRange: [-SCREEN_W * 0.6, 0, SCREEN_W * 0.6],
    outputRange: [0, STACK_OFFSET, 0],
    extrapolate: 'clamp',
  });
  const thirdScale = swipeX.interpolate({
    inputRange: [-SCREEN_W * 0.6, 0, SCREEN_W * 0.6],
    outputRange: [0.95, 0.90, 0.95],
    extrapolate: 'clamp',
  });
  const thirdTransY = swipeX.interpolate({
    inputRange: [-SCREEN_W * 0.6, 0, SCREEN_W * 0.6],
    outputRange: [STACK_OFFSET, STACK_OFFSET * 2, STACK_OFFSET],
    extrapolate: 'clamp',
  });

  if (n === 0) return null;

  const containerH = CARD_H + STACK_OFFSET * (visibleCount - 1);

  return (
    <View style={styles.stackOuter}>
      <View style={{ height: containerH, position: 'relative' }}>
        {Array.from({ length: visibleCount }, (_, stackPos) => {
          const depth = visibleCount - 1 - stackPos;
          const cardIdx = (safeIdx + depth) % n;
          const item = items[cardIdx];

          let posStyle, animStyle;
          if (depth === 0) {
            posStyle = { position: 'absolute', left: 0, right: 0, top: 0 };
            animStyle = {
              transform: [{ translateX: swipeX }, { rotate: activeRotate }],
              zIndex: 10,
            };
          } else if (depth === 1) {
            posStyle = { position: 'absolute', left: 0, right: 0, top: 0 };
            animStyle = {
              transform: [{ scale: nextScale }, { translateY: nextTransY }],
              opacity: 0.88,
              zIndex: 9,
            };
          } else {
            posStyle = { position: 'absolute', left: 0, right: 0, top: 0 };
            animStyle = {
              transform: [{ scale: thirdScale }, { translateY: thirdTransY }],
              opacity: 0.7,
              zIndex: 8,
            };
          }

          return (
            <Animated.View
              key={`sd${depth}`}
              style={[posStyle, animStyle]}
              {...(depth === 0 ? panResponder.panHandlers : {})}
            >
              <MatchUpCard
                matchup={item}
                players={players}
                onPress={depth === 0 ? () => onPressItem(item) : undefined}
                onAddDay={depth === 0 ? () => onAddDay(item) : undefined}
                cardStyle={{ height: CARD_H }}
              />
            </Animated.View>
          );
        })}
      </View>

      {n > 1 && (
        <View style={styles.stackNavRow}>
          <TouchableOpacity
            onPress={() => doSwipeRef.current?.(-1)}
            style={styles.navBtn}
            hitSlop={10}
            activeOpacity={0.7}
          >
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>

          <View style={styles.dotRow}>
            {n <= 10 ? (
              items.map((_, i) => (
                <View key={i} style={[styles.dot, i === safeIdx && styles.dotActive]} />
              ))
            ) : (
              <Text style={styles.dotCount}>{safeIdx + 1} / {n}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => doSwipeRef.current?.(1)}
            style={styles.navBtn}
            hitSlop={10}
            activeOpacity={0.7}
          >
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function MatchUpCard({ matchup, players, onPress, onAddDay, cardStyle }) {
  const dateLabel = matchup.lastPlayedDate ? matchup.lastPlayedDate.slice(0, 10) : 'No days yet';
  const h2h = matchup.h2h;
  const player1Wins = h2h ? h2h.wins : 0;
  const player2Wins = h2h ? h2h.losses : 0;
  const h2hLabel = (player1Wins + player2Wins) > 0 ? `${player1Wins}-${player2Wins}` : '—';
  const playersById = (players || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
  const p1 = playersById[matchup.player1_id];
  const p2 = playersById[matchup.player2_id];
  const uri1 = p1?.profile_image || null;
  const uri2 = p2?.profile_image || null;
  const name1 = matchup.player1_name || '';
  const name2 = matchup.player2_name || '';

  return (
    <TouchableOpacity style={[styles.matchCard, cardStyle]} onPress={onPress} activeOpacity={0.7}>
      <CardColorPulse />
      <View style={styles.matchCardInner}>
        <View style={styles.matchCardContentRow}>
          <View style={styles.matchCardTextBlock}>
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
            <Text style={styles.matchCardH2h}>H2H: {h2hLabel}</Text>
            <Text style={styles.matchCardTap}>Tap for stats · Add for new day</Text>
          </View>
          <View style={styles.matchCardCollageWrap}>
            <MatchupAvatarCollage uri1={uri1} uri2={uri2} name1={name1} name2={name2} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function MatchupAvatarCollage({ uri1, uri2, name1, name2 }) {
  const size = 28;
  const overlap = 10;
  const initials = (name) =>
    (name || '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '?';
  return (
    <View style={[styles.collageContainer, { width: size * 2 - overlap, height: size }]}>
      <View style={[styles.collageAvatar, { width: size, height: size, borderRadius: size / 2, left: 0, zIndex: 2 }]}>
        {uri1 ? (
          <Image source={{ uri: uri1 }} style={styles.collageImage} />
        ) : (
          <View style={styles.collageFallback}>
            <Text style={styles.collageInitial} numberOfLines={1}>{initials(name1)}</Text>
          </View>
        )}
      </View>
      <View style={[styles.collageAvatar, { width: size, height: size, borderRadius: size / 2, left: size - overlap, zIndex: 1 }]}>
        {uri2 ? (
          <Image source={{ uri: uri2 }} style={styles.collageImage} />
        ) : (
          <View style={styles.collageFallback}>
            <Text style={styles.collageInitial} numberOfLines={1}>{initials(name2)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PlayerCard({ player, stats, onPress }) {
  const statLine = stats
    ? `${stats.matchesPlayed} M · ${stats.wins}W ${stats.losses}L${stats.matchesPlayed > 0 ? ` · ${stats.winPercentage.toFixed(0)}%` : ''}`
    : null;
  return (
    <TouchableOpacity style={styles.playerCard} onPress={onPress} activeOpacity={0.7}>
      <CardColorPulse />
      <View style={styles.playerCardInner}>
        <Text style={styles.playerCardName} numberOfLines={1}>{player.name}</Text>
        {statLine ? <Text style={styles.playerCardStats} numberOfLines={1}>{statLine}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function TournamentCard({ tournament, onPress }) {
  const isComplete = tournament.status === 'complete';
  const formatLabel = tournament.format === 'round_robin' ? `Round robin · ${tournament.draw_size}` : `${tournament.draw_size}-draw`;
  const metaParts = [formatLabel, isComplete ? 'Complete' : 'Ongoing'];
  if (tournament.date) metaParts.push(tournament.date);
  return (
    <TouchableOpacity style={[styles.tournamentCard, isComplete && styles.tournamentCardComplete]} onPress={onPress} activeOpacity={0.7}>
      <CardColorPulse />
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
  layoutToggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    marginRight: 6,
  },
  layoutToggleIcon: { fontSize: 17, color: '#fff' },
  stackNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  navBtnText: { fontSize: 22, color: '#fff', lineHeight: 26, fontWeight: '300' },
  stackOuter: { flex: 1, paddingBottom: 8 },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    gap: 6,
    flexWrap: 'wrap',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: { backgroundColor: '#fff', width: 22, borderRadius: 4 },
  dotCount: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
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
  matchCardInner: { padding: 14 },
  matchCardContentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchCardTextBlock: { flex: 1, minWidth: 0 },
  matchCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  matchCardVs: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  addBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#1a472a' },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  matchCardDate: { fontSize: 12, color: '#666', marginTop: 4 },
  matchCardH2h: { fontSize: 12, color: '#1a472a', marginTop: 2, fontWeight: '600' },
  matchCardTap: { fontSize: 11, color: '#1a472a', marginTop: 4, opacity: 0.9 },
  matchCardCollageWrap: { justifyContent: 'center', alignItems: 'center' },
  collageContainer: { position: 'relative' },
  collageAvatar: {
    position: 'absolute',
    top: 0,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
  },
  collageImage: { width: '100%', height: '100%' },
  collageFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#e2ebdf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collageInitial: { fontSize: 10, fontWeight: '700', color: '#1a472a' },
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
  tournamentSheetCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: 320,
    overflow: 'hidden',
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
  tournamentFormatRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  formatChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  formatChipSelected: { borderColor: '#1a472a', backgroundColor: '#e8f0e8' },
  formatChipText: { fontSize: 14, fontWeight: '600', color: '#555' },
  formatChipTextSelected: { color: '#1a472a' },
});
