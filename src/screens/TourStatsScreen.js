import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ImageBackground } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getTourTitlesWon,
  getTourWeeksAtNumberOne,
  getTourPairBracketDetailedStats,
  getTourParticipants,
  getTourSummaryStats,
  getTourFinalsAppearanceCounts,
  getTourClosestH2HPair,
  getTourCareerOpenCompleters,
} from '../db/database';

function formatTourRunning(createdAtIso) {
  if (!createdAtIso) return '—';
  const start = new Date(createdAtIso).getTime();
  if (Number.isNaN(start)) return '—';
  const days = Math.floor((Date.now() - start) / 86400000);
  if (days < 1) return 'Less than a day';
  if (days === 1) return '1 day';
  return `${days} days`;
}

const COLOR_TOUR_P1 = '#93c5fd';
const COLOR_TOUR_P2 = '#fca5a5';

function TourPairStatRow({ label, left, right }) {
  return (
    <View style={styles.pairStatRow}>
      <Text style={styles.pairStatLabel}>{label}</Text>
      <View style={styles.pairStatVals}>
        <Text style={[styles.pairStatP1, { color: COLOR_TOUR_P1 }]}>{left}</Text>
        <Text style={styles.pairStatDash}> – </Text>
        <Text style={[styles.pairStatP2, { color: COLOR_TOUR_P2 }]}>{right}</Text>
      </View>
    </View>
  );
}

function TourPairStatRowSingle({ label, value }) {
  return (
    <View style={styles.pairStatRow}>
      <Text style={styles.pairStatLabel}>{label}</Text>
      <Text style={styles.pairStatSingle}>{value}</Text>
    </View>
  );
}

