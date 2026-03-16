import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  getMatchesForPlayer,
  getPlayerStats,
  getMatchResult,
  getPlayerById,
  updatePlayer,
} from '../db/database';

const RACKET_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Pro'];

export default function PlayerDetailScreen({ route, navigation }) {
  const { playerId } = route.params || {};
  const autoOpenedEditRef = useRef(false);
  const [player, setPlayer] = useState(null);
  const [matches, setMatches] = useState([]);
  const [stats, setStats] = useState(null);
  const [editVisible, setEditVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formRacketLevel, setFormRacketLevel] = useState('');
  const [formProfileImage, setFormProfileImage] = useState('');

  const load = useCallback(async () => {
    if (!playerId) return;
    const [profile, matchList, playerStats] = await Promise.all([
      getPlayerById(playerId),
      getMatchesForPlayer(playerId),
      getPlayerStats(playerId),
    ]);
    const rows = await Promise.all(
      matchList.map(async (m) => ({ ...m, result: await getMatchResult(m.id) }))
    );
    setPlayer(profile);
    setMatches(rows);
    setStats(playerStats);
    if (profile?.name) {
      navigation.setParams?.({ playerName: profile.name });
    }
  }, [playerId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openEdit = useCallback(() => {
    if (!player) return;
    setFormName(player.name || '');
    setFormDescription(player.description || '');
    setFormStartDate(player.start_date || '');
    setFormRacketLevel(player.racket_level || '');
    setFormProfileImage(player.profile_image || '');
    setEditVisible(true);
  }, [player]);

  useEffect(() => {
    if (route.params?.editMode && player && !autoOpenedEditRef.current) {
      autoOpenedEditRef.current = true;
      openEdit();
    }
  }, [route.params?.editMode, player, openEdit]);

  const pickProfileImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo access to pick a profile image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setFormProfileImage(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not pick image');
    }
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!playerId) return;
    if (!formName.trim()) {
      Alert.alert('Missing name', 'Player name is required.');
      return;
    }
    setSaving(true);
    try {
      await updatePlayer(playerId, {
        name: formName,
        profileImage: formProfileImage || null,
        description: formDescription,
        startDate: formStartDate,
        racketLevel: formRacketLevel,
      });
      setEditVisible(false);
      navigation.setParams?.({ playerName: formName.trim(), editMode: false });
      await load();
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A player with this name already exists.');
      } else {
        Alert.alert('Error', e.message || 'Could not update player');
      }
    } finally {
      setSaving(false);
    }
  }, [playerId, formName, formProfileImage, formDescription, formStartDate, formRacketLevel, navigation, load]);

  if (!playerId) {
    return <Text style={styles.hint}>Invalid player</Text>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.profileHeader}>
          <ProfileAvatar uri={player?.profile_image} name={player?.name} size={92} />
          <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.name}>{player?.name || route.params?.playerName || 'Player'}</Text>
        <Text style={styles.description}>
          {player?.description?.trim() || 'No description yet.'}
        </Text>
        <View style={styles.metaRow}>
          <MetaPill label="Start date" value={player?.start_date || 'Not set'} />
          <MetaPill label="Racket level" value={player?.racket_level || 'Not set'} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Stats</Text>
        {stats && (
          <View style={styles.table}>
            <StatRow label="Recorded matches" value={stats.recordedMatches ?? 0} />
            <StatRow label="Total unique players" value={stats.totalUniquePlayers ?? 0} />
            <StatRow
              label="Most played with"
              value={
                stats.mostPlayedWith
                  ? `${stats.mostPlayedWith.name} (${stats.mostPlayedWith.matches})`
                  : 'No data'
              }
            />
            <StatRow label="Wins / Losses" value={`${stats.wins} / ${stats.losses}`} />
            <StatRow label="Win rate" value={`${stats.winPercentage.toFixed(1)}%`} />
            <StatRow label="Current win streak" value={stats.currentWinStreak ?? 0} />
            <StatRow label="Best win streak" value={stats.bestWinStreak ?? 0} />
            <StatRow label="Bagels served (6–0)" value={stats.bagelsServed ?? 0} />
            <StatRow label="Breadsticks (6–1)" value={stats.breadsticksServed ?? 0} />
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Match history</Text>
        {matches.length === 0 ? (
          <Text style={styles.hint}>No matches yet.</Text>
        ) : (
          matches.map((item) => {
            const opponent = item.player1_id === playerId ? item.player2_name : item.player1_name;
            const isPlayer1 = item.player1_id === playerId;
            return (
              <MatchRow
                key={item.id}
                match={item}
                opponent={opponent}
                isPlayer1={isPlayer1}
                playerId={playerId}
                onPress={() => navigation.navigate('MatchDetail', { matchId: item.id })}
              />
            );
          })
        )}
      </View>

      <Modal visible={editVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit player</Text>
            <View style={styles.profileEditRow}>
              <ProfileAvatar uri={formProfileImage} name={formName} size={72} />
              <View style={styles.profileEditActions}>
                <TouchableOpacity style={styles.imageBtn} onPress={pickProfileImage}>
                  <Text style={styles.imageBtnText}>Choose photo</Text>
                </TouchableOpacity>
                {formProfileImage ? (
                  <TouchableOpacity
                    style={[styles.imageBtn, styles.imageBtnSecondary]}
                    onPress={() => setFormProfileImage('')}
                  >
                    <Text style={styles.imageBtnSecondaryText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="Player name"
              placeholderTextColor="#999"
              autoCapitalize="words"
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={styles.textArea}
              value={formDescription}
              onChangeText={setFormDescription}
              placeholder="Short bio, strengths, notes..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.inputLabel}>Start date</Text>
            <TextInput
              style={styles.input}
              value={formStartDate}
              onChangeText={setFormStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#999"
            />

            <Text style={styles.inputLabel}>Racket level</Text>
            <View style={styles.levelRow}>
              {RACKET_LEVELS.map((lvl) => (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.levelChip, formRacketLevel === lvl && styles.levelChipActive]}
                  onPress={() => setFormRacketLevel(lvl)}
                >
                  <Text style={[styles.levelChipText, formRacketLevel === lvl && styles.levelChipTextActive]}>
                    {lvl}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setEditVisible(false)}>
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, saving && styles.modalBtnDisabled]} onPress={handleSaveProfile} disabled={saving}>
                <Text style={styles.modalBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function ProfileAvatar({ uri, name, size }) {
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{initials || '?'}</Text>
    </View>
  );
}

function MetaPill({ label, value }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function StatRow({ label, value }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function MatchRow({ match, opponent, isPlayer1, playerId, onPress }) {
  const result = match.result;
  if (!result) {
    return (
      <TouchableOpacity style={styles.matchRow} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.matchText}>No score yet vs {opponent}</Text>
        <Text style={styles.matchDate}>{match.date_played || 'No date'}</Text>
      </TouchableOpacity>
    );
  }
  const won = result.winnerId === playerId;
  const setsFor = isPlayer1 ? result.setsPlayer1 : result.setsPlayer2;
  const setsAgainst = isPlayer1 ? result.setsPlayer2 : result.setsPlayer1;
  const scoreStr = `${setsFor}-${setsAgainst}`;

  return (
    <TouchableOpacity style={[styles.matchRow, won && styles.matchRowWin]} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.matchText}>
        {won ? 'W' : 'L'} {scoreStr} vs {opponent}
      </Text>
      <Text style={styles.matchDate}>{match.date_played || 'No date'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 12,
  },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  avatarFallback: { backgroundColor: '#e2ebdf', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#1a472a' },
  editBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#1a472a' },
  editBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  name: { fontSize: 24, fontWeight: '700', color: '#1a472a', marginBottom: 8 },
  description: { fontSize: 14, lineHeight: 20, color: '#444', marginBottom: 14 },
  metaRow: { flexDirection: 'row', gap: 10 },
  metaPill: { flex: 1, backgroundColor: '#f4f8f3', borderRadius: 12, padding: 10 },
  metaLabel: { fontSize: 11, color: '#5a6a5a', marginBottom: 4, textTransform: 'uppercase' },
  metaValue: { fontSize: 14, color: '#1a1a1a', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 10 },
  table: { borderWidth: 1, borderColor: '#dde6db', borderRadius: 12, overflow: 'hidden' },
  statRow: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#edf2ec',
  },
  statLabel: { fontSize: 14, color: '#444' },
  statValue: { fontSize: 14, color: '#1a1a1a', fontWeight: '700' },
  matchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#cfd9cc',
  },
  matchRowWin: { borderLeftColor: '#1a472a' },
  matchText: { fontSize: 15, color: '#1a1a1a', flex: 1, paddingRight: 8 },
  matchDate: { fontSize: 13, color: '#666' },
  hint: { padding: 24, textAlign: 'center', color: '#666' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  profileEditRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 14 },
  profileEditActions: { flex: 1, gap: 8 },
  imageBtn: { backgroundColor: '#1a472a', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  imageBtnText: { color: '#fff', fontWeight: '700' },
  imageBtnSecondary: { backgroundColor: '#efefef' },
  imageBtnSecondaryText: { color: '#444', fontWeight: '600' },
  inputLabel: { fontSize: 13, color: '#555', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    color: '#1a1a1a',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    color: '#1a1a1a',
    minHeight: 74,
    textAlignVertical: 'top',
  },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  levelChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#efefef' },
  levelChipActive: { backgroundColor: '#e0ebde', borderWidth: 1, borderColor: '#1a472a' },
  levelChipText: { fontSize: 13, color: '#555' },
  levelChipTextActive: { color: '#1a472a', fontWeight: '700' },
  modalButtons: { flexDirection: 'row', marginTop: 20, gap: 10 },
  modalBtn: { flex: 1, backgroundColor: '#1a472a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalBtnSecondary: { flex: 1, backgroundColor: '#efefef', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnSecondaryText: { color: '#444', fontWeight: '600', fontSize: 16 },
  modalBtnDisabled: { opacity: 0.6 },
});
