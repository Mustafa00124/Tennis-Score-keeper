import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllMatches, getAllPlayers, createMatchup } from '../db/database';

export default function HomeScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [addMatchupVisible, setAddMatchupVisible] = useState(false);
  const [players, setPlayers] = useState([]);
  const [player1Id, setPlayer1Id] = useState(null);
  const [player2Id, setPlayer2Id] = useState(null);

  const load = useCallback(async () => {
    const [matchList, playerList] = await Promise.all([getAllMatches(), getAllPlayers()]);
    setMatches(matchList);
    setPlayers(playerList);
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

  const goToPlayers = useCallback(() => {
    setAddMatchupVisible(false);
    navigation.getParent()?.navigate('Players');
  }, [navigation]);

  const goToStats = useCallback(() => {
    setAddMatchupVisible(false);
    navigation.getParent()?.navigate('Stats');
  }, [navigation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionCard} onPress={openAddMatchup}>
          <Text style={styles.actionEmoji}>🎾</Text>
          <Text style={styles.actionTitle}>Add match up</Text>
          <Text style={styles.actionSub}>Between two players</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard} onPress={goToPlayers}>
          <Text style={styles.actionEmoji}>👤</Text>
          <Text style={styles.actionTitle}>Add players</Text>
          <Text style={styles.actionSub}>Manage player list</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard} onPress={goToStats}>
          <Text style={styles.actionEmoji}>📊</Text>
          <Text style={styles.actionTitle}>Statistics</Text>
          <Text style={styles.actionSub}>Wins, H2H & more</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Your match ups</Text>
      {matches.length === 0 ? (
        <Text style={styles.emptyHint}>No match ups yet. Tap "Add match up" to create one.</Text>
      ) : (
        matches.map((m) => (
          <MatchUpBlock
            key={m.id}
            match={m}
            onPress={() => navigation.navigate('MatchDetail', { matchId: m.id })}
          />
        ))
      )}

      <Modal visible={addMatchupVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New match up</Text>
            {players.length < 2 ? (
              <>
                <Text style={styles.modalHint}>Add at least 2 players in the Players tab first.</Text>
                <TouchableOpacity style={styles.modalBtn} onPress={goToPlayers}>
                  <Text style={styles.modalBtnText}>Go to Players</Text>
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
    </ScrollView>
  );
}

function MatchUpBlock({ match, onPress }) {
  const dateLabel = match.date_played ? match.date_played : 'No date set';

  return (
    <TouchableOpacity style={styles.matchBlock} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.matchBlockHeader}>
        <Text style={styles.matchBlockVs}>
          {match.player1_name} vs {match.player2_name}
        </Text>
      </View>
      <Text style={styles.matchBlockDate}>{dateLabel}</Text>
      {match.remarks ? <Text style={styles.matchBlockRemarks} numberOfLines={1}>{match.remarks}</Text> : null}
      <Text style={styles.matchBlockTap}>Tap to add set scores, date, remarks & photos</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 12, marginTop: 8 },
  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  actionEmoji: { fontSize: 32, marginBottom: 8 },
  actionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  actionSub: { fontSize: 12, color: '#666', marginTop: 2 },
  emptyHint: { color: '#666', fontSize: 15, paddingVertical: 16 },
  matchBlock: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#1a472a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  matchBlockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchBlockVs: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  matchBlockDate: { fontSize: 13, color: '#666', marginTop: 4 },
  matchBlockRemarks: { fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' },
  matchBlockTap: { fontSize: 12, color: '#1a472a', marginTop: 6, opacity: 0.9 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: { borderColor: '#1a472a', backgroundColor: '#e8f0e8' },
  chipText: { fontSize: 15, color: '#333' },
  chipTextSelected: { color: '#1a472a', fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalBtn: { flex: 1, backgroundColor: '#1a472a', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalBtnSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#eee' },
  modalBtnSecondaryText: { color: '#333', fontWeight: '600' },
  modalClose: { position: 'absolute', top: 16, right: 16, padding: 8 },
  modalCloseText: { fontSize: 20, color: '#666' },
});
