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
import * as ImagePicker from 'expo-image-picker';
import {
  getAllMatches,
  getAllPlayers,
  createMatchup,
  createPlayer,
  getPlayerStats,
  getAllTours,
  createTour,
  addTourParticipant,
  addScheduledTourEvent,
  TOUR_EVENT_TYPES,
  getHeadToHead,
  deletePlayer,
  deleteTour,
  deleteAllMatchesForMatchup,
} from '../db/database';
import { toDateStr, parseDateStr } from '../utils/tourCalendar';
import { knockoutDrawSizesAllowed, clampDrawSizeToParticipants } from '../utils/tourDrawSizes';

const HEADER_HEIGHT = 56;
const SCREEN_W = Dimensions.get('window').width;

/** On web, Alert.alert() does not call onPress for buttons; use window.confirm so delete actually runs. */
function confirmDelete(title, message, onConfirm) {
  if (Platform.OS === 'web') {
    const ok = window.confirm([title, message].filter(Boolean).join('\n\n'));
    if (ok) {
      Promise.resolve(onConfirm()).catch((e) => {
        Alert.alert('Error', e?.message || 'Could not delete');
      });
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

const CARD_H = 142;           // list card height
const STACK_CARD_H = 200;    // stack card height (squarish)
const STACK_OFFSET = 14;
const SWIPE_THRESH = 60;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

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
  const [tours, setTours] = useState([]);
  const [playerStats, setPlayerStats] = useState({});
  const [addMatchupVisible, setAddMatchupVisible] = useState(false);
  const [addPlayerVisible, setAddPlayerVisible] = useState(false);
  const [newTourVisible, setNewTourVisible] = useState(false);
  const [newTourName, setNewTourName] = useState('');
  const [newTourDesc, setNewTourDesc] = useState('');
  const [newTourSymbol, setNewTourSymbol] = useState('');
  const [newTourPlayerIds, setNewTourPlayerIds] = useState(() => new Set());
  /** `details` = name / desc / image / participants; `tournaments` = add scheduled events one by one */
  const [newTourStep, setNewTourStep] = useState('details');
  const [createdTourId, setCreatedTourId] = useState(null);
  const [addedTournamentNames, setAddedTournamentNames] = useState([]);
  const [eventDraft, setEventDraft] = useState({
    name: '',
    eventType: '200',
    matchMode: 'seeds',
    drawSize: 8,
  });
  const [firstTournamentDate, setFirstTournamentDate] = useState(() => toDateStr(new Date()));
  /** How many scheduled tournaments the wizard will collect (step 1), min 2 */
  const [plannedEventCount, setPlannedEventCount] = useState(2);
  const [activeTab, setActiveTab] = useState('players');
  const [matchLayout, setMatchLayout] = useState('list'); // 'stack' | 'list'
  const [playerLayout, setPlayerLayout] = useState('list');
  const [tourLayout, setTourLayout] = useState('list');
  // Start at 0 so in default list mode the stack is hidden; avoids both layers visible at once (ghosting)
  const stackContainerAnim = useRef(new Animated.Value(0)).current;
  const playerStackContainerAnim = useRef(new Animated.Value(0)).current;
  const tourStackContainerAnim = useRef(new Animated.Value(0)).current;
  // Initial value must match current layout so first paint is correct (no 0→1 flash when in list)
  const listCardAnims = useMemo(
    () => matches.map(() => new Animated.Value(matchLayout === 'list' ? 1 : 0)),
    [matches.length, matchLayout]
  );
  const playerListAnims = useMemo(
    () => players.map(() => new Animated.Value(playerLayout === 'list' ? 1 : 0)),
    [players.length, playerLayout]
  );
  const tourListAnims = useMemo(
    () => tours.map(() => new Animated.Value(tourLayout === 'list' ? 1 : 0)),
    [tours.length, tourLayout]
  );

  useEffect(() => {
    if (matchLayout === 'list') listCardAnims.forEach((a) => a.setValue(1));
  }, [listCardAnims, matchLayout]);
  useEffect(() => {
    if (playerLayout === 'list') playerListAnims.forEach((a) => a.setValue(1));
  }, [playerListAnims, playerLayout]);
  useEffect(() => {
    if (tourLayout === 'list') tourListAnims.forEach((a) => a.setValue(1));
  }, [tourListAnims, tourLayout]);

  const [player1Id, setPlayer1Id] = useState(null);
  const [player2Id, setPlayer2Id] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState('');

  const load = useCallback(async () => {
    const [matchList, playerList, tourList] = await Promise.all([
      getAllMatches(),
      getAllPlayers(),
      getAllTours(),
    ]);
    const matchups = uniqueMatchupsFromMatches(matchList);
    setPlayers(playerList);
    setTours(tourList);
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
        toValue: 0, tension: 90, friction: 10, useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => {
        Animated.stagger(50, listCardAnims.map((a) =>
          Animated.spring(a, { toValue: 1, tension: 62, friction: 11, useNativeDriver: USE_NATIVE_DRIVER })
        )).start();
      });
    } else {
      Animated.stagger(28, [...listCardAnims].reverse().map((a) =>
        Animated.timing(a, { toValue: 0, duration: 105, useNativeDriver: USE_NATIVE_DRIVER })
      )).start(() => {
        listCardAnims.forEach((a) => a.setValue(0));
        Animated.spring(stackContainerAnim, {
          toValue: 1, tension: 70, friction: 11, useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      });
    }
  }, [matchLayout, stackContainerAnim, listCardAnims]);

  const togglePlayerLayout = useCallback(() => {
    const toList = playerLayout === 'stack';
    setPlayerLayout(toList ? 'list' : 'stack');
    if (toList) {
      Animated.spring(playerStackContainerAnim, {
        toValue: 0, tension: 90, friction: 10, useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => {
        Animated.stagger(50, playerListAnims.map((a) =>
          Animated.spring(a, { toValue: 1, tension: 62, friction: 11, useNativeDriver: USE_NATIVE_DRIVER })
        )).start();
      });
    } else {
      Animated.stagger(28, [...playerListAnims].reverse().map((a) =>
        Animated.timing(a, { toValue: 0, duration: 105, useNativeDriver: USE_NATIVE_DRIVER })
      )).start(() => {
        playerListAnims.forEach((a) => a.setValue(0));
        Animated.spring(playerStackContainerAnim, {
          toValue: 1, tension: 70, friction: 11, useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      });
    }
  }, [playerLayout, playerStackContainerAnim, playerListAnims]);

  const toggleTourLayout = useCallback(() => {
    const toList = tourLayout === 'stack';
    setTourLayout(toList ? 'list' : 'stack');
    if (toList) {
      Animated.spring(tourStackContainerAnim, {
        toValue: 0, tension: 90, friction: 10, useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => {
        Animated.stagger(50, tourListAnims.map((a) =>
          Animated.spring(a, { toValue: 1, tension: 62, friction: 11, useNativeDriver: USE_NATIVE_DRIVER })
        )).start();
      });
    } else {
      Animated.stagger(28, [...tourListAnims].reverse().map((a) =>
        Animated.timing(a, { toValue: 0, duration: 105, useNativeDriver: USE_NATIVE_DRIVER })
      )).start(() => {
        tourListAnims.forEach((a) => a.setValue(0));
        Animated.spring(tourStackContainerAnim, {
          toValue: 1, tension: 70, friction: 11, useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      });
    }
  }, [tourLayout, tourStackContainerAnim, tourListAnims]);

  const resetNewTourModal = useCallback(() => {
    setNewTourStep('details');
    setCreatedTourId(null);
    setAddedTournamentNames([]);
    setNewTourName('');
    setNewTourDesc('');
    setNewTourSymbol('');
    setNewTourPlayerIds(new Set());
    setEventDraft({ name: '', eventType: '200', matchMode: 'seeds', drawSize: 8 });
    setFirstTournamentDate(toDateStr(new Date()));
    setPlannedEventCount(2);
  }, []);

  const handleCloseNewTourModal = useCallback(async () => {
    if (newTourStep === 'tournaments' && createdTourId != null && addedTournamentNames.length === 0) {
      try {
        await deleteTour(createdTourId);
      } catch (_) {
        /* ignore */
      }
    }
    resetNewTourModal();
    setNewTourVisible(false);
  }, [newTourStep, createdTourId, addedTournamentNames.length, resetNewTourModal]);

  const rosterCountForNewTour = newTourPlayerIds.size;

  const handleNewTourNext = useCallback(async () => {
    const name = newTourName.trim();
    if (!name) {
      Alert.alert('Name', 'Enter a tour name.');
      return;
    }
    const planned = Math.min(64, Math.max(2, Math.floor(Number(plannedEventCount)) || 2));
    if (planned < 2) {
      Alert.alert('Schedule', 'Plan for at least 2 tournaments.');
      return;
    }
    if (rosterCountForNewTour < 2) {
      Alert.alert('Participants', 'Select at least two players on this tour. Draw size cannot exceed the number of players.');
      return;
    }
    try {
      const tourId = await createTour(name, {
        description: newTourDesc.trim(),
        symbolImage: newTourSymbol.trim() || undefined,
        scheduledEvents: [],
      });
      for (const pid of newTourPlayerIds) {
        await addTourParticipant(tourId, pid);
      }
      const defaultDraw =
        clampDrawSizeToParticipants(8, rosterCountForNewTour) ??
        knockoutDrawSizesAllowed(rosterCountForNewTour).slice(-1)[0] ??
        8;
      setCreatedTourId(tourId);
      setAddedTournamentNames([]);
      setPlannedEventCount(planned);
      setNewTourStep('tournaments');
      setEventDraft({ name: '', eventType: '200', matchMode: 'seeds', drawSize: defaultDraw });
      setFirstTournamentDate(toDateStr(new Date()));
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not create tour');
    }
  }, [newTourName, newTourDesc, newTourSymbol, newTourPlayerIds, plannedEventCount, rosterCountForNewTour]);

  const handleBackToTourDetails = useCallback(async () => {
    if (createdTourId != null) {
      try {
        await deleteTour(createdTourId);
      } catch (e) {
        Alert.alert('Error', e?.message || 'Could not go back');
        return;
      }
    }
    setCreatedTourId(null);
    setNewTourStep('details');
    setAddedTournamentNames([]);
  }, [createdTourId]);

  const handleAddScheduledTournament = useCallback(async () => {
    if (createdTourId == null) return;
    if (addedTournamentNames.length >= plannedEventCount) return;
    const allowed = knockoutDrawSizesAllowed(newTourPlayerIds.size);
    const eventType = eventDraft.eventType === 'tourfinals' ? 'tourfinals' : eventDraft.eventType;
    const draftDrawSize = eventType === 'tourfinals' ? 2 : eventDraft.drawSize;
    if (allowed.length === 0 || !allowed.includes(draftDrawSize)) {
      Alert.alert('Draw size', 'Choose a draw size no larger than the number of players on this tour.');
      return;
    }
    const n = eventDraft.name.trim();
    if (!n) {
      Alert.alert('Tournament name', 'Enter a name for this tournament.');
      return;
    }
    if (addedTournamentNames.length === 0) {
      const d = firstTournamentDate.trim().slice(0, 10);
      if (!parseDateStr(d)) {
        Alert.alert('Date', 'First tournament date must be YYYY-MM-DD (e.g. 2026-04-18).');
        return;
      }
    }
    try {
      await addScheduledTourEvent(createdTourId, {
        name: n,
        eventType,
        drawSize: draftDrawSize,
        matchMode: eventType === 'tourfinals' ? 'seeds' : eventDraft.matchMode,
        scheduleStartDate: addedTournamentNames.length === 0 ? firstTournamentDate : undefined,
      });
      setAddedTournamentNames((prev) => [...prev, n]);
      setEventDraft((d) => ({ ...d, name: '' }));
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not add tournament');
    }
  }, [
    createdTourId,
    eventDraft,
    addedTournamentNames.length,
    firstTournamentDate,
    plannedEventCount,
    newTourPlayerIds.size,
  ]);

  const handleCompleteTourSetup = useCallback(async () => {
    if (createdTourId == null) return;
    if (addedTournamentNames.length !== plannedEventCount) {
      Alert.alert('Schedule', `Add exactly ${plannedEventCount} tournament${plannedEventCount === 1 ? '' : 's'} before finishing.`);
      return;
    }
    const tourId = createdTourId;
    const name = newTourName.trim();
    try {
      setNewTourVisible(false);
      resetNewTourModal();
      await load();
      navigation.navigate('TourDetail', { tourId, tourName: name });
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not finish');
    }
  }, [createdTourId, addedTournamentNames.length, plannedEventCount, newTourName, load, navigation, resetNewTourModal]);

  const allowedDrawSizesWizard = useMemo(
    () => knockoutDrawSizesAllowed(newTourPlayerIds.size),
    [newTourPlayerIds.size]
  );

  useEffect(() => {
    if (newTourStep !== 'tournaments') return;
    const allowed = knockoutDrawSizesAllowed(newTourPlayerIds.size);
    if (allowed.length === 0) return;
    setEventDraft((d) => (allowed.includes(d.drawSize) ? d : { ...d, drawSize: allowed[allowed.length - 1] }));
  }, [newTourStep, newTourPlayerIds.size]);

  const pickTourSymbol = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Allow photo access to set a tour symbol.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!r.canceled && r.assets?.[0]?.uri) setNewTourSymbol(r.assets[0].uri);
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
            style={[styles.tabSegment, activeTab === 'players' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('players')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'players' ? styles.tabTextActive : styles.tabTextInactive]}>
              Players
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabSegment, activeTab === 'matches' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('matches')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'matches' ? styles.tabTextActive : styles.tabTextInactive]}>
              Match ups
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabSegment, activeTab === 'tours' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('tours')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'tours' ? styles.tabTextActive : styles.tabTextInactive]}>
              Tours
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {activeTab === 'players' ? 'Players' : activeTab === 'matches' ? 'Match ups' : 'Tours'}
          </Text>
          {activeTab === 'players' && players.length > 0 && (
            <TouchableOpacity onPress={togglePlayerLayout} style={styles.layoutToggleBtn} hitSlop={8}>
              <Text style={styles.layoutToggleIcon}>{playerLayout === 'stack' ? '☰' : '⊟'}</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'matches' && matches.length > 0 && (
            <TouchableOpacity onPress={toggleMatchLayout} style={styles.layoutToggleBtn} hitSlop={8}>
              <Text style={styles.layoutToggleIcon}>{matchLayout === 'stack' ? '☰' : '⊟'}</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'tours' && tours.length > 0 && (
            <TouchableOpacity onPress={toggleTourLayout} style={styles.layoutToggleBtn} hitSlop={8}>
              <Text style={styles.layoutToggleIcon}>{tourLayout === 'stack' ? '☰' : '⊟'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.plusBtn}
            onPress={
              activeTab === 'players'
                ? openAddPlayer
                : activeTab === 'matches'
                  ? openAddMatchup
                  : () => {
                      resetNewTourModal();
                      setNewTourVisible(true);
                    }
            }
          >
            <Text style={styles.plusText}>+</Text>
          </TouchableOpacity>
        </View>
          {activeTab === 'players' ? (
            players.length === 0 ? (
              <Text style={styles.emptyHint}>No players. Tap + to add.</Text>
            ) : (
              <View style={{ flex: 1, position: 'relative' }}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      opacity: playerStackContainerAnim,
                      transform: [{ scale: playerStackContainerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1], extrapolate: 'clamp' }) }],
                      zIndex: playerLayout === 'stack' ? 2 : 1,
                      pointerEvents: playerLayout === 'stack' ? 'auto' : 'none',
                    },
                  ]}
                >
                  <PlayerCardStack
                    items={players}
                    playerStats={playerStats}
                    onPressItem={(p) => navigation.navigate('PlayerDetail', { playerId: p.id, playerName: p.name })}
                    onEdit={(p) => navigation.navigate('PlayerDetail', { playerId: p.id, playerName: p.name, editMode: true })}
                    onDelete={(p) => {
                      confirmDelete(
                        'Delete player?',
                        `Remove ${p.name} and all their matches? This cannot be undone.`,
                        async () => {
                          try {
                            await deletePlayer(p.id);
                            await load();
                          } catch (e) {
                            Alert.alert('Error', e.message || 'Could not delete');
                          }
                        }
                      );
                    }}
                  />
                </Animated.View>
                <Animated.View
                  style={[StyleSheet.absoluteFill, { zIndex: playerLayout === 'list' ? 2 : 1, pointerEvents: playerLayout === 'list' ? 'auto' : 'none' }]}
                >
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                    {players.map((p, k) => (
                      <Animated.View
                        key={p.id}
                        style={{
                          opacity: playerListAnims[k],
                          marginBottom: 10,
                          transform: [{ translateY: playerListAnims[k].interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }],
                        }}
                      >
                        <PlayerCard
                          player={p}
                          stats={playerStats[p.id]}
                          onPress={() => navigation.navigate('PlayerDetail', { playerId: p.id, playerName: p.name })}
                          onEdit={() => navigation.navigate('PlayerDetail', { playerId: p.id, playerName: p.name, editMode: true })}
                          onDelete={() => {
                            confirmDelete(
                              'Delete player?',
                              `Remove ${p.name} and all their matches? This cannot be undone.`,
                              async () => {
                                try {
                                  await deletePlayer(p.id);
                                  await load();
                                } catch (e) {
                                  Alert.alert('Error', e.message || 'Could not delete');
                                }
                              }
                            );
                          }}
                          variant="list"
                        />
                      </Animated.View>
                    ))}
                  </ScrollView>
                </Animated.View>
              </View>
            )
          ) : activeTab === 'matches' ? (
            matches.length === 0 ? (
              <Text style={styles.emptyHint}>No match ups. Tap + to add.</Text>
            ) : (
              <View style={{ flex: 1, position: 'relative' }}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      opacity: stackContainerAnim,
                      transform: [{ scale: stackContainerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1], extrapolate: 'clamp' }) }],
                      zIndex: matchLayout === 'stack' ? 2 : 1,
                      pointerEvents: matchLayout === 'stack' ? 'auto' : 'none',
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
                    onDelete={(mu) => {
                      confirmDelete(
                        'Delete matchup?',
                        `Remove all match days for ${mu.player1_name} vs ${mu.player2_name}? This cannot be undone.`,
                        async () => {
                          try {
                            await deleteAllMatchesForMatchup(mu.player1_id, mu.player2_id);
                            await load();
                          } catch (e) {
                            Alert.alert('Error', e.message || 'Could not delete');
                          }
                        }
                      );
                    }}
                  />
                </Animated.View>
                <Animated.View
                  style={[StyleSheet.absoluteFill, { zIndex: matchLayout === 'list' ? 2 : 1, pointerEvents: matchLayout === 'list' ? 'auto' : 'none' }]}
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
                          onDelete={() => {
                            confirmDelete(
                              'Delete matchup?',
                              `Remove all match days for ${mu.player1_name} vs ${mu.player2_name}? This cannot be undone.`,
                              async () => {
                                try {
                                  await deleteAllMatchesForMatchup(mu.player1_id, mu.player2_id);
                                  await load();
                                } catch (e) {
                                  Alert.alert('Error', e.message || 'Could not delete');
                                }
                              }
                            );
                          }}
                        />
                      </Animated.View>
                    ))}
                  </ScrollView>
                </Animated.View>
              </View>
            )
          ) : tours.length === 0 ? (
            <Text style={styles.emptyHint}>No tours yet. Tap + to create a tour, add events, and run ATP-style rankings.</Text>
          ) : (
            <View style={{ flex: 1, position: 'relative' }}>
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: tourStackContainerAnim,
                    transform: [{ scale: tourStackContainerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1], extrapolate: 'clamp' }) }],
                    zIndex: tourLayout === 'stack' ? 2 : 1,
                    pointerEvents: tourLayout === 'stack' ? 'auto' : 'none',
                  },
                ]}
              >
                <TourCardStack
                  items={tours}
                  onPressItem={(t) => navigation.navigate('TourDetail', { tourId: t.id, tourName: t.name })}
                  onDelete={(t) => {
                    confirmDelete(
                      'Delete tour?',
                      `Remove "${t.name}" and all its events, points, and brackets? This cannot be undone.`,
                      async () => {
                        try {
                          await deleteTour(t.id);
                          await load();
                        } catch (e) {
                          Alert.alert('Error', e.message || 'Could not delete');
                        }
                      }
                    );
                  }}
                />
              </Animated.View>
              <Animated.View
                style={[StyleSheet.absoluteFill, { zIndex: tourLayout === 'list' ? 2 : 1, pointerEvents: tourLayout === 'list' ? 'auto' : 'none' }]}
              >
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                  {tours.map((t, k) => (
                    <Animated.View
                      key={t.id}
                      style={{
                        opacity: tourListAnims[k],
                        marginBottom: 10,
                        transform: [{ translateY: tourListAnims[k].interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }],
                      }}
                    >
                      <TourCard
                        tour={t}
                        onPress={() => navigation.navigate('TourDetail', { tourId: t.id, tourName: t.name })}
                        onDelete={() => {
                          confirmDelete(
                            'Delete tour?',
                            `Remove "${t.name}" and all its events, points, and brackets? This cannot be undone.`,
                            async () => {
                              try {
                                await deleteTour(t.id);
                                await load();
                              } catch (e) {
                                Alert.alert('Error', e.message || 'Could not delete');
                              }
                            }
                          );
                        }}
                        variant="list"
                      />
                    </Animated.View>
                  ))}
                </ScrollView>
              </Animated.View>
            </View>
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

      <Modal visible={newTourVisible} animationType="slide" transparent onRequestClose={handleCloseNewTourModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.newTourScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalCard}>
              {newTourStep === 'details' ? (
                <>
                  <Text style={styles.modalTitle}>New tour</Text>
                  <Text style={styles.modalHint}>
                    Step 1 of 2: name, description, symbol, and who is on this tour. Then you will add tournaments one at a time.
                  </Text>
                  <Text style={styles.modalHint}>
                    A tour groups scheduled knockout brackets. Standings roll over the last N completed tournaments, where N is how
                    many events are on this tour’s schedule.
                  </Text>
                  <TextInput
                    style={styles.nameInput}
                    placeholder="Tour name"
                    placeholderTextColor="#999"
                    value={newTourName}
                    onChangeText={setNewTourName}
                  />
                  <TextInput
                    style={[styles.nameInput, { minHeight: 64, marginTop: 8 }]}
                    placeholder="Description (optional)"
                    placeholderTextColor="#999"
                    value={newTourDesc}
                    onChangeText={setNewTourDesc}
                    multiline
                  />
                  <TouchableOpacity style={styles.modalBtnSecondary} onPress={pickTourSymbol}>
                    <Text style={styles.modalBtnSecondaryText}>{newTourSymbol ? 'Change symbol image' : 'Add symbol image'}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.modalHint, { marginTop: 12 }]}>How many tournaments</Text>
                  <Text style={styles.modalHintSmall}>
                    You will add exactly this many in the next step (each with its own name and draw). Minimum 2.
                  </Text>
                  <View style={styles.plannedStepperRow}>
                    <TouchableOpacity
                      style={styles.plannedStepperBtn}
                      onPress={() => setPlannedEventCount((n) => Math.max(2, n - 1))}
                      accessibilityLabel="Decrease tournament count"
                    >
                      <Text style={styles.plannedStepperBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.plannedStepperValue}>{plannedEventCount}</Text>
                    <TouchableOpacity
                      style={styles.plannedStepperBtn}
                      onPress={() => setPlannedEventCount((n) => Math.min(64, n + 1))}
                      accessibilityLabel="Increase tournament count"
                    >
                      <Text style={styles.plannedStepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.modalHint, { marginTop: 12 }]}>Participants</Text>
                  <Text style={styles.modalHintSmall}>Select players on this tour (you can change later).</Text>
                  <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                    {players.map((p) => {
                      const on = newTourPlayerIds.has(p.id);
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.playerPickRow, on && styles.playerPickRowOn]}
                          onPress={() => {
                            setNewTourPlayerIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(p.id)) n.delete(p.id);
                              else n.add(p.id);
                              return n;
                            });
                          }}
                        >
                          <Text style={styles.playerPickText}>{on ? '✓ ' : ''}{p.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.modalButtons}>
                    <TouchableOpacity style={styles.modalBtnSecondary} onPress={handleCloseNewTourModal}>
                      <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalBtn} onPress={handleNewTourNext}>
                      <Text style={styles.modalBtnText}>Next</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>Add tournaments</Text>
                  <Text style={styles.modalHint}>
                    Step 2 of 2: add tournament {addedTournamentNames.length + 1} of {plannedEventCount}. Later events are scheduled one
                    week after the previous on the calendar.
                  </Text>
                  <Text style={styles.modalHintSmall}>
                    Added: {addedTournamentNames.length} / {plannedEventCount}
                    {addedTournamentNames.length > 0 ? ` · ${addedTournamentNames.join(' · ')}` : ''}
                  </Text>
                  <Text style={styles.modalHintSmall}>
                    Roster: {newTourPlayerIds.size} player{newTourPlayerIds.size === 1 ? '' : 's'} — draw size cannot exceed this.
                  </Text>
                  {addedTournamentNames.length === 0 ? (
                    <>
                      <Text style={[styles.modalHint, { marginTop: 12 }]}>First tournament date</Text>
                      <Text style={styles.modalHintSmall}>The first event is on this day; each additional tournament defaults to one week later.</Text>
                      <TextInput
                        style={[styles.nameInput, { marginTop: 6 }]}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#999"
                        value={firstTournamentDate}
                        onChangeText={setFirstTournamentDate}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </>
                  ) : null}
                  <Text style={[styles.modalHint, { marginTop: 12 }]}>Next tournament</Text>
                  <Text style={styles.modalHintSmall}>Tour 200 / Grand Slam points; finalist gets half. Bracket starts when you open the event.</Text>
                  <View style={styles.scheduleBlock}>
                    <View style={styles.scheduleRow}>
                      <TextInput
                        style={[styles.nameInput, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                        placeholder="Tournament name"
                        placeholderTextColor="#999"
                        value={eventDraft.name}
                        onChangeText={(t) => setEventDraft((d) => ({ ...d, name: t }))}
                      />
                      <View style={styles.scheduleTypeCol}>
                        {['200', 'grandslam', 'tourfinals'].map((k) => (
                          <TouchableOpacity
                            key={k}
                            style={[styles.typeChipMini, eventDraft.eventType === k && styles.typeChipMiniOn]}
                            onPress={() =>
                              setEventDraft((d) => ({
                                ...d,
                                eventType: k,
                                drawSize: k === 'tourfinals' ? 2 : d.drawSize,
                                matchMode: k === 'tourfinals' ? 'seeds' : d.matchMode,
                              }))
                            }
                          >
                            <Text style={[styles.typeChipMiniText, eventDraft.eventType === k && styles.typeChipMiniTextOn]}>
                              {TOUR_EVENT_TYPES[k]?.label ?? k}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={styles.scheduleSubRow}>
                      <Text style={styles.scheduleSubLabel}>Draw</Text>
                      {eventDraft.eventType === 'tourfinals' ? (
                        <TouchableOpacity style={[styles.drawChip, styles.drawChipOn]} disabled>
                          <Text style={[styles.drawChipText, styles.drawChipTextOn]}>2</Text>
                        </TouchableOpacity>
                      ) : allowedDrawSizesWizard.length === 0 ? (
                        <Text style={styles.modalHintSmall}>Need at least 2 players on the tour.</Text>
                      ) : (
                        allowedDrawSizesWizard.map((n) => (
                          <TouchableOpacity
                            key={n}
                            style={[styles.drawChip, eventDraft.drawSize === n && styles.drawChipOn]}
                            onPress={() => setEventDraft((d) => ({ ...d, drawSize: n }))}
                          >
                            <Text style={[styles.drawChipText, eventDraft.drawSize === n && styles.drawChipTextOn]}>{n}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                    <View style={styles.scheduleSubRow}>
                      <Text style={styles.scheduleSubLabel}>Matchups</Text>
                      {[
                        { key: 'seeds', label: 'Seeds (by ranking)' },
                        { key: 'random', label: 'Random' },
                      ].map(({ key, label }) => (
                        <TouchableOpacity
                          key={key}
                          style={[styles.modeChip, eventDraft.matchMode === key && styles.modeChipOn]}
                          disabled={eventDraft.eventType === 'tourfinals'}
                          onPress={() => setEventDraft((d) => ({ ...d, matchMode: key }))}
                        >
                          <Text style={[styles.modeChipText, eventDraft.matchMode === key && styles.modeChipTextOn]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.modalBtnSecondary,
                      (addedTournamentNames.length >= plannedEventCount ||
                        allowedDrawSizesWizard.length === 0) &&
                        styles.modalBtnDisabled,
                    ]}
                    onPress={handleAddScheduledTournament}
                    disabled={
                      addedTournamentNames.length >= plannedEventCount || allowedDrawSizesWizard.length === 0
                    }
                  >
                    <Text style={styles.modalBtnSecondaryText}>
                      {addedTournamentNames.length >= plannedEventCount ? 'All tournaments added' : '+ Add this tournament'}
                    </Text>
                  </TouchableOpacity>
                  <View style={[styles.modalButtons, styles.modalButtonsWrap]}>
                    {addedTournamentNames.length === 0 ? (
                      <TouchableOpacity style={styles.modalBtnSecondary} onPress={handleBackToTourDetails}>
                        <Text style={styles.modalBtnSecondaryText}>Back</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.modalBtnSecondary} onPress={handleCloseNewTourModal}>
                      <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalBtn,
                        addedTournamentNames.length !== plannedEventCount && styles.modalBtnDisabled,
                      ]}
                      onPress={handleCompleteTourSetup}
                      disabled={addedTournamentNames.length !== plannedEventCount}
                    >
                      <Text style={styles.modalBtnText}>Complete</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
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
        Animated.timing(opacity, { toValue: 1, duration: PULSE_DURATION, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0, duration: PULSE_DURATION, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity, borderRadius: 14, overflow: 'hidden', pointerEvents: 'none' }]}
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

function MatchUpCardStack({ items, players, onPressItem, onAddDay, onDelete }) {
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
      useNativeDriver: USE_NATIVE_DRIVER,
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
          Animated.spring(swipeX, { toValue: 0, friction: 7, useNativeDriver: USE_NATIVE_DRIVER }).start();
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

  const containerH = STACK_CARD_H + STACK_OFFSET * (visibleCount - 1);

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
              opacity: 0.95,
              zIndex: 9,
            };
          } else {
            posStyle = { position: 'absolute', left: 0, right: 0, top: 0 };
            animStyle = {
              transform: [{ scale: thirdScale }, { translateY: thirdTransY }],
              opacity: 0.9,
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
                onDelete={depth === 0 ? () => onDelete?.(item) : undefined}
                cardStyle={{ height: STACK_CARD_H }}
                variant="stack"
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

function PlayerCardStack({ items, playerStats, onPressItem, onEdit, onDelete }) {
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
      useNativeDriver: USE_NATIVE_DRIVER,
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
        !swipingRef.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_, g) => { if (!swipingRef.current) swipeX.setValue(g.dx); },
      onPanResponderRelease: (_, g) => {
        if (swipingRef.current) return;
        if (nRef.current < 2) { swipeX.setValue(0); return; }
        const dir = g.dx < -SWIPE_THRESH ? 1 : g.dx > SWIPE_THRESH ? -1 : 0;
        if (dir === 0) {
          Animated.spring(swipeX, { toValue: 0, friction: 7, useNativeDriver: USE_NATIVE_DRIVER }).start();
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
  const containerH = STACK_CARD_H + STACK_OFFSET * (visibleCount - 1);
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
            animStyle = { transform: [{ translateX: swipeX }, { rotate: activeRotate }], zIndex: 10 };
          } else if (depth === 1) {
            posStyle = { position: 'absolute', left: 0, right: 0, top: 0 };
            animStyle = { transform: [{ scale: nextScale }, { translateY: nextTransY }], opacity: 0.95, zIndex: 9 };
          } else {
            posStyle = { position: 'absolute', left: 0, right: 0, top: 0 };
            animStyle = { transform: [{ scale: thirdScale }, { translateY: thirdTransY }], opacity: 0.9, zIndex: 8 };
          }
          return (
            <Animated.View key={`pd${depth}`} style={[posStyle, animStyle]} {...(depth === 0 ? panResponder.panHandlers : {})}>
              <PlayerCard
                player={item}
                stats={playerStats[item.id]}
                onPress={depth === 0 ? () => onPressItem(item) : undefined}
                onEdit={depth === 0 ? () => onEdit?.(item) : undefined}
                onDelete={depth === 0 ? () => onDelete?.(item) : undefined}
                variant="stack"
                cardStyle={{ height: STACK_CARD_H }}
              />
            </Animated.View>
          );
        })}
      </View>
      {n > 1 && (
        <View style={styles.stackNavRow}>
          <TouchableOpacity onPress={() => doSwipeRef.current?.(-1)} style={styles.navBtn} hitSlop={10} activeOpacity={0.7}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.dotRow}>
            {n <= 10 ? items.map((_, i) => <View key={i} style={[styles.dot, i === safeIdx && styles.dotActive]} />) : <Text style={styles.dotCount}>{safeIdx + 1} / {n}</Text>}
          </View>
          <TouchableOpacity onPress={() => doSwipeRef.current?.(1)} style={styles.navBtn} hitSlop={10} activeOpacity={0.7}>
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function TourCardStack({ items, onPressItem, onDelete }) {
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
      useNativeDriver: USE_NATIVE_DRIVER,
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
        !swipingRef.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_, g) => { if (!swipingRef.current) swipeX.setValue(g.dx); },
      onPanResponderRelease: (_, g) => {
        if (swipingRef.current) return;
        if (nRef.current < 2) { swipeX.setValue(0); return; }
        const dir = g.dx < -SWIPE_THRESH ? 1 : g.dx > SWIPE_THRESH ? -1 : 0;
        if (dir === 0) {
          Animated.spring(swipeX, { toValue: 0, friction: 7, useNativeDriver: USE_NATIVE_DRIVER }).start();
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
  const containerH = STACK_CARD_H + STACK_OFFSET * (visibleCount - 1);
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
            animStyle = { transform: [{ translateX: swipeX }, { rotate: activeRotate }], zIndex: 10 };
          } else if (depth === 1) {
            posStyle = { position: 'absolute', left: 0, right: 0, top: 0 };
            animStyle = { transform: [{ scale: nextScale }, { translateY: nextTransY }], opacity: 0.95, zIndex: 9 };
          } else {
            posStyle = { position: 'absolute', left: 0, right: 0, top: 0 };
            animStyle = { transform: [{ scale: thirdScale }, { translateY: thirdTransY }], opacity: 0.9, zIndex: 8 };
          }
          return (
            <Animated.View key={`td${depth}`} style={[posStyle, animStyle]} {...(depth === 0 ? panResponder.panHandlers : {})}>
              <TourCard
                tour={item}
                onPress={depth === 0 ? () => onPressItem(item) : undefined}
                onDelete={depth === 0 ? () => onDelete?.(item) : undefined}
                variant="stack"
                cardStyle={{ height: STACK_CARD_H }}
              />
            </Animated.View>
          );
        })}
      </View>
      {n > 1 && (
        <View style={styles.stackNavRow}>
          <TouchableOpacity onPress={() => doSwipeRef.current?.(-1)} style={styles.navBtn} hitSlop={10} activeOpacity={0.7}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.dotRow}>
            {n <= 10 ? items.map((_, i) => <View key={i} style={[styles.dot, i === safeIdx && styles.dotActive]} />) : <Text style={styles.dotCount}>{safeIdx + 1} / {n}</Text>}
          </View>
          <TouchableOpacity onPress={() => doSwipeRef.current?.(1)} style={styles.navBtn} hitSlop={10} activeOpacity={0.7}>
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function MatchUpCard({ matchup, players, onPress, onAddDay, onDelete, cardStyle, variant }) {
  const dateLabel = matchup.lastPlayedDate ? matchup.lastPlayedDate.slice(0, 10) : 'No days yet';
  const h2h = matchup.h2h;
  const s1 = h2h?.setsWon ?? 0;
  const s2 = h2h?.setsLost ?? 0;
  const h2hLabel = s1 + s2 > 0 ? `${s1}–${s2} sets` : '—';
  const playersById = (players || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
  const p1 = playersById[matchup.player1_id];
  const p2 = playersById[matchup.player2_id];
  const uri1 = p1?.profile_image || null;
  const uri2 = p2?.profile_image || null;
  const name1 = matchup.player1_name || '';
  const name2 = matchup.player2_name || '';

  const isStack = variant === 'stack';

  if (isStack) {
    return (
      <TouchableOpacity
        style={[styles.matchCardStack, cardStyle]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.matchCardStackInner}>
          <View style={styles.matchCardStackHeader}>
            <Text style={styles.matchCardStackVs} numberOfLines={2}>
              {matchup.player1_name} vs {matchup.player2_name}
            </Text>
            <View style={styles.cardActionsRight}>
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
              {onDelete && (
                <TouchableOpacity style={styles.cardDeleteBtn} onPress={(e) => { e.stopPropagation(); onDelete(); }} hitSlop={8}>
                  <Text style={styles.cardDeleteBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={styles.matchCardStackDate}>Last played: {dateLabel}</Text>
          <Text style={styles.matchCardStackH2h}>Sets: {h2hLabel}</Text>
          <Text style={styles.matchCardStackTap}>Tap for stats · Add for new day</Text>
          <View style={styles.matchCardStackCollageWrap}>
            <MatchupAvatarCollage uri1={uri1} uri2={uri2} name1={name1} name2={name2} variant="splitSquare" size={88} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

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
              <View style={styles.cardActionsRight}>
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
                {onDelete && (
                  <TouchableOpacity style={styles.cardDeleteBtn} onPress={(e) => { e.stopPropagation(); onDelete(); }} hitSlop={8}>
                    <Text style={styles.cardDeleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text style={styles.matchCardDate}>Last played: {dateLabel}</Text>
            <Text style={styles.matchCardH2h}>Sets: {h2hLabel}</Text>
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

function MatchupAvatarCollage({ uri1, uri2, name1, name2, size = 28, variant }) {
  const initials = (name) =>
    (name || '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '?';

  // Stack card: square image split in half (left = p1, right = p2)
  if (variant === 'splitSquare') {
    const side = size;
    const half = side / 2;
    const fontSize = 18;
    return (
      <View style={[styles.collageSplitSquare, { width: side, height: side }]}>
        <View style={[styles.collageSplitHalf, { width: half, height: side }]}>
          {uri1 ? (
            <Image source={{ uri: uri1 }} style={{ width: side, height: side }} resizeMode="cover" />
          ) : (
            <View style={[styles.collageSplitFallback, { width: half, height: side }]}>
              <Text style={[styles.collageInitial, { fontSize }]} numberOfLines={1}>{initials(name1)}</Text>
            </View>
          )}
        </View>
        <View style={[styles.collageSplitHalf, { width: half, height: side }]}>
          {uri2 ? (
            <Image
              source={{ uri: uri2 }}
              style={{ width: side, height: side, position: 'absolute', right: 0 }}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.collageSplitFallback, { width: half, height: side }]}>
              <Text style={[styles.collageInitial, { fontSize }]} numberOfLines={1}>{initials(name2)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // List card: overlapping circles
  const overlap = Math.round(size * 0.36);
  const fontSize = size <= 28 ? 10 : 14;
  return (
    <View style={[styles.collageContainer, { width: size * 2 - overlap, height: size }]}>
      <View style={[styles.collageAvatar, { width: size, height: size, borderRadius: size / 2, left: 0, zIndex: 2 }]}>
        {uri1 ? (
          <Image source={{ uri: uri1 }} style={styles.collageImage} />
        ) : (
          <View style={styles.collageFallback}>
            <Text style={[styles.collageInitial, { fontSize }]} numberOfLines={1}>{initials(name1)}</Text>
          </View>
        )}
      </View>
      <View style={[styles.collageAvatar, { width: size, height: size, borderRadius: size / 2, left: size - overlap, zIndex: 1 }]}>
        {uri2 ? (
          <Image source={{ uri: uri2 }} style={styles.collageImage} />
        ) : (
          <View style={styles.collageFallback}>
            <Text style={[styles.collageInitial, { fontSize }]} numberOfLines={1}>{initials(name2)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PlayerAvatar({ uri, name, size }) {
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />;
  }
  return (
    <View style={[styles.playerAvatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.playerAvatarInitial, { fontSize: size * 0.4 }]} numberOfLines={1}>{initials || '?'}</Text>
    </View>
  );
}

function PlayerCard({ player, stats, onPress, onEdit, onDelete, variant = 'list', cardStyle }) {
  const statLine = stats
    ? `${stats.matchesPlayed ?? 0} days · ${stats.daysWon ?? stats.wins ?? 0}W-${stats.daysLost ?? stats.losses ?? 0}L-${stats.daysTied ?? 0}T · ${(stats.setWinPercentage ?? stats.winPercentage ?? 0).toFixed(0)}% sets`
    : null;
  const isStack = variant === 'stack';

  if (isStack) {
    return (
      <TouchableOpacity style={[styles.playerCardStack, cardStyle]} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.playerCardStackInner}>
          <View style={styles.playerCardStackRow}>
            <View style={styles.playerCardStackText}>
              <View style={styles.playerCardStackHeader}>
                <Text style={[styles.playerCardStackName, styles.cardTitleFlex]} numberOfLines={2}>{player.name}</Text>
                {(onEdit || onDelete) && (
                  <View style={styles.cardActionsRight}>
                    {onEdit && (
                      <TouchableOpacity style={styles.cardEditBtn} onPress={(e) => { e.stopPropagation(); onEdit(); }} hitSlop={8}>
                        <Text style={styles.cardEditBtnText}>Edit</Text>
                      </TouchableOpacity>
                    )}
                    {onDelete && (
                      <TouchableOpacity style={styles.cardDeleteBtn} onPress={(e) => { e.stopPropagation(); onDelete(); }} hitSlop={8}>
                        <Text style={styles.cardDeleteBtnText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
              {statLine ? <Text style={styles.playerCardStackStats} numberOfLines={1}>{statLine}</Text> : null}
              {player.description ? (
                <Text style={styles.playerCardStackDesc} numberOfLines={2}>{player.description}</Text>
              ) : null}
              <Text style={styles.playerCardStackTap}>Tap for profile</Text>
            </View>
            <View style={styles.playerCardStackAvatarWrap}>
              <PlayerAvatar uri={player.profile_image} name={player.name} size={92} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.playerCard} onPress={onPress} activeOpacity={0.7}>
      <CardColorPulse />
      <View style={styles.playerCardInner}>
        <View style={styles.playerCardListLeft}>
          <View style={styles.playerCardListHeader}>
            <Text style={[styles.playerCardName, styles.cardTitleFlex]} numberOfLines={1}>{player.name}</Text>
            {(onEdit || onDelete) && (
              <View style={styles.cardActionsRight}>
                {onEdit && (
                  <TouchableOpacity style={styles.cardEditBtn} onPress={(e) => { e.stopPropagation(); onEdit(); }} hitSlop={8}>
                    <Text style={styles.cardEditBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}
                {onDelete && (
                  <TouchableOpacity style={styles.cardDeleteBtn} onPress={(e) => { e.stopPropagation(); onDelete(); }} hitSlop={8}>
                    <Text style={styles.cardDeleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          {statLine ? <Text style={styles.playerCardStats} numberOfLines={1}>{statLine}</Text> : null}
        </View>
        <View style={styles.playerCardListAvatar}>
          <PlayerAvatar uri={player.profile_image} name={player.name} size={40} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function TourCard({ tour, onPress, onDelete, variant = 'list', cardStyle }) {
  const metaParts = [];
  if (tour?.event_count != null && tour.event_count > 0) {
    metaParts.push(`rolling last ${tour.event_count} tournament${tour.event_count === 1 ? '' : 's'}`);
  } else if (tour?.rolling_weeks) {
    metaParts.push(`last ${tour.rolling_weeks} tournaments (rolling)`);
  }
  if (tour?.description) metaParts.push(tour.description.length > 48 ? `${tour.description.slice(0, 48)}…` : tour.description);
  if (!metaParts.length) metaParts.push('Tour · events & rankings');
  const isStack = variant === 'stack';

  if (isStack) {
    return (
      <TouchableOpacity style={[styles.tournamentCardStack, cardStyle]} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.tournamentCardStackInner}>
          <View style={styles.tournamentCardStackHeader}>
            {tour?.symbol_image ? (
              <Image source={{ uri: tour.symbol_image }} style={styles.tourCardThumb} />
            ) : (
              <Text style={styles.tourCardEmoji}>🏆</Text>
            )}
            <Text style={[styles.tournamentCardStackName, styles.cardTitleFlex]} numberOfLines={2}>{tour.name}</Text>
            {onDelete && (
              <TouchableOpacity style={styles.cardDeleteBtn} onPress={(e) => { e.stopPropagation(); onDelete(); }} hitSlop={8}>
                <Text style={styles.cardDeleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.tournamentCardStackMeta} numberOfLines={2}>{metaParts.join(' · ')}</Text>
          <Text style={styles.tournamentCardStackTap}>Tap to open tour</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.tournamentCard} onPress={onPress} activeOpacity={0.7}>
      <CardColorPulse />
      <View style={styles.tournamentCardInner}>
        <View style={styles.tournamentCardHeader}>
          {tour?.symbol_image ? (
            <Image source={{ uri: tour.symbol_image }} style={styles.tourCardThumbList} />
          ) : (
            <Text style={styles.tourCardEmojiList}>🏆</Text>
          )}
          <Text style={[styles.tournamentCardName, styles.cardTitleFlex]} numberOfLines={1}>{tour.name}</Text>
          {onDelete && (
            <TouchableOpacity style={styles.cardDeleteBtn} onPress={(e) => { e.stopPropagation(); onDelete(); }} hitSlop={8}>
              <Text style={styles.cardDeleteBtnText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
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
  matchCardStack: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.98)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  matchCardStackInner: { padding: 16, flex: 1, justifyContent: 'space-between' },
  matchCardStackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  matchCardStackVs: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  matchCardStackDate: { fontSize: 13, color: '#666', marginTop: 6 },
  matchCardStackH2h: { fontSize: 13, color: '#1a472a', marginTop: 2, fontWeight: '600' },
  matchCardStackTap: { fontSize: 11, color: '#1a472a', marginTop: 4, opacity: 0.9 },
  matchCardStackCollageWrap: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  cardActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  cardActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardEditBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(26,71,42,0.12)' },
  cardEditBtnText: { fontSize: 12, fontWeight: '600', color: '#1a472a' },
  cardDeleteBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(197,48,48,0.12)' },
  cardDeleteBtnText: { fontSize: 12, fontWeight: '600', color: '#c53030' },
  cardTitleFlex: { flex: 1, minWidth: 0 },
  playerCardStackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  playerCardListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  tournamentCardStackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  tournamentCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
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
  collageSplitSquare: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  collageSplitHalf: { overflow: 'hidden' },
  collageSplitFallback: {
    backgroundColor: '#e2ebdf',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  playerCardInner: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  playerCardListLeft: { flex: 1, minWidth: 0 },
  playerCardListAvatar: {},
  playerCardName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  playerCardStats: { fontSize: 12, color: '#666', marginTop: 4 },
  playerAvatarFallback: { backgroundColor: '#e2ebdf', alignItems: 'center', justifyContent: 'center' },
  playerAvatarInitial: { fontWeight: '700', color: '#1a472a' },
  playerCardStack: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.98)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  playerCardStackInner: { padding: 16, flex: 1, justifyContent: 'center' },
  playerCardStackRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  playerCardStackText: { flex: 1, minWidth: 0 },
  playerCardStackName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  playerCardStackStats: { fontSize: 13, color: '#666', marginTop: 6 },
  playerCardStackDesc: { fontSize: 12, color: '#555', marginTop: 4, fontStyle: 'italic' },
  playerCardStackTap: { fontSize: 11, color: '#1a472a', marginTop: 8, opacity: 0.9 },
  playerCardStackAvatarWrap: {},
  tourCardThumb: { width: 44, height: 44, borderRadius: 10, marginRight: 10, backgroundColor: '#e8e8e8' },
  tourCardThumbList: { width: 40, height: 40, borderRadius: 8, marginRight: 10, backgroundColor: '#e8e8e8' },
  tourCardEmoji: { fontSize: 32, marginRight: 10 },
  tourCardEmojiList: { fontSize: 24, marginRight: 8 },
  playerPickRow: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  playerPickRowOn: { backgroundColor: 'rgba(26,71,42,0.1)' },
  playerPickText: { fontSize: 16, color: '#222' },
  tournamentCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(26,71,42,0.18)',
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
  tournamentCardStack: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(26,71,42,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  tournamentCardStackInner: { padding: 20, flex: 1, justifyContent: 'center' },
  tournamentCardStackName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  tournamentCardStackMeta: { fontSize: 13, color: '#666', marginTop: 8 },
  tournamentCardStackTap: { fontSize: 11, color: '#1a472a', marginTop: 12, opacity: 0.9 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  newTourScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },
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
  modalHintSmall: { color: '#888', fontSize: 12, marginBottom: 10, lineHeight: 16 },
  scheduleBlock: { marginBottom: 14, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  scheduleSubRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 },
  scheduleSubLabel: { fontSize: 12, color: '#666', width: 56 },
  scheduleTypeCol: { flexDirection: 'column', gap: 4 },
  drawChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  drawChipOn: { backgroundColor: 'rgba(26,71,42,0.25)' },
  drawChipText: { fontSize: 12, color: '#555' },
  drawChipTextOn: { color: '#1a472a', fontWeight: '700' },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginRight: 4,
  },
  modeChipOn: { backgroundColor: 'rgba(26,71,42,0.2)' },
  modeChipText: { fontSize: 11, color: '#444' },
  modeChipTextOn: { color: '#1a472a', fontWeight: '700' },
  typeChipMini: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  typeChipMiniOn: { backgroundColor: 'rgba(26,71,42,0.25)' },
  typeChipMiniText: { fontSize: 11, color: '#555' },
  typeChipMiniTextOn: { color: '#1a472a', fontWeight: '700' },
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
  modalButtonsWrap: { flexWrap: 'wrap' },
  plannedStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  plannedStepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e8eee8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannedStepperBtnText: { fontSize: 22, fontWeight: '700', color: '#1a472a' },
  plannedStepperValue: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', minWidth: 36, textAlign: 'center' },
  modalBtn: { flex: 1, backgroundColor: '#1a472a', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnDisabled: { opacity: 0.45 },
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
