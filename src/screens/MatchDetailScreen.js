import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { getMatchWithDetails, updateMatch, getSetScoresForMatch } from '../db/database';

const TODAY = new Date().toISOString().slice(0, 10);

export default function MatchDetailScreen({ route, navigation }) {
  const { matchId } = route.params || {};
  const [detail, setDetail] = useState(null);
  const [datePlayed, setDatePlayed] = useState('');
  const [sets, setSets] = useState([{ gamesPlayer1: '', gamesPlayer2: '' }]);
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
      const existingSets = await getSetScoresForMatch(matchId);
      if (existingSets.length) {
        setSets(
          existingSets.map((s) => ({
            gamesPlayer1: s.games_player1,
            gamesPlayer2: s.games_player2,
          }))
        );
      } else {
        setSets([{ gamesPlayer1: '', gamesPlayer2: '' }]);
      }
    }
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (detail?.date_played) setDatePlayed(detail.date_played);
    if (detail?.remarks != null) setRemarks(detail.remarks || '');
    if (detail?.images?.length) setImages(detail.images);
  }, [detail]);

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
        const uris = result.assets.map((a) => a.uri);
        setImages((prev) => [...prev, ...uris]);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not pick image');
    }
  }, []);

  const removeImage = useCallback((index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const getSetNums = () => {
    return sets.map((s) => {
      const a = s.gamesPlayer1 === '' ? 0 : (typeof s.gamesPlayer1 === 'number' ? s.gamesPlayer1 : parseInt(String(s.gamesPlayer1), 10));
      const b = s.gamesPlayer2 === '' ? 0 : (typeof s.gamesPlayer2 === 'number' ? s.gamesPlayer2 : parseInt(String(s.gamesPlayer2), 10));
      return { gamesPlayer1: Number.isInteger(a) ? a : 0, gamesPlayer2: Number.isInteger(b) ? b : 0 };
    });
  };

  const handleSave = useCallback(async () => {
    if (!matchId) return;
    const parsed = getSetNums();
    const valid = parsed.filter((s) => s.gamesPlayer1 > 0 || s.gamesPlayer2 > 0);
    if (valid.length > 0) {
      const p1Sets = valid.filter((s) => s.gamesPlayer1 > s.gamesPlayer2).length;
      const p2Sets = valid.filter((s) => s.gamesPlayer2 > s.gamesPlayer1).length;
      if (p1Sets === p2Sets) {
        Alert.alert('No winner', 'One player must win more sets than the other, or leave scores empty.');
        return;
      }
    }
    setSaving(true);
    try {
      await updateMatch(matchId, {
        datePlayed: datePlayed || '',
        setScores: valid,
        remarks: remarks.trim() || null,
        images: images.length ? images : null,
      });
      Alert.alert('Saved', 'Match updated.');
      load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [matchId, datePlayed, sets, remarks, images]);

  if (!detail) {
    return <Text style={styles.loading}>Loading…</Text>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.vs}>
          {detail.player1_name} vs {detail.player2_name}
        </Text>
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
            <TextInput
              style={styles.setInput}
              keyboardType="number-pad"
              maxLength={2}
              value={String(set.gamesPlayer1)}
              onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateSet(i, 'gamesPlayer1', t === '' ? '' : t)}
              placeholder={detail.player1_name?.slice(0, 4) || 'P1'}
              placeholderTextColor="#999"
            />
            <Text style={styles.dash}>–</Text>
            <TextInput
              style={styles.setInput}
              keyboardType="number-pad"
              maxLength={2}
              value={String(set.gamesPlayer2)}
              onChangeText={(t) => (t === '' || /^\d+$/.test(t)) && updateSet(i, 'gamesPlayer2', t === '' ? '' : t)}
              placeholder={detail.player2_name?.slice(0, 4) || 'P2'}
              placeholderTextColor="#999"
            />
            {sets.length > 1 && (
              <TouchableOpacity onPress={() => removeSet(i)} style={styles.removeSet}>
                <Text style={styles.removeSetText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Remarks (optional)</Text>
        <TextInput
          style={styles.remarksInput}
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Notes about the match…"
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

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
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
  removeImageBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  removeImageText: { color: '#fff', fontSize: 14 },
  saveBtn: { backgroundColor: '#1a472a', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  saveBtnDisabled: { opacity: 0.6 },
});
