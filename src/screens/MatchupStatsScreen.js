import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getHeadToHead,
  getMatchesForPlayer,
  getMatchResult,
  getMatchupDetailedStats,
  getMatchupDayByDay,
  createMatchup,
} from '../db/database';

export default function MatchupStatsScreen({ route, navigation }) {
  const { player1Id, player2Id, player1Name, player2Name } = route.params || {};
  const [activeTab, setActiveTab] = useState('matches');
  const [h2h, setH2h] = useState(null);
  const [matches, setMatches] = useState([]);
  const [detailedStats, setDetailedStats] = useState(null);
  const [dayByDay, setDayByDay] = useState([]);

  const load = useCallback(async () => {
    if (!player1Id || !player2Id) return;
    const [record, allMatches, stats, days] = await Promise.all([
      getHeadToHead(player1Id, player2Id),
      getMatchesForPlayer(player1Id),
      getMatchupDetailedStats(player1Id, player2Id),
      getMatchupDayByDay(player1Id, player2Id),
    ]);
    setH2h(record);
    const between = allMatches.filter(
      (m) => m.player1_id === player2Id || m.player2_id === player2Id
    );
    setMatches(between);
    setDetailedStats(stats);
    setDayByDay(days);
  }, [player1Id, player2Id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openMatch = useCallback(
    (matchId) => {
      navigation.navigate('MatchDetail', { matchId });
    },
    [navigation]
  );

  const handleAddDay = useCallback(async () => {
    try {
      const matchId = await createMatchup(player1Id, player2Id);
      navigation.navigate('MatchDetail', { matchId });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not add day');
    }
  }, [player1Id, player2Id, navigation]);

  if (h2h === null) {
    return <Text style={styles.loading}>Loading…</Text>;
  }

  const title = [player1Name, player2Name].filter(Boolean).join(' vs ') || 'Matchup';

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabSegment, activeTab === 'matches' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('matches')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'matches' ? styles.tabTextActive : styles.tabTextInactive]}>
              Matches
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabSegment, activeTab === 'stats' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('stats')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'stats' ? styles.tabTextActive : styles.tabTextInactive]}>
              Stats
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabSegment, activeTab === 'graph' ? styles.tabSegmentActive : styles.tabSegmentInactive]}
            onPress={() => setActiveTab('graph')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'graph' ? styles.tabTextActive : styles.tabTextInactive]}>
              Graph
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'matches' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.h2hBox}>
            <Text style={styles.h2hLabel}>Head-to-head (days)</Text>
            <Text style={styles.h2hScore}>
              {player1Name} {h2h.wins} – {h2h.losses} {player2Name}
            </Text>
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Days played</Text>
            <TouchableOpacity style={styles.addDayBtn} onPress={handleAddDay}>
              <Text style={styles.addDayText}>+ Add day</Text>
            </TouchableOpacity>
          </View>
          {matches.length === 0 ? (
            <Text style={styles.hint}>No days recorded yet. Tap “Add day” to add a date and set scores.</Text>
          ) : (
            matches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                player1Id={player1Id}
                player2Id={player2Id}
                onPress={() => openMatch(m.id)}
              />
            ))
          )}
        </ScrollView>
      ) : activeTab === 'stats' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.h2hBox}>
            <Text style={styles.h2hLabel}>Head-to-head (days)</Text>
            <Text style={styles.h2hScore}>
              {player1Name} {h2h.wins} – {h2h.losses} {player2Name}
            </Text>
          </View>
          <Text style={styles.sectionTitle}>Detailed stats</Text>
          <View style={styles.statsTable}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderMetric}>Metric</Text>
              <Text style={styles.tableHeaderValue}>Value</Text>
            </View>
            <StatTableRow metric="Total days played" value={detailedStats?.totalDaysPlayed ?? '—'} />
            <StatTableRow metric="Total sets played" value={detailedStats?.totalSetsPlayed ?? '—'} />
            <StatTableRow metric="Most sets in a single day" value={detailedStats?.mostSetsInSingleDay ?? '—'} />
            <StatTableRow
              metric="Set head-to-head"
              value={
                detailedStats
                  ? `${player1Name} ${detailedStats.setsPlayer1} – ${detailedStats.setsPlayer2} ${player2Name}`
                  : '—'
              }
            />
            <StatTableRow
              metric="Set win %"
              value={
                detailedStats
                  ? `${player1Name} ${(detailedStats.setWinPctPlayer1 ?? 0).toFixed(1)}% – ${(detailedStats.setWinPctPlayer2 ?? 0).toFixed(1)}% ${player2Name}`
                  : '—'
              }
            />
            <StatTableRow
              metric="Day win %"
              value={
                detailedStats
                  ? `${player1Name} ${(detailedStats.dayWinPctPlayer1 ?? 0).toFixed(1)}% – ${(detailedStats.dayWinPctPlayer2 ?? 0).toFixed(1)}% ${player2Name}`
                  : '—'
              }
            />
            <StatTableRow metric="Total games played" value={detailedStats?.totalGamesPlayed ?? '—'} />
            <StatTableRow
              metric="Games head-to-head"
              value={
                detailedStats
                  ? `${player1Name} ${detailedStats.gamesPlayer1} – ${detailedStats.gamesPlayer2} ${player2Name}`
                  : '—'
              }
            />
            <StatTableRow metric="Average set score (P1 – P2)" value={detailedStats?.averageSetScore ?? '—'} />
            <StatTableRow
              metric="Avg win margin when winning"
              value={
                detailedStats
                  ? [detailedStats.avgWinMarginPlayer1, detailedStats.avgWinMarginPlayer2]
                      .every((x) => x != null)
                    ? `${player1Name} ${detailedStats.avgWinMarginPlayer1} – ${detailedStats.avgWinMarginPlayer2} ${player2Name}`
                    : detailedStats.avgWinMarginPlayer1 != null
                      ? `${player1Name} ${detailedStats.avgWinMarginPlayer1}`
                      : detailedStats.avgWinMarginPlayer2 != null
                        ? `${player2Name} ${detailedStats.avgWinMarginPlayer2}`
                        : '—'
                  : '—'
              }
            />
            <StatTableRow
              metric="Current win streak"
              value={
                detailedStats
                  ? `${player1Name} ${detailedStats.currentWinStreakPlayer1 ?? 0} – ${detailedStats.currentWinStreakPlayer2 ?? 0} ${player2Name}`
                  : '—'
              }
            />
            <StatTableRow
              metric="Best win streak"
              value={
                detailedStats
                  ? `${player1Name} ${detailedStats.bestWinStreakPlayer1 ?? 0} – ${detailedStats.bestWinStreakPlayer2 ?? 0} ${player2Name}`
                  : '—'
              }
            />
            <StatTableRow
              metric="Bagels served (6–0)"
              value={
                detailedStats
                  ? `${player1Name} ${detailedStats.bagelsServedPlayer1 ?? 0} – ${detailedStats.bagelsServedPlayer2 ?? 0} ${player2Name}`
                  : '—'
              }
            />
            <StatTableRow
              metric="Breadsticks (6–1)"
              value={
                detailedStats
                  ? `${player1Name} ${detailedStats.breadsticksServedPlayer1 ?? 0} – ${detailedStats.breadsticksServedPlayer2 ?? 0} ${player2Name}`
                  : '—'
              }
            />
            <StatTableRow metric="Closest set" value={detailedStats?.closestSet ?? '—'} />
            <StatTableRow metric="Easiest set" value={detailedStats?.easiestSet ?? '—'} />
            <StatTableRow metric="Tie breaks played" value={detailedStats?.tieBreaksPlayed ?? '—'} />
          </View>
        </ScrollView>
      ) : activeTab === 'graph' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.graphContent} showsVerticalScrollIndicator={false}>
          <View style={styles.h2hBox}>
            <Text style={styles.h2hLabel}>Sets per day</Text>
            <View style={styles.graphLegendRow}>
              <Text style={styles.legendGreen}>■ {player1Name}</Text>
              <Text style={styles.legendRed}>■ {player2Name}</Text>
            </View>
          </View>
          {dayByDay.length === 0 ? (
            <Text style={styles.hint}>No days yet. Play matches to see the graph.</Text>
          ) : (
            <View style={styles.graphBlock}>
              {dayByDay.map((day, i) => (
                <TouchableOpacity
                  key={day.matchId || i}
                  style={styles.graphRow}
                  onPress={() => navigation.navigate('MatchDetail', { matchId: day.matchId })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.graphDate} numberOfLines={1}>{day.date || 'No date'}</Text>
                  <View style={styles.graphBarWrap}>
                    <View style={styles.graphBar}>
                      {(day.setsPlayer1 || 0) + (day.setsPlayer2 || 0) === 0 ? (
                        <View style={[styles.graphBarSegment, styles.graphBarEmpty, { flex: 1 }]} />
                      ) : (
                        <View style={styles.graphBarSegments}>
                          <View style={[styles.graphBarSegment, styles.graphBarGreen, { flex: day.setsPlayer1 || 0 }]} />
                          <View style={[styles.graphBarSegment, styles.graphBarRed, { flex: day.setsPlayer2 || 0 }]} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.graphBarLabel}>{day.setsPlayer1}–{day.setsPlayer2}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

function MatchRow({ match, player1Id, player2Id, onPress }) {
  const [result, setResult] = useState(null);
  React.useEffect(() => {
    let cancelled = false;
    getMatchResult(match.id).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => { cancelled = true; };
  }, [match.id]);

  const dateLabel = match.date_played || 'No date';
  const scoreLabel = result
    ? `${result.setsPlayer1}-${result.setsPlayer2} sets`
    : '—';

  return (
    <TouchableOpacity style={styles.matchRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.matchDate}>{dateLabel}</Text>
      <Text style={styles.matchScore}>{scoreLabel}</Text>
      <Text style={styles.matchChevron}>›</Text>
    </TouchableOpacity>
  );
}

function StatTableRow({ metric, value }) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableMetric}>{metric}</Text>
      <Text style={styles.tableValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  tabBarWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#e8ece8',
    borderRadius: 14,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  tabSegment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSegmentActive: {
    backgroundColor: '#1a472a',
    shadowColor: '#1a472a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  tabSegmentInactive: { backgroundColor: 'transparent' },
  tabText: { fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabTextInactive: { color: '#5a6a5a' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  loading: { padding: 24, textAlign: 'center', color: '#666' },
  h2hBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  h2hLabel: { fontSize: 12, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  h2hScore: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 12 },
  addDayBtn: {
    backgroundColor: '#1a472a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addDayText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  hint: { color: '#666', fontSize: 15, marginBottom: 16 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1a472a',
  },
  matchDate: { fontSize: 15, color: '#333', flex: 1 },
  matchScore: { fontSize: 14, color: '#666', marginRight: 8 },
  matchChevron: { fontSize: 18, color: '#1a472a', fontWeight: '700' },
  statsTable: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#1a472a',
    backgroundColor: '#f4f8f4',
  },
  tableHeaderMetric: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1a472a', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableHeaderValue: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1a472a', textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2ec',
  },
  tableMetric: { flex: 1, fontSize: 14, color: '#333' },
  tableValue: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a472a', textAlign: 'right' },
  graphContent: { padding: 16, paddingBottom: 40 },
  graphLegendRow: { flexDirection: 'row', marginTop: 6, gap: 16 },
  legendGreen: { fontSize: 13, color: '#1a472a' },
  legendRed: { fontSize: 13, color: '#b91c1c' },
  graphBlock: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', padding: 12, borderWidth: 1, borderColor: '#e0e8e0' },
  graphRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  graphDate: { width: 72, fontSize: 13, color: '#333' },
  graphBarWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  graphBar: { flex: 1, height: 24, borderRadius: 6, overflow: 'hidden', backgroundColor: '#eee' },
  graphBarSegments: { flex: 1, flexDirection: 'row', height: '100%' },
  graphBarSegment: { minWidth: 2 },
  graphBarGreen: { backgroundColor: '#1a472a' },
  graphBarRed: { backgroundColor: '#b91c1c' },
  graphBarEmpty: { backgroundColor: '#ccc' },
  graphBarLabel: { fontSize: 12, fontWeight: '600', color: '#555', minWidth: 28 },
});
