import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { getMatchWithDetails, updateMatch, getSetScoresForMatch, getMatchByPlayersAndDate, deleteMatch } from '../db/database';
import { gamesInValidRange, setNeedsTiebreak, isSetValidForSave, isSetComplete } from '../utils/tennisScoring';

const TODAY = new Date().toISOString().slice(0, 10);

export default function MatchDetailScreen({ route, navigation }) {
  const { matchId } = route.params || {};
  const [detail, setDetail] = useState(null);
  const [datePlayed, setDatePlayed] = useState('');
  const [sets, setSets] = useState([{ gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' }]);
  const [remarks, setRemarks] = useState('');
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!matchId) return;
    const d = await getMatchWithDetails(matchId);
    setDetail(d);
    if (d) {
      setDatePlayed(d.date_played || TODAY);
      setRemarks(d.remarks || '');
      setImages(d.images || []);
      const existing = await getSetScoresForMatch(matchId);
      if (existing.length > 0) {
        setSets(
          existing.map((s) => ({
            gamesPlayer1: String(s.games_player1 ?? ''),
            gamesPlayer2: String(s.games_player2 ?? ''),
            tiebreakPlayer1: s.tiebreak_player1 != null ? String(s.tiebreak_player1) : '',
            tiebreakPlayer2: s.tiebreak_player2 != null ? String(s.tiebreak_player2) : '',
          }))
        );
      } else {
        setSets([{ gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' }]);
      }
    }
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const addSet = useCallback(() => {
    setSets((s) => [...s, { gamesPlayer1: '', gamesPlayer2: '', tiebreakPlayer1: '', tiebreakPlayer2: '' }]);
  }, []);

  const removeSet = useCallback((index) => {
    setSets((s) => s.filter((_, i) => i !== index));
  }, []);

  const updateSet = useCallback((index, field, value) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    setSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'gamesPlayer1' || field === 'gamesPlayer2') {
        const g = parseInt(value, 10);
        if (Number.isInteger(g) && g > 7) next[index][field] = '7';
      }
      return next;
    });
  }, []);

  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to photos to add images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) {
        setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not pick image');
    }
  }, []);

  const removeImage = useCallback((index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const getValidSets = useCallback(() => {
    return sets
      .map((s) => {
        const a = s.gamesPlayer1 === '' ? null : parseInt(s.gamesPlayer1, 10);
        const b = s.gamesPlayer2 === '' ? null : parseInt(s.gamesPlayer2, 10);
        if (a == null || b == null || !Number.isInteger(a) || !Number.isInteger(b)) return null;
        if (!gamesInValidRange(a, b)) return null;
        const tb1 = s.tiebreakPlayer1 === '' ? undefined : s.tiebreakPlayer1;
        const tb2 = s.tiebreakPlayer2 === '' ? undefined : s.tiebreakPlayer2;
        return {
          gamesPlayer1: a,
          gamesPlayer2: b,
          tiebreakPlayer1: tb1,
          tiebreakPlayer2: tb2,
        };
      })
      .filter((s) => s != null && (s.gamesPlayer1 > 0 || s.gamesPlayer2 > 0));
  }, [sets]);

  const handleSave = useCallback(async () => {
    if (!matchId) return;
    const validSets = getValidSets();
    if (validSets.length === 0) {
      Alert.alert('Add at least one set', 'Games must be 0–7. For 7–6 or 6–7 add tiebreak score.');
      return;
    }
    for (let i = 0; i < validSets.length; i++) {
      const s = sets[i];
      if (!isSetValidForSave(s.gamesPlayer1, s.gamesPlayer2, s.tiebreakPlayer1, s.tiebreakPlayer2)) {
        Alert.alert(
          'Invalid set score',
          setNeedsTiebreak(parseInt(s.gamesPlayer1, 10), parseInt(s.gamesPlayer2, 10))
            ? 'Set 7–6 or 6–7 requires a tiebreak score (e.g. 7–4).'
            : 'Use valid tennis set scores: 6–0 to 7–5, or 7–6/6–7 with tiebreak.'
        );
        return;
      }
    }
    const completedSets = validSets.filter((s) =>
      isSetComplete(s.gamesPlayer1, s.gamesPlayer2, s.tiebreakPlayer1, s.tiebreakPlayer2)
    );
    if (completedSets.length > 0) {
      const p1Sets = completedSets.filter((s) => s.gamesPlayer1 > s.gamesPlayer2).length;
      const p2Sets = completedSets.filter((s) => s.gamesPlayer2 > s.gamesPlayer1).length;
      if (p1Sets === p2Sets) {
        Alert.alert('No winner', 'One player must win more completed sets than the other.');
        return;
      }
    }

    const dateStr = (datePlayed.trim() || '').slice(0, 10);
    const payload = {
      datePlayed: datePlayed.trim() || '',
      setScores: validSets,
      remarks: remarks.trim() || null,
      images: images.length ? images : null,
    };

    const performSaveCurrent = async () => {
      setSaving(true);
      try {
        await updateMatch(matchId, payload);
        navigation.goBack();
      } catch (e) {
        Alert.alert('Error', e.message || 'Could not save');
      } finally {
        setSaving(false);
      }
    };

    const performReplace = async (existingMatchId) => {
      setSaving(true);
      try {
        await updateMatch(existingMatchId, payload);
        await deleteMatch(matchId);
        navigation.goBack();
      } catch (e) {
        Alert.alert('Error', e.message || 'Could not save');
      } finally {
        setSaving(false);
      }
    };

    if (dateStr && detail?.player1_id != null && detail?.player2_id != null) {
      const existing = await getMatchByPlayersAndDate(detail.player1_id, detail.player2_id, dateStr);
      if (existing && existing.id !== matchId) {
        Alert.alert(
          'Date already added',
          'This date is already added for this matchup. Do you want to replace the existing entry or add as a separate one?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Replace', onPress: () => performReplace(existing.id) },
            { text: 'Add', onPress: () => performSaveCurrent() },
          ]
        );
        return;
      }
    }

    await performSaveCurrent();
  }, [matchId, datePlayed, sets, remarks, images, getValidSets, navigation, detail]);

  if (!detail) {
    return <Text style={styles.loading}>Loading…</Text>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.vs}>
          {detail.player1_name} vs {detail.player2_name}
        </Text>
        <Text style={styles.subtitle}>Edit date, set scores, remarks and photos</Text>
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
          <Text style={styles.label}>Set scores (games 0–7)</Text>
          <TouchableOpacity onPress={addSet} style={styles.addSetLink}>
            <Text style={styles.addSetLinkText}>+ Add set</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.setHint}>7–6 or 6–7 requires tiebreak. Incomplete sets are saved but not counted in W/L.</Text>
        {sets.map((set, i) => {
          const g1 = set.gamesPlayer1 === '' ? null : parseInt(set.gamesPlayer1, 10);
          const g2 = set.gamesPlayer2 === '' ? null : parseInt(set.gamesPlayer2, 10);
          const needsTiebreak = Number.isInteger(g1) && Number.isInteger(g2) && setNeedsTiebreak(g1, g2);
          return (
            <View key={i} style={styles.setBlock}>
              <View style={styles.setRow}>
                <Text style={styles.setNum}>Set {i + 1}</Text>
                <TextInput
                  style={styles.setInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={set.gamesPlayer1}
                  onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateSet(i, 'gamesPlayer1', t)}
                  placeholder={detail.player1_name?.slice(0, 4) || 'P1'}
                  placeholderTextColor="#999"
                />
                <Text style={styles.dash}>–</Text>
                <TextInput
                  style={styles.setInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={set.gamesPlayer2}
                  onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateSet(i, 'gamesPlayer2', t)}
                  placeholder={detail.player2_name?.slice(0, 4) || 'P2'}
                  placeholderTextColor="#999"
                />
                {sets.length > 1 && (
                  <TouchableOpacity onPress={() => removeSet(i)} style={styles.removeSet}>
                    <Text style={styles.removeSetText}>✕</Text>
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
                    onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateSet(i, 'tiebreakPlayer1', t)}
                    placeholder="7"
                    placeholderTextColor="#999"
                  />
                  <Text style={styles.dash}>–</Text>
                  <TextInput
                    style={styles.tiebreakInput}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={set.tiebreakPlayer2}
                    onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateSet(i, 'tiebreakPlayer2', t)}
                    placeholder="4"
                    placeholderTextColor="#999"
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Remarks (optional)</Text>
        <TextInput
          style={styles.remarksInput}
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Notes about this day…"
          placeholderTextColor="#999"
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Photos (optional)</Text>
        <TouchableOpacity style={styles.addPhotoBtn} onPress={pickImage}>
          <Text style={styles.addPhotoText}>+ Add photo</Text>
        </TouchableOpacity>
        {images.length > 0 && (
          <View style={styles.imageRow}>
            {images.map((uri, i) => (
              <View key={i} style={styles.imageWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(i)}>
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save & back to match list'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  content: { padding: 16, paddingBottom: 40 },
  loading: { padding: 24, textAlign: 'center', color: '#666' },
  header: { marginBottom: 20 },
  vs: { fontSize: 22, fontWeight: '700', color: '#1a472a', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 4 },
  section: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  dateInput: {
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  setHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  addSetLink: { padding: 8 },
  addSetLinkText: { color: '#1a472a', fontWeight: '600', fontSize: 14 },
  setHint: { fontSize: 12, color: '#666', marginBottom: 10 },
  setBlock: { marginBottom: 12 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  setNum: { width: 44, fontSize: 14, color: '#666' },
  tiebreakRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 52, gap: 8, marginBottom: 4 },
  tiebreakLabel: { width: 56, fontSize: 12, color: '#888' },
  tiebreakInput: {
    width: 44,
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    textAlign: 'center',
  },
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
  remarksInput: {
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  addPhotoBtn: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#1a472a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addPhotoText: { color: '#1a472a', fontWeight: '600', fontSize: 15 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  imageWrap: { position: 'relative' },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: { color: '#fff', fontSize: 14 },
  saveBtn: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  saveBtnDisabled: { opacity: 0.6 },
});
