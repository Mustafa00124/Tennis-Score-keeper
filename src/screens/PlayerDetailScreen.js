import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Image,
  Alert,
  ImageBackground,
  TouchableWithoutFeedback,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  getMatchesForPlayer,
  getPlayerStats,
  getMatchResult,
  getPlayerById,
  updatePlayer,
  deletePlayer,
} from '../db/database';

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
        mediaTypes: ['images'],
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

  const pickAndSaveProfileImage = useCallback(async () => {
    if (!playerId) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo access to pick a profile image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        await updatePlayer(playerId, { profileImage: result.assets[0].uri });
        await load();
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not pick image');
    }
  }, [playerId, load]);

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
  }, [playerId, formName, formProfileImage, formDescription, formStartDate, navigation, load]);

  if (!playerId) {
    return <Text style={styles.hint}>Invalid player</Text>;
  }

  return (
    <ImageBackground
      source={require('../../media/Players.jpg')}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.backgroundOverlay} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.profileHeader}>
          <Pressable
            onPress={pickAndSaveProfileImage}
            style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ProfileAvatar uri={player?.profile_image} name={player?.name} size={92} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
            onPress={openEdit}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>
        <Text style={styles.name}>{player?.name || route.params?.playerName || 'Player'}</Text>
        <Text style={styles.description}>
          {player?.description?.trim() || 'No description yet.'}
        </Text>
        <View style={styles.metaRow}>
          <MetaPill label="Start date" value={player?.start_date || 'Not set'} />
        </View>
        <TouchableOpacity
          style={styles.deletePlayerBtn}
          onPress={() => {
            Alert.alert(
              'Delete player?',
              `Remove ${player?.name || 'this player'} and all their matches? This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => {
                  try {
                    await deletePlayer(playerId);
                    navigation.goBack();
                  } catch (e) {
                    Alert.alert('Error', e.message || 'Could not delete player');
                  }
                }},
              ]
            );
          }}
        >
          <Text style={styles.deletePlayerBtnText}>Delete player</Text>
        </TouchableOpacity>
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
            <StatRow label="Incomplete sets" value={stats.incompleteSets ?? 0} />
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
                onPress={() => navigation.navigate('MatchView', { matchId: item.id })}
              />
            );
          })
        )}
      </View>
      </ScrollView>

      <Modal visible={editVisible} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => setEditVisible(false)}>
            <View style={styles.modalOverlayTouchable} />
          </TouchableWithoutFeedback>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit player</Text>
            <View style={styles.profileEditRow}>
              <Pressable onPress={pickProfileImage} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
                <ProfileAvatar uri={formProfileImage} name={formName} size={72} />
              </Pressable>
              <View style={styles.profileEditActions}>
                <Pressable style={({ pressed }) => [styles.imageBtn, pressed && { opacity: 0.8 }]} onPress={pickProfileImage}>
                  <Text style={styles.imageBtnText}>Choose photo</Text>
                </Pressable>
                {formProfileImage ? (
                  <Pressable
                    style={({ pressed }) => [styles.imageBtn, styles.imageBtnSecondary, pressed && { opacity: 0.8 }]}
                    onPress={() => setFormProfileImage('')}
                  >
                    <Text style={styles.imageBtnSecondaryText}>Remove</Text>
                  </Pressable>
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
    </ImageBackground>
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
  if (!match) return null;
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
  backgroundImage: { flex: 1 },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 12,
  },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  avatarFallback: { backgroundColor: '#e2ebdf', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#1a472a' },
  editBtn: { paddingVertical: 12, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: '#1a472a' },
  editBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  deletePlayerBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(197,48,48,0.12)', alignSelf: 'flex-start' },
  deletePlayerBtnText: { fontSize: 13, fontWeight: '600', color: '#c53030' },
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
    backgroundColor: 'rgba(255,255,255,0.6)',
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
  modalOverlayTouchable: { flex: 1 },
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
  modalButtons: { flexDirection: 'row', marginTop: 20, gap: 10 },
  modalBtn: { flex: 1, backgroundColor: '#1a472a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalBtnSecondary: { flex: 1, backgroundColor: '#efefef', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnSecondaryText: { color: '#444', fontWeight: '600', fontSize: 16 },
  modalBtnDisabled: { opacity: 0.6 },
});
