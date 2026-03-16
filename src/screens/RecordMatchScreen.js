import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { getAllPlayers, createMatch } from '../db/database';

const TODAY = new Date().toISOString().slice(0, 10);

export default function RecordMatchScreen() {
  const [players, setPlayers] = useState([]);
  const [player1Id, setPlayer1Id] = useState(null);
  const [player2Id, setPlayer2Id] = useState(null);
  const [datePlayed, setDatePlayed] = useState(TODAY);
  const [sets, setSets] = useState([{ gamesPlayer1: '', gamesPlayer2: '' }]);

  useEffect(() => {
    getAllPlayers().then(setPlayers);
  }, []);

  const addSet = useCallback(() => {
    setSets((s) => [...s, { gamesPlayer1: '', gamesPlayer2: '' }]);
  }, []);

  const removeSet = useCallback((index) => {
    setSets((s) => s.filter((_, i) => i !== index));
  }, []);

  const updateSet = useCallback((index, field, value) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    const num = value === '' ? '' : parseInt(value, 10);
    setSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: num };
      return next;
    });
  }, []);

  const getSetNums = () => {
    return sets.map((s) => {
      const a = s.gamesPlayer1 === '' ? 0 : (typeof s.gamesPlayer1 === 'number' ? s.gamesPlayer1 : parseInt(String(s.gamesPlayer1), 10));
      const b = s.gamesPlayer2 === '' ? 0 : (typeof s.gamesPlayer2 === 'number' ? s.gamesPlayer2 : parseInt(String(s.gamesPlayer2), 10));
      return { gamesPlayer1: Number.isInteger(a) ? a : 0, gamesPlayer2: Number.isInteger(b) ? b : 0 };
    });
  };

  const handleSave = useCallback(async () => {
    if (!player1Id || !player2Id) {
      Alert.alert('Select players', 'Choose both players.');
      return;
    }
    if (player1Id === player2Id) {
      Alert.alert('Same player', 'Choose two different players.');
      return;
    }
    const parsed = getSetNums();
    const valid = parsed.filter((s) => s.gamesPlayer1 > 0 || s.gamesPlayer2 > 0);
    if (valid.length === 0) {
      Alert.alert('Add sets', 'Enter at least one set score (e.g. 6 and 3).');
      return;
    }
    const p1Sets = valid.filter((s) => s.gamesPlayer1 > s.gamesPlayer2).length;
    const p2Sets = valid.filter((s) => s.gamesPlayer2 > s.gamesPlayer1).length;
    if (p1Sets === p2Sets) {
      Alert.alert('No winner', 'One player must win more sets than the other.');
      return;
    }
    try {
      await createMatch(player1Id, player2Id, datePlayed, valid);
      setPlayer1Id(null);
      setPlayer2Id(null);
      setSets([{ gamesPlayer1: '', gamesPlayer2: '' }]);
      setDatePlayed(TODAY);
      Alert.alert('Saved', 'Match recorded.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save match');
    }
  }, [player1Id, player2Id, datePlayed, sets]);

  const p1 = players.find((p) => p.id === player1Id);
  const p2 = players.find((p) => p.id === player2Id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {players.length === 0 && (
        <Text style={styles.noPlayersHint}>Add players in the Players tab first.</Text>
      )}
      <View style={styles.section}>
        <Text style={styles.label}>Player 1</Text>
        <View style={styles.pickerRow}>
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
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Player 2</Text>
        <View style={styles.pickerRow}>
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
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.dateInput}
          value={datePlayed}
          onChangeText={setDatePlayed}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#999"
        />
      </View>
      <View style={styles.section}>
        <View style={styles.setHeader}>
          <Text style={styles.label}>Set scores</Text>
          <TouchableOpacity onPress={addSet} style={styles.addSetBtn}>
            <Text style={styles.addSetText}>+ Set</Text>
          </TouchableOpacity>
        </View>
        {sets.map((set, i) => (
          <View key={i} style={styles.setRow}>
            <Text style={styles.setNum}>Set {i + 1}</Text>
            <SetInput
              value={set.gamesPlayer1}
              onChange={(v) => updateSet(i, 'gamesPlayer1', v)}
              placeholder={p1?.name?.slice(0, 4) || 'P1'}
            />
            <Text style={styles.dash}>–</Text>
            <SetInput
              value={set.gamesPlayer2}
              onChange={(v) => updateSet(i, 'gamesPlayer2', v)}
              placeholder={p2?.name?.slice(0, 4) || 'P2'}
            />
            {sets.length > 1 && (
              <TouchableOpacity onPress={() => removeSet(i)} style={styles.removeSet}>
                <Text style={styles.removeSetText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save match</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SetInput({ value, onChange, placeholder }) {
  return (
    <TextInput
      style={styles.setInput}
      keyboardType="number-pad"
      maxLength={2}
      value={String(value)}
      onChangeText={(t) => {
        if (t === '' || /^\d+$/.test(t)) onChange(t === '' ? '' : t);
      }}
      placeholder={placeholder}
      placeholderTextColor="#999"
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  content: { padding: 16, paddingBottom: 48 },
  section: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#c8d4c8',
  },
  chipSelected: { borderColor: '#1a472a', backgroundColor: '#e8f0e8' },
  chipText: { fontSize: 15, color: '#333' },
  chipTextSelected: { color: '#1a472a', fontWeight: '600' },
  dateInput: {
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  setHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addSetBtn: { padding: 8 },
  addSetText: { color: '#1a472a', fontWeight: '600', fontSize: 14 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  setNum: { width: 44, fontSize: 14, color: '#666' },
  setInput: {
    width: 56,
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 18,
    textAlign: 'center',
  },
  dash: { fontSize: 18, color: '#666' },
  removeSet: { padding: 8 },
  removeSetText: { color: '#c53030', fontSize: 16 },
  saveBtn: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  noPlayersHint: { padding: 12, marginBottom: 8, color: '#c53030', textAlign: 'center', fontSize: 14 },
});
