import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  createTournament,
  addTournamentParticipant,
  setTournamentDraw,
  getAllPlayers,
} from '../db/database';

const DRAW_SIZES = [4, 8, 16];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function NewTournamentScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [drawSize, setDrawSize] = useState(8);
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [remarks, setRemarks] = useState('');
  const [images, setImages] = useState([]);
  const [players, setPlayers] = useState([]);
  const [participantSlots, setParticipantSlots] = useState([]);
  const [customName, setCustomName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPlayers = useCallback(async () => {
    const list = await getAllPlayers();
    setPlayers(list);
  }, []);

  React.useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const addAppPlayer = useCallback(
    (player) => {
      if (participantSlots.length >= drawSize) return;
      if (participantSlots.some((s) => s.type === 'app' && s.playerId === player.id)) return;
      setParticipantSlots((prev) => [
        ...prev,
        { type: 'app', playerId: player.id, displayName: player.name },
      ]);
    },
    [drawSize, participantSlots.length]
  );

  const addCustomPlayer = useCallback(() => {
    const n = (customName || '').trim();
    if (!n) return;
    if (participantSlots.length >= drawSize) return;
    setParticipantSlots((prev) => [...prev, { type: 'custom', displayName: n }]);
    setCustomName('');
  }, [customName, drawSize, participantSlots.length]);

  const removeSlot = useCallback((index) => {
    setParticipantSlots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveSlot = useCallback((fromIndex, direction) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= participantSlots.length) return;
    setParticipantSlots((prev) => {
      const next = [...prev];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
  }, [participantSlots.length]);

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

  const canProceedToDraw = participantSlots.length === drawSize;

  const getTournamentDetails = useCallback(() => ({
    date: date.trim() || undefined,
    description: description.trim() || undefined,
    remarks: remarks.trim() || undefined,
    images: images.length ? images : undefined,
  }), [date, description, remarks, images]);

  const handleCreateWithRandomDraw = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a tournament name.');
      return;
    }
    if (!canProceedToDraw) {
      Alert.alert('Fill draw', `Add exactly ${drawSize} players.`);
      return;
    }
    setSaving(true);
    try {
      const tournamentId = await createTournament(name.trim(), drawSize, getTournamentDetails());
      const participantIds = [];
      for (let i = 0; i < participantSlots.length; i++) {
        const s = participantSlots[i];
        const id = await addTournamentParticipant(
          tournamentId,
          {
            playerId: s.playerId ?? undefined,
            displayName: s.displayName,
          },
          i
        );
        participantIds.push(id);
      }
      const shuffled = shuffle(participantIds);
      await setTournamentDraw(tournamentId, shuffled);
      setSaving(false);
      navigation.replace('TournamentDetail', { tournamentId, tournamentName: name.trim() });
    } catch (e) {
      setSaving(false);
      Alert.alert('Error', e.message || 'Could not create tournament');
    }
  }, [name, drawSize, participantSlots, canProceedToDraw, navigation, getTournamentDetails]);

  const handleCreateWithManualDraw = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a tournament name.');
      return;
    }
    if (!canProceedToDraw) {
      Alert.alert('Fill draw', `Add exactly ${drawSize} players.`);
      return;
    }
    setSaving(true);
    try {
      const tournamentId = await createTournament(name.trim(), drawSize, getTournamentDetails());
      const participantIds = [];
      for (let i = 0; i < participantSlots.length; i++) {
        const s = participantSlots[i];
        const id = await addTournamentParticipant(
          tournamentId,
          {
            playerId: s.playerId ?? undefined,
            displayName: s.displayName,
          },
          i
        );
        participantIds.push(id);
      }
      await setTournamentDraw(tournamentId, participantIds);
      setSaving(false);
      navigation.replace('TournamentDetail', { tournamentId, tournamentName: name.trim() });
    } catch (e) {
      setSaving(false);
      Alert.alert('Error', e.message || 'Could not create tournament');
    }
  }, [name, drawSize, participantSlots, canProceedToDraw, navigation, getTournamentDetails]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            <Text style={styles.sectionTitle}>Tournament name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Summer Cup 2025"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <Text style={styles.sectionTitle}>Draw size</Text>
            <View style={styles.chipRow}>
              {DRAW_SIZES.map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[styles.chip, drawSize === size && styles.chipSelected]}
                  onPress={() => setDrawSize(size)}
                >
                  <Text style={[styles.chipText, drawSize === size && styles.chipTextSelected]}>{size}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sectionTitle}>Date (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#999"
              value={date}
              onChangeText={setDate}
            />
            <Text style={styles.sectionTitle}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. Club championship"
              placeholderTextColor="#999"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
            />
            <Text style={styles.sectionTitle}>Remarks (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Notes about this tournament"
              placeholderTextColor="#999"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              numberOfLines={2}
            />
            <Text style={styles.sectionTitle}>Photo (optional)</Text>
            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickImage}>
              <Text style={styles.addPhotoBtnText}>+ Add photo</Text>
            </TouchableOpacity>
            {images.length > 0 && (
              <View style={styles.imageRow}>
                {images.map((uri, idx) => (
                  <View key={idx} style={styles.imageWrap}>
                    <Image source={{ uri }} style={styles.thumb} />
                    <TouchableOpacity style={styles.removeThumb} onPress={() => removeImage(idx)}>
                      <Text style={styles.removeThumbText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, !name.trim() && styles.primaryBtnDisabled]}
              onPress={() => name.trim() && setStep(2)}
              disabled={!name.trim()}
            >
              <Text style={styles.primaryBtnText}>Next: Add players</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.sectionTitle}>Players ({participantSlots.length} / {drawSize})</Text>
            <Text style={styles.hint}>Add from your players or type a name for others.</Text>
            <View style={styles.chipRow}>
              {players.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.chip,
                    participantSlots.some((s) => s.type === 'app' && s.playerId === p.id) && styles.chipSelected,
                  ]}
                  onPress={() => addAppPlayer(p)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      participantSlots.some((s) => s.type === 'app' && s.playerId === p.id) && styles.chipTextSelected,
                    ]}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.customRow}>
              <TextInput
                style={styles.customInput}
                placeholder="Custom name"
                placeholderTextColor="#999"
                value={customName}
                onChangeText={setCustomName}
                onSubmitEditing={addCustomPlayer}
              />
              <TouchableOpacity style={styles.addCustomBtn} onPress={addCustomPlayer}>
                <Text style={styles.addCustomBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.slotList}>
              {participantSlots.map((s, i) => (
                <View key={i} style={styles.slotRow}>
                  <Text style={styles.slotIndex}>{i + 1}.</Text>
                  <Text style={styles.slotName} numberOfLines={1}>{s.displayName}</Text>
                  <View style={styles.slotActions}>
                    {i > 0 && (
                      <TouchableOpacity onPress={() => moveSlot(i, -1)} style={styles.smallBtn}>
                        <Text style={styles.smallBtnText}>↑</Text>
                      </TouchableOpacity>
                    )}
                    {i < participantSlots.length - 1 && (
                      <TouchableOpacity onPress={() => moveSlot(i, 1)} style={styles.smallBtn}>
                        <Text style={styles.smallBtnText}>↓</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => removeSlot(i)} style={styles.removeBtn}>
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.rowBtns}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(1)}>
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, !canProceedToDraw && styles.primaryBtnDisabled]}
                onPress={() => canProceedToDraw && setStep(3)}
                disabled={!canProceedToDraw}
              >
                <Text style={styles.primaryBtnText}>Next: Set draw</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.sectionTitle}>Set draw</Text>
            <Text style={styles.hint}>
              Order above is slot 1–{drawSize}. Randomize or keep order and start.
            </Text>
            <View style={styles.drawBtns}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleCreateWithRandomDraw}
                disabled={saving}
              >
                <Text style={styles.primaryBtnText}>{saving ? 'Creating…' : 'Random draw & start'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleCreateWithManualDraw}
                disabled={saving}
              >
                <Text style={styles.secondaryBtnText}>Keep order & start</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.backLink} onPress={() => setStep(2)}>
              <Text style={styles.backLinkText}>← Back to players</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1a472a', marginTop: 16, marginBottom: 8 },
  hint: { fontSize: 13, color: '#666', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
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
  primaryBtn: {
    backgroundColor: '#1a472a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    backgroundColor: '#e8ece8',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryBtnText: { color: '#1a472a', fontWeight: '600', fontSize: 16 },
  rowBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  customRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c8d4c8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
  },
  addCustomBtn: { backgroundColor: '#1a472a', paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center' },
  addCustomBtnText: { color: '#fff', fontWeight: '600' },
  slotList: { marginTop: 8, marginBottom: 8 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#c9a227',
  },
  slotIndex: { width: 28, fontSize: 14, color: '#666' },
  slotName: { flex: 1, fontSize: 15, color: '#1a1a1a' },
  slotActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallBtn: { padding: 6 },
  smallBtnText: { fontSize: 14, color: '#1a472a' },
  removeBtn: { padding: 6 },
  removeBtnText: { fontSize: 14, color: '#c00' },
  drawBtns: { marginTop: 16 },
  backLink: { marginTop: 20, alignItems: 'center' },
  backLinkText: { fontSize: 14, color: '#1a472a' },
  textArea: { minHeight: 56, textAlignVertical: 'top' },
  addPhotoBtn: {
    backgroundColor: '#e8ece8',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#c8d4c8',
  },
  addPhotoBtnText: { color: '#1a472a', fontWeight: '600', fontSize: 14 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  imageWrap: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  removeThumb: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#c00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeThumbText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
