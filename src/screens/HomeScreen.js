import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAllMatches,
  getAllPlayers,
  createMatchup,
  createPlayer,
  getPlayerStats,
} from '../db/database';

export default function HomeScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [playerStats, setPlayerStats] = useState({});
  const [addMatchupVisible, setAddMatchupVisible] = useState(false);
  const [addPlayerVisible, setAddPlayerVisible] = useState(false);
  const [player1Id, setPlayer1Id] = useState(null);
  const [player2Id, setPlayer2Id] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState('');

  const load = useCallback(async () => {
    const [matchList, playerList] = await Promise.all([getAllMatches(), getAllPlayers()]);
    setMatches(matchList);
    setPlayers(playerList);
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
      <View style={styles.row}>
        {/* Left: Match ups */}
        <View style={styles.column}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Match ups</Text>
            <TouchableOpacity style={styles.plusBtn} onPress={openAddMatchup}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {matches.length === 0 ? (
              <Text style={styles.emptyHint}>No match ups. Tap + to add.</Text>
            ) : (
              matches.map((m) => (
                <MatchUpCard
                  key={m.id}
                  match={m}
                  onPress={() =>
                    navigation.navigate('MatchupStats', {
                      player1Id: m.player1_id,
                      player2Id: m.player2_id,
                      player1Name: m.player1_name,
                      player2Name: m.player2_name,
                    })
                  }
                  onEdit={() => navigation.navigate('MatchDetail', { matchId: m.id })}
                />
              ))
            )}
          </ScrollView>
        </View>

        {/* Right: Players */}
        <View style={styles.column}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Players</Text>
            <TouchableOpacity style={styles.plusBtn} onPress={openAddPlayer}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {players.length === 0 ? (
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
            )}
          </ScrollView>
        </View>
      </View>

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

function MatchUpCard({ match, onPress, onEdit }) {
  const dateLabel = match.date_played || 'No date set';
  return (
    <TouchableOpacity style={styles.matchCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.matchCardHeader}>
        <Text style={styles.matchCardVs} numberOfLines={2}>
          {match.player1_name} vs {match.player2_name}
        </Text>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.matchCardDate}>{dateLabel}</Text>
      {match.remarks ? (
        <Text style={styles.matchCardRemarks} numberOfLines={1}>{match.remarks}</Text>
      ) : null}
      <Text style={styles.matchCardTap}>Tap for stats</Text>
    </TouchableOpacity>
  );
}

function PlayerCard({ player, stats, onPress }) {
  const statLine = stats
    ? `${stats.matchesPlayed} M · ${stats.wins}W ${stats.losses}L${stats.matchesPlayed > 0 ? ` · ${stats.winPercentage.toFixed(0)}%` : ''}`
    : null;
  return (
    <TouchableOpacity style={styles.playerCard} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.playerCardName} numberOfLines={1}>{player.name}</Text>
      {statLine ? <Text style={styles.playerCardStats} numberOfLines={1}>{statLine}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  row: { flex: 1, flexDirection: 'row', paddingHorizontal: 8, paddingTop: 8, gap: 8 },
  column: { flex: 1, minWidth: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1a472a' },
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
  emptyHint: { color: '#666', fontSize: 14, paddingVertical: 12, paddingHorizontal: 4 },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1a472a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  matchCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  matchCardVs: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  editBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#1a472a' },
  editBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  matchCardDate: { fontSize: 12, color: '#666', marginTop: 4 },
  matchCardRemarks: { fontSize: 11, color: '#888', marginTop: 2, fontStyle: 'italic' },
  matchCardTap: { fontSize: 11, color: '#1a472a', marginTop: 4, opacity: 0.9 },
  playerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2d5a3d',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  playerCardName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  playerCardStats: { fontSize: 12, color: '#666', marginTop: 4 },
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
