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
const ROUND_ROBIN_MAX_PLAYERS = 50;
const FORMAT_KNOCKOUT = 'knockout';
const FORMAT_ROUND_ROBIN = 'round_robin';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function NewTournamentScreen({ navigation, route, onDismiss, onSuccess }) {
  const params = route?.params ?? {};
  const fromModal = params.name != null && params.format != null;
  const [step, setStep] = useState(fromModal ? 1 : 1);
  const [name, setName] = useState(fromModal ? (params.name || '') : '');
  const [format, setFormat] = useState(params.format === 'round_robin' ? FORMAT_ROUND_ROBIN : FORMAT_KNOCKOUT);
  const [drawSize, setDrawSize] = useState(8);
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
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

  const maxPlayers = format === FORMAT_KNOCKOUT ? drawSize : ROUND_ROBIN_MAX_PLAYERS;
  const addAppPlayer = useCallback(
    (player) => {
      if (participantSlots.length >= maxPlayers) return;
      if (participantSlots.some((s) => s.type === 'app' && s.playerId === player.id)) return;
      setParticipantSlots((prev) => [
        ...prev,
        { type: 'app', playerId: player.id, displayName: player.name },
      ]);
    },
    [maxPlayers, participantSlots.length]
  );

  const addCustomPlayer = useCallback(() => {
    const n = (customName || '').trim();
    if (!n) return;
    if (participantSlots.length >= maxPlayers) return;
    setParticipantSlots((prev) => [...prev, { type: 'custom', displayName: n }]);
    setCustomName('');
  }, [customName, maxPlayers, participantSlots.length]);

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
        mediaTypes: ['images'],
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

  const canProceedToDraw =
    format === FORMAT_KNOCKOUT
      ? participantSlots.length === drawSize
      : participantSlots.length >= 2;

  const getTournamentDetails = useCallback(() => ({
    date: date.trim() || undefined,
    description: description.trim() || undefined,
    images: images.length ? images : undefined,
  }), [date, description, images]);

  const createOpts = useCallback(
    () => ({
      ...getTournamentDetails(),
      format: format === FORMAT_ROUND_ROBIN ? 'round_robin' : undefined,
    }),
    [getTournamentDetails, format]
  );

  const participantCount = format === FORMAT_ROUND_ROBIN ? participantSlots.length : drawSize;

  const handleCreateWithRandomDraw = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a tournament name.');
      return;
    }
    if (!canProceedToDraw) {
      Alert.alert(
        'Fill draw',
        format === FORMAT_KNOCKOUT ? `Add exactly ${drawSize} players.` : 'Add at least 2 players.'
      );
      return;
    }
    setSaving(true);
    try {
      const tournamentId = await createTournament(name.trim(), participantCount, createOpts());
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
      const order = format === FORMAT_KNOCKOUT ? shuffle(participantIds) : participantIds;
      await setTournamentDraw(tournamentId, order);
      setSaving(false);
      if (onSuccess) onSuccess(tournamentId, name.trim());
      else navigation?.replace?.('TournamentDetail', { tournamentId, tournamentName: name.trim() });
    } catch (e) {
      setSaving(false);
      Alert.alert('Error', e.message || 'Could not create tournament');
    }
  }, [name, drawSize, format, participantSlots, participantCount, canProceedToDraw, navigation, createOpts, onSuccess]);

  const handleCreateWithManualDraw = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a tournament name.');
      return;
    }
    if (!canProceedToDraw) {
      Alert.alert(
        'Fill draw',
        format === FORMAT_KNOCKOUT ? `Add exactly ${drawSize} players.` : 'Add at least 2 players.'
      );
      return;
    }
    setSaving(true);
    try {
      const tournamentId = await createTournament(name.trim(), participantCount, createOpts());
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
      if (onSuccess) onSuccess(tournamentId, name.trim());
      else navigation?.replace?.('TournamentDetail', { tournamentId, tournamentName: name.trim() });
    } catch (e) {
      setSaving(false);
      Alert.alert('Error', e.message || 'Could not create tournament');
    }
  }, [name, drawSize, format, participantSlots, participantCount, canProceedToDraw, navigation, createOpts, onSuccess]);

  const handleStartRoundRobin = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a tournament name.');
      return;
    }
    if (!canProceedToDraw) {
      Alert.alert('Fill draw', 'Add at least 2 players.');
      return;
    }
    setSaving(true);
    try {
      const tournamentId = await createTournament(name.trim(), participantSlots.length, createOpts());
      const participantIds = [];
      for (let i = 0; i < participantSlots.length; i++) {
        const s = participantSlots[i];
        const id = await addTournamentParticipant(
          tournamentId,
          { playerId: s.playerId ?? undefined, displayName: s.displayName },
          i
        );
        participantIds.push(id);
      }
      await setTournamentDraw(tournamentId, participantIds);
      setSaving(false);
      if (onSuccess) onSuccess(tournamentId, name.trim());
      else navigation?.replace?.('TournamentDetail', { tournamentId, tournamentName: name.trim() });
    } catch (e) {
      setSaving(false);
      Alert.alert('Error', e.message || 'Could not create tournament');
    }
  }, [name, drawSize, participantSlots, canProceedToDraw, navigation, createOpts, onSuccess]);

  const handleClose = useCallback(() => {
    if (onDismiss) onDismiss();
    else if (navigation?.goBack) navigation.goBack();
  }, [onDismiss, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      {onDismiss != null && (
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>New tournament</Text>
          <TouchableOpacity onPress={handleClose} style={styles.sheetClose} hitSlop={12}>
            <Text style={styles.sheetCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            {!fromModal && (
              <>
                <Text style={styles.sectionTitle}>Tournament name</Text>
                <View style={styles.nameRow}>
                  <TextInput
                    style={[styles.input, styles.nameInput]}
                    placeholder="e.g. Summer Cup 2025"
                    placeholderTextColor="#999"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                  <View style={styles.formatToggle}>
                    <TouchableOpacity
                      style={[styles.toggleSegment, format === FORMAT_KNOCKOUT && styles.toggleSegmentActive]}
                      onPress={() => setFormat(FORMAT_KNOCKOUT)}
                    >
                      <Text style={[styles.toggleText, format === FORMAT_KNOCKOUT && styles.toggleTextActive]}>Knockout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleSegment, format === FORMAT_ROUND_ROBIN && styles.toggleSegmentActive]}
                      onPress={() => setFormat(FORMAT_ROUND_ROBIN)}
                    >
                      <Text style={[styles.toggleText, format === FORMAT_ROUND_ROBIN && styles.toggleTextActive]}>Round Robin</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
            {fromModal && (
              <Text style={styles.sectionTitle}>{name || 'Tournament'}</Text>
            )}
            {format === FORMAT_KNOCKOUT && (
              <>
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
              </>
            )}
            {format === FORMAT_ROUND_ROBIN && (
              <Text style={styles.hint}>Add players on the next step. Everyone plays everyone once; league table is built from results.</Text>
            )}
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
            <Text style={styles.sectionTitle}>
              {format === FORMAT_KNOCKOUT ? `Players (${participantSlots.length} / ${drawSize})` : `Players (${participantSlots.length})`}
            </Text>
            <Text style={styles.hint}>
              {format === FORMAT_KNOCKOUT
                ? 'Add from your players or type a name for others.'
                : 'Add as many players as you want (min 2). Everyone plays everyone once; league table updates from match results.'}
            </Text>
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
                <Text style={styles.primaryBtnText}>
                  {format === FORMAT_KNOCKOUT ? 'Next: Set draw' : 'Next: Start tournament'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            {format === FORMAT_ROUND_ROBIN ? (
              <>
                <Text style={styles.sectionTitle}>Start round robin</Text>
                <Text style={styles.hint}>
                  All {participantSlots.length} players will play each other once. Tap to start.
                </Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleStartRoundRobin}
                  disabled={saving}
                >
                  <Text style={styles.primaryBtnText}>{saving ? 'Creating…' : 'Start tournament'}</Text>
                </TouchableOpacity>
              </>
            ) : (
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
              </>
            )}
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
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)', backgroundColor: '#fff' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  sheetClose: { padding: 8 },
  sheetCloseText: { fontSize: 22, color: '#666' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1a472a', marginTop: 16, marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  nameInput: { flex: 1, marginBottom: 0 },
  formatToggle: { flexDirection: 'row', backgroundColor: '#e8ece8', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#c8d4c8' },
  toggleSegment: { paddingVertical: 10, paddingHorizontal: 12 },
  toggleSegmentActive: { backgroundColor: '#1a472a' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#555' },
  toggleTextActive: { color: '#fff' },
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
