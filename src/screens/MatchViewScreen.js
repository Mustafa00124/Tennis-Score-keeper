import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMatchWithDetails } from '../db/database';
import { setNeedsTiebreak } from '../utils/tennisScoring';

/** Format one set for display: "6-4" or "7-6(4)" */
function formatSetScore(s) {
  if (!s || s.games_player1 == null || s.games_player2 == null) return '';
  const g1 = Number(s.games_player1);
  const g2 = Number(s.games_player2);
  if (setNeedsTiebreak(g1, g2) && (s.tiebreak_player1 != null || s.tiebreak_player2 != null)) {
    const tb = g1 > g2 ? s.tiebreak_player1 : s.tiebreak_player2;
    return `${Math.max(g1, g2)}-${Math.min(g1, g2)}${tb != null && tb !== '' ? `(${tb})` : ''}`;
  }
  return `${g1}-${g2}`;
}

/** Full set scores string e.g. "6-4 6-3 7-6(4)" */
function formatAllSets(sets) {
  if (!sets || !sets.length) return '—';
  return sets.map(formatSetScore).filter(Boolean).join(' ');
}

export default function MatchViewScreen({ route, navigation }) {
  const { matchId } = route.params || {};
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    if (!matchId) return;
    const d = await getMatchWithDetails(matchId);
    setDetail(d);
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const goToEdit = useCallback(() => {
    navigation.navigate('MatchDetail', { matchId });
  }, [navigation, matchId]);

  if (!matchId) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Invalid match</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }

  const setScoresStr = formatAllSets(detail.sets);
  const dateLabel = detail.date_played || 'No date';
  const remarks = (detail.remarks || '').trim();
  const images = detail.images && Array.isArray(detail.images) ? detail.images : [];

  return (
    <ImageBackground
      source={require('../../media/Matchups.jpg')}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.backgroundOverlay} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.vs}>{detail.player1_name} vs {detail.player2_name}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Set scores</Text>
          <Text style={styles.setScores}>{setScoresStr}</Text>
        </View>

        {remarks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Remarks</Text>
            <Text style={styles.remarks}>{remarks}</Text>
          </View>
        )}

        {images.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Photos</Text>
            <View style={styles.imageGrid}>
              {images.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.thumb} />
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.editBtn} onPress={goToEdit} activeOpacity={0.8}>
          <Text style={styles.editBtnText}>Edit match</Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loading: { fontSize: 16, color: 'rgba(255,255,255,0.9)' },
  hint: { fontSize: 16, color: '#666' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  vs: { fontSize: 22, fontWeight: '700', color: '#1a472a', textAlign: 'center' },
  date: { fontSize: 15, color: '#555', textAlign: 'center', marginTop: 6 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#5a6a5a', marginBottom: 8, textTransform: 'uppercase' },
  setScores: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', letterSpacing: 0.5 },
  remarks: { fontSize: 15, color: '#444', fontStyle: 'italic', lineHeight: 22 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 96, height: 96, borderRadius: 12 },
  editBtn: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  editBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
