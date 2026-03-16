import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllPlayers, createPlayer, deletePlayer } from '../db/database';

export default function PlayersScreen({ navigation }) {
  const [players, setPlayers] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllPlayers();
      setPlayers(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createPlayer(name);
      setNewName('');
      await load();
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A player with this name already exists.');
      } else {
        Alert.alert('Error', e.message || 'Could not add player');
      }
    }
  }, [newName, load]);

  const handleDelete = useCallback(
    (id, name) => {
      Alert.alert('Delete player', `Remove "${name}"? This will not delete past matches.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePlayer(id);
            await load();
          },
        },
      ]);
    },
    [load]
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('PlayerDetail', { playerId: item.id, playerName: item.name })}
      activeOpacity={0.7}
    >
      <Text style={styles.playerName}>{item.name}</Text>
      <TouchableOpacity
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={() => handleDelete(item.id, item.name)}
        style={styles.deleteBtn}
      >
        <Text style={styles.deleteText}>Remove</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="New player name"
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <Text style={styles.hint}>Loading…</Text>
      ) : players.length === 0 ? (
        <Text style={styles.hint}>No players yet. Add one above.</Text>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  addRow: { flexDirection: 'row', padding: 16, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8ece8' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  addBtn: { justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#1a472a', borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  list: { padding: 12, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  playerName: { fontSize: 18, fontWeight: '600', color: '#1a1a1a' },
  deleteBtn: { padding: 8 },
  deleteText: { color: '#c53030', fontSize: 14 },
  hint: { padding: 24, textAlign: 'center', color: '#666', fontSize: 16 },
});