export default function TourStatsScreen({ route, navigation }) {
  const { tourId, tourName } = route.params || {};
  const insets = useSafeAreaInsets();
  const [titles, setTitles] = useState({});
  const [weeks, setWeeks] = useState([]);
  const [players, setPlayers] = useState([]);
  const [p1, setP1] = useState(null);
  const [p2, setP2] = useState(null);
  const [pairStats, setPairStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [closestPair, setClosestPair] = useState(null);
  const [finalsRows, setFinalsRows] = useState([]);
  const [careerOpen, setCareerOpen] = useState({ totalEvents: 0, completers: [] });

  const load = useCallback(async () => {
    if (!tourId) return;
    const [t, w, plist, sum, finals, close, career] = await Promise.all([
      getTourTitlesWon(tourId),
      getTourWeeksAtNumberOne(tourId),
      getTourParticipants(tourId),
      getTourSummaryStats(tourId),
      getTourFinalsAppearanceCounts(tourId),
      getTourClosestH2HPair(tourId),
      getTourCareerOpenCompleters(tourId),
    ]);
    const titleMap = Object.fromEntries(t.map((x) => [x.player_id, x.titles]));
    setTitles(titleMap);
    setWeeks(w);
    setPlayers(plist);
    setSummary(sum);
    setFinalsRows(finals);
    setClosestPair(close);
    setCareerOpen(career);
  }, [tourId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  React.useEffect(() => {
    if (players.length >= 2 && p1 == null && p2 == null) {
      setP1(players[0].player_id);
      setP2(players[1].player_id);
    }
  }, [players, p1, p2]);

  React.useEffect(() => {
    navigation.setOptions({ title: tourName ? `${tourName} · Stats` : 'Tour stats' });
  }, [navigation, tourName]);

  React.useEffect(() => {
    if (!tourId || p1 == null || p2 == null || p1 === p2) {
      setPairStats(null);
      return;
    }
    let cancelled = false;
    setPairStats(null);
    (async () => {
      const x = await getTourPairBracketDetailedStats(tourId, p1, p2);
      if (!cancelled) setPairStats(x);
    })();
    return () => {
      cancelled = true;
    };
  }, [tourId, p1, p2]);

  const nameById = Object.fromEntries(players.map((p) => [p.player_id, p.player_name]));

  const titleEntries = Object.entries(titles).map(([id, n]) => ({
    player_id: parseInt(id, 10),
    player_name: nameById[parseInt(id, 10)] ?? 'Unknown',
    titles: n,
  }));
  const maxTitles = titleEntries.reduce((m, r) => Math.max(m, r.titles), 0);
  const titleLeaders = titleEntries.filter((r) => r.titles === maxTitles && maxTitles > 0);

  if (!tourId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Missing tour.</Text>
      </View>
    );
  }

  return (
    <ImageBackground source={require('../../media/Tournament.jpg')} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Extra tour analytics. Standings and schedule live on the main tour screen.
        </Text>

        <Text style={styles.h2}>Tour overview</Text>
        <Text style={styles.bodyLine}>Running time: {formatTourRunning(summary?.createdAt)}</Text>
        <Text style={styles.bodyLine}>
          Rolling ranking: standings count the last {summary?.eventCount ?? 0} completed tournament
          {(summary?.eventCount ?? 0) === 1 ? '' : 's'} (N is the number of tournaments on this tour’s schedule).
        </Text>
        <Text style={styles.bodyLine}>
          Schedule: {summary?.eventCount ?? 0} tournament{summary?.eventCount === 1 ? '' : 's'} · {summary?.completedEventCount ?? 0}{' '}
          finished
        </Text>
        <Text style={styles.bodyLine}>Players in tour: {summary?.participantCount ?? 0}</Text>

        <Text style={styles.h2}>Tour records</Text>
        <Text style={styles.sub}>
          Closest head-to-head: smallest gap in tour bracket meetings (tie-break: more matches played).
        </Text>
        {closestPair ? (
          <Text style={styles.recordLine}>
            Closest H2H: {closestPair.player_a_name} {closestPair.wins_a}–{closestPair.losses_a}{' '}
            {closestPair.player_b_name} ({closestPair.played} bracket meeting{closestPair.played === 1 ? '' : 's'})
          </Text>
        ) : (
          <Text style={styles.muted}>No tour bracket head-to-head yet (need at least one meeting).</Text>
        )}

        <Text style={[styles.bodyLine, styles.recordGap]}>Most finals (championship match):</Text>
        {finalsRows.length === 0 ? (
          <Text style={styles.muted}>No finals recorded yet.</Text>
        ) : (
          finalsRows.slice(0, 8).map((row) => (
            <Text key={row.player_id} style={styles.recordLine}>
              {row.player_name}: {row.finals}
            </Text>
          ))
        )}

        <Text style={[styles.bodyLine, styles.recordGap]}>Most tournaments won (titles):</Text>
        {maxTitles === 0 ? (
          <Text style={styles.muted}>No titles yet.</Text>
        ) : (
          titleLeaders.map((r) => (
            <Text key={r.player_id} style={styles.recordLine}>
              {r.player_name}: {r.titles}
            </Text>
          ))
        )}

        <Text style={[styles.bodyLine, styles.recordGap]}>Career Open (played every completed event bracket):</Text>
        {careerOpen.totalEvents === 0 ? (
          <Text style={styles.muted}>No completed events with linked tournaments yet.</Text>
        ) : careerOpen.completers.length === 0 ? (
          <Text style={styles.muted}>
            None yet — need {careerOpen.totalEvents} completed event{careerOpen.totalEvents === 1 ? '' : 's'} with a
            bracket appearance each.
          </Text>
        ) : (
          <>
            <Text style={styles.recordLine}>
              {careerOpen.completers.map((c) => c.player_name).join(', ')} · {careerOpen.totalEvents} event
              {careerOpen.totalEvents === 1 ? '' : 's'}
            </Text>
          </>
        )}

        <Text style={styles.h2}>Titles & weeks at #1</Text>
        <Text style={styles.sub}>
          Each completed tournament counts as one “week” for this stat. After each event, if one player leads the standings alone,
          their weeks-at-#1 count goes up by 1 (ties don’t count).
        </Text>
        {players.length === 0 ? (
          <Text style={styles.muted}>No participants.</Text>
        ) : (
          players.map((p) => (
            <View key={p.player_id} style={styles.statRow}>
              <Text style={styles.statName}>{p.player_name}</Text>
              <Text style={styles.statVal}>
                {titles[p.player_id] ?? 0} titles · {weeks.find((w) => w.player_id === p.player_id)?.weeks_at_one ?? 0} wks at #1
              </Text>
            </View>
          ))
        )}

        <Text style={styles.h2}>Tour head-to-head</Text>
        <Text style={styles.sub}>
          Bracket-only stats across all events in this tour (knockout / round-robin draws). Does not include app match days or
          practice scores.
        </Text>
        {players.length >= 2 ? (
          <>
            <View style={styles.pickerRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {players.map((p) => (
                  <TouchableOpacity
                    key={`a-${p.player_id}`}
                    style={[styles.chip, p1 === p.player_id && styles.chipOn]}
                    onPress={() => setP1(p.player_id)}
                  >
                    <Text style={[styles.chipText, p1 === p.player_id && styles.chipTextOn]}>{p.player_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.pickerRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {players.map((p) => (
                  <TouchableOpacity
                    key={`b-${p.player_id}`}
                    style={[styles.chip, p2 === p.player_id && styles.chipOn]}
                    onPress={() => setP2(p.player_id)}
                  >
                    <Text style={[styles.chipText, p2 === p.player_id && styles.chipTextOn]}>{p.player_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {p1 !== p2 && pairStats === null ? (
              <Text style={[styles.muted, { marginTop: 10 }]}>Loading tour bracket stats…</Text>
            ) : p1 !== p2 && pairStats ? (
              <>
                <Text style={styles.h2hResult}>
                  {nameById[p1]} {pairStats.wins}–{pairStats.losses} {nameById[p2]}
                </Text>
                <Text style={styles.h2hSub}>
                  {pairStats.bracketMeetings} bracket meeting{pairStats.bracketMeetings === 1 ? '' : 's'}
                  {pairStats.metInFinalsCount > 0
                    ? ` · Met in championship ${pairStats.metInFinalsCount} time${pairStats.metInFinalsCount === 1 ? '' : 's'}`
                    : ''}
                </Text>
                {pairStats.bracketMeetings === 0 ? (
                  <Text style={[styles.muted, { marginTop: 8 }]}>No tour bracket meetings between these players yet.</Text>
                ) : (
                  <View style={styles.pairStatsCard}>
                    <Text style={styles.pairStatsLegend}>
                      <Text style={{ color: COLOR_TOUR_P1 }}>■</Text> {nameById[p1]}{'   '}
                      <Text style={{ color: COLOR_TOUR_P2 }}>■</Text> {nameById[p2]}
                    </Text>
                    <TourPairStatRow
                      label="Sets (tour bracket)"
                      left={String(pairStats.setsPlayer1)}
                      right={String(pairStats.setsPlayer2)}
                    />
                    <TourPairStatRow
                      label="Games (tour bracket)"
                      left={String(pairStats.gamesPlayer1)}
                      right={String(pairStats.gamesPlayer2)}
                    />
                    <TourPairStatRow
                      label="Set win %"
                      left={`${(pairStats.setWinPctPlayer1 ?? 0).toFixed(1)}%`}
                      right={`${(pairStats.setWinPctPlayer2 ?? 0).toFixed(1)}%`}
                    />
                    <TourPairStatRow
                      label="Current set win streak"
                      left={String(pairStats.currentWinStreakPlayer1 ?? 0)}
                      right={String(pairStats.currentWinStreakPlayer2 ?? 0)}
                    />
                    <TourPairStatRow
                      label="Best set win streak"
                      left={String(pairStats.bestWinStreakPlayer1 ?? 0)}
                      right={String(pairStats.bestWinStreakPlayer2 ?? 0)}
                    />
                    <TourPairStatRowSingle label="Closest set (smallest margin)" value={pairStats.closestSet ?? '—'} />
                    <TourPairStatRowSingle label="Easiest set (largest margin)" value={pairStats.easiestSet ?? '—'} />
                    <TourPairStatRowSingle label="Average set score (games)" value={pairStats.averageSetScore ?? '—'} />
                    <TourPairStatRow
                      label="Avg win margin (games)"
                      left={pairStats.avgWinMarginPlayer1 != null ? String(pairStats.avgWinMarginPlayer1) : '—'}
                      right={pairStats.avgWinMarginPlayer2 != null ? String(pairStats.avgWinMarginPlayer2) : '—'}
                    />
                    <TourPairStatRow
                      label="Bagels (6–0)"
                      left={String(pairStats.bagelsServedPlayer1 ?? 0)}
                      right={String(pairStats.bagelsServedPlayer2 ?? 0)}
                    />
                    <TourPairStatRow
                      label="Breadsticks (6–1)"
                      left={String(pairStats.breadsticksServedPlayer1 ?? 0)}
                      right={String(pairStats.breadsticksServedPlayer2 ?? 0)}
                    />
                    <TourPairStatRowSingle label="Tie-break sets" value={String(pairStats.tieBreaksPlayed ?? 0)} />
                    <TourPairStatRowSingle label="Incomplete / partial sets" value={String(pairStats.incompleteSets ?? 0)} />
                    <TourPairStatRowSingle label="Total games (all sets)" value={String(pairStats.totalGamesPlayed ?? 0)} />
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.muted}>Pick two different players.</Text>
            )}
          </>
        ) : (
          <Text style={styles.muted}>Need at least two participants for H2H.</Text>
        )}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lead: { color: '#ccc', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  h2: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 16, marginBottom: 8 },
  sub: { color: '#999', fontSize: 13, marginBottom: 10, lineHeight: 18 },
  bodyLine: { color: '#ddd', fontSize: 14, marginBottom: 6 },
  recordGap: { marginTop: 10 },
  recordLine: { color: '#e8e8e8', fontSize: 14, marginBottom: 4 },
  muted: { color: '#888', fontSize: 14 },
  statRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.26)' },
  statName: { color: '#fff', fontWeight: '600' },
  statVal: { color: '#bbb', fontSize: 13, marginTop: 2 },
  pickerRow: { marginBottom: 8 },
  pickerScroll: { flexGrow: 0 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginRight: 8,
  },
  chipOn: { backgroundColor: '#2d6a4f' },
  chipText: { color: '#ccc', fontSize: 13 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  h2hResult: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 8 },
  h2hSub: { color: '#aaa', fontSize: 13, marginTop: 6, lineHeight: 18 },
  pairStatsCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  pairStatsLegend: { color: '#ddd', fontSize: 12, marginBottom: 12 },
  pairStatRow: {
    minWidth: 0,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.22)',
  },
  pairStatLabel: { color: '#bbb', fontSize: 12, marginBottom: 4 },
  pairStatVals: { minWidth: 0, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  pairStatP1: { minWidth: 0, flexShrink: 1, fontSize: 15, fontWeight: '700' },
  pairStatP2: { minWidth: 0, flexShrink: 1, fontSize: 15, fontWeight: '700' },
  pairStatDash: { color: '#888', fontSize: 15 },
  pairStatSingle: { minWidth: 0, flexShrink: 1, color: '#e8e8e8', fontSize: 14, fontWeight: '600' },
});
