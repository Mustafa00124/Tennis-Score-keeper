import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ImageBackground } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getHeadToHead,
  getMatchesForPlayer,
  getMatchupDetailedStats,
  getMatchupDayByDay,
  createMatchup,
  getMatchWithDetails,
  deleteAllMatchesForMatchup,
  deleteMatch,
} from '../db/database';
import { setNeedsTiebreak } from '../utils/tennisScoring';

const BAR_HEIGHT_PER_SET = 10;
const DAY_COLUMN_WIDTH = 26;
const COLOR_PLAYER1 = '#2563eb';
const COLOR_PLAYER2 = '#b91c1c';
const COLOR_NEUTRAL = '#c0840c';
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function parseDateStr(str) {
  if (!str || str.length < 10) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

/** All calendar days from firstMatchDate to today; each has { dateStr, date, setsPlayer1, setsPlayer2, matchId, hasIncompleteSets } */
function buildFullDayList(dayByDay) {
  const playByDate = {};
  for (const d of dayByDay) {
    const key = (d.date || '').slice(0, 10);
    if (key) playByDate[key] = {
      setsPlayer1: d.setsPlayer1 || 0,
      setsPlayer2: d.setsPlayer2 || 0,
      matchId: d.matchId,
      hasIncompleteSets: d.hasIncompleteSets || false,
    };
  }
  const playedDates = Object.keys(playByDate).filter(Boolean);
  if (playedDates.length === 0) return [];
  const startDate = playedDates.reduce((a, b) => (a < b ? a : b));
  const start = parseDateStr(startDate);
  const end = new Date();
  if (!start || start > end) return [];
  const list = [];
  let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d <= endDay) {
    const dateStr = toDateStr(d);
    const play = playByDate[dateStr];
    list.push({
      dateStr,
      date: new Date(d),
      setsPlayer1: play ? play.setsPlayer1 : 0,
      setsPlayer2: play ? play.setsPlayer2 : 0,
      matchId: play ? play.matchId : null,
      hasIncompleteSets: play ? play.hasIncompleteSets : false,
    });
    d = addDays(d, 1);
  }
  return list;
}

/** Group full day list into { year, months: [ { monthLabel, monthLabelFull, monthIndex, year, days: [...] } ] } */
function groupByYearMonth(fullDays) {
  const byYear = {};
  for (const day of fullDays) {
    const y = day.date.getFullYear();
    const m = day.date.getMonth();
    if (!byYear[y]) byYear[y] = {};
    if (!byYear[y][m]) byYear[y][m] = [];
    byYear[y][m].push(day);
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  return years.map((year) => {
    const monthIndices = Object.keys(byYear[year]).map(Number).sort((a, b) => a - b);
    const months = monthIndices.map((monthIndex) => ({
      monthLabel: MONTH_NAMES[monthIndex],
      monthLabelFull: MONTH_NAMES_FULL[monthIndex],
      monthIndex,
      year,
      days: byYear[year][monthIndex],
    }));
    return { year, months };
  });
}

function UnifiedTopBar({ player1Name, player2Name, setsPlayer1, setsPlayer2 }) {
  return (
    <View style={styles.h2hBoxGlass}>
      <View style={styles.unifiedLegendRow}>
        <Text style={styles.legendPlayer1}>■ Player 1: {player1Name || '—'}</Text>
        <Text style={styles.legendPlayer2}>■ Player 2: {player2Name || '—'}</Text>
        <Text style={styles.legendYellow}>■ Incomplete</Text>
      </View>
      <Text style={styles.h2hLabelGlass}>Head to Head (sets)</Text>
      <View style={styles.h2hScoreRow}>
        <Text style={[styles.h2hScoreGlass, { color: COLOR_PLAYER1 }]}>{setsPlayer1 ?? '—'}</Text>
        <Text style={styles.h2hScoreDash}> – </Text>
        <Text style={[styles.h2hScoreGlass, { color: COLOR_PLAYER2 }]}>{setsPlayer2 ?? '—'}</Text>
      </View>
    </View>
  );
}

export default function MatchupStatsScreen({ route, navigation }) {
  const { player1Id, player2Id, player1Name, player2Name } = route.params || {};
  const [activeTab, setActiveTab] = useState('matches');
  const [h2h, setH2h] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchDetails, setMatchDetails] = useState({});
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
    const between = (allMatches || [])
      .filter((m) => m && (m.player1_id === player2Id || m.player2_id === player2Id))
      .sort((a, b) => (a.date_played || '').localeCompare(b.date_played || '') || (a.id - b.id));
    setMatches(between);
    const details = await Promise.all(between.map((m) => getMatchWithDetails(m.id)));
    const byId = {};
    details.forEach((d, i) => {
      if (d && between[i]) byId[between[i].id] = d;
    });
    setMatchDetails(byId);
    setDetailedStats(stats);
    setDayByDay(days);
  }, [player1Id, player2Id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const graphData = useMemo(() => {
    const full = buildFullDayList(dayByDay);
    return groupByYearMonth(full);
  }, [dayByDay]);

  const openMatch = useCallback(
    (matchId) => {
      navigation.navigate('MatchView', { matchId });
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

  const handleDeleteAllDays = useCallback(() => {
    Alert.alert(
      'Delete all days?',
      `Remove all match days between ${player1Name} and ${player2Name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete all', style: 'destructive', onPress: async () => {
          try {
            await deleteAllMatchesForMatchup(player1Id, player2Id);
            await load();
          } catch (e) {
            Alert.alert('Error', e.message || 'Could not delete');
          }
        }},
      ]
    );
  }, [player1Id, player2Id, player1Name, player2Name, load]);

  const handleDeleteDay = useCallback((matchId) => {
    Alert.alert(
      'Delete this day?',
      'Remove this match and its set scores? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteMatch(matchId);
            await load();
          } catch (e) {
            Alert.alert('Error', e.message || 'Could not delete match');
          }
        }},
      ]
    );
  }, [load]);

  if (h2h === null) {
    return <Text style={styles.loading}>Loading…</Text>;
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../media/Matchups.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.backgroundOverlay} />
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
              Calendar
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'matches' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <UnifiedTopBar
            player1Name={player1Name}
            player2Name={player2Name}
            setsPlayer1={detailedStats?.setsPlayer1}
            setsPlayer2={detailedStats?.setsPlayer2}
          />
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Days played</Text>
            <View style={styles.sectionHeaderActions}>
              <TouchableOpacity style={styles.addDayBtn} onPress={handleAddDay}>
                <Text style={styles.addDayText}>+ Add day</Text>
              </TouchableOpacity>
              {matches.length > 0 && (
                <TouchableOpacity style={styles.deleteAllDaysBtn} onPress={handleDeleteAllDays}>
                  <Text style={styles.deleteAllDaysText}>Delete all days</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {matches.length === 0 ? (
            <Text style={styles.hint}>No days recorded yet. Tap “Add day” to add a date and set scores.</Text>
          ) : (
            matches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                detail={matchDetails[m.id]}
                onPress={() => openMatch(m.id)}
                onDelete={() => handleDeleteDay(m.id)}
              />
            ))
          )}
        </ScrollView>
      ) : activeTab === 'stats' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <UnifiedTopBar
            player1Name={player1Name}
            player2Name={player2Name}
            setsPlayer1={detailedStats?.setsPlayer1}
            setsPlayer2={detailedStats?.setsPlayer2}
          />
          <View style={styles.statsTableGlass}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderTableName}>Activity & Volume</Text>
              <View style={styles.tableHeaderValueWrap}>
                <Text style={[styles.tableHeaderValueP1, { color: COLOR_PLAYER1 }]}>P1</Text>
                <Text style={styles.tableHeaderValueDash}> – </Text>
                <Text style={[styles.tableHeaderValueP2, { color: COLOR_PLAYER2 }]}>P2</Text>
              </View>
            </View>
            <StatTableRow metric="Total days played" value={detailedStats?.totalDaysPlayed ?? '—'} />
            <StatTableRow metric="Total sets played" value={detailedStats?.totalSetsPlayed ?? '—'} />
            <StatTableRow metric="Total games played" value={detailedStats?.totalGamesPlayed ?? '—'} />
            <StatTableRow metric="Incomplete sets" value={detailedStats?.incompleteSets ?? '—'} />
            <StatTableRow metric="Most sets in a single day" value={detailedStats?.mostSetsInSingleDay ?? '—'} />
            <StatTableRow metric="Most sets in a week" value={detailedStats?.mostSetsInWeek ?? '—'} />
            <StatTableRow metric="Most sets in a month" value={detailedStats?.mostSetsInMonth ?? '—'} />
          </View>

          <View style={[styles.statsTableGlass, styles.statsTableGlassSecond]}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderTableName}>Performance & Competitiveness</Text>
              <View style={styles.tableHeaderValueWrap}>
                <Text style={[styles.tableHeaderValueP1, { color: COLOR_PLAYER1 }]}>P1</Text>
                <Text style={styles.tableHeaderValueDash}> – </Text>
                <Text style={[styles.tableHeaderValueP2, { color: COLOR_PLAYER2 }]}>P2</Text>
              </View>
            </View>
            <StatTableRow
              metric="Set head-to-head"
              valueP1={detailedStats != null ? String(detailedStats.setsPlayer1) : null}
              valueP2={detailedStats != null ? String(detailedStats.setsPlayer2) : null}
            />
            <StatTableRow
              metric="Games head-to-head"
              valueP1={detailedStats != null ? String(detailedStats.gamesPlayer1) : null}
              valueP2={detailedStats != null ? String(detailedStats.gamesPlayer2) : null}
            />
            <StatTableRow
              metric="Set win %"
              valueP1={detailedStats != null ? `${(detailedStats.setWinPctPlayer1 ?? 0).toFixed(1)}%` : null}
              valueP2={detailedStats != null ? `${(detailedStats.setWinPctPlayer2 ?? 0).toFixed(1)}%` : null}
            />
            <StatTableRow
              metric="Current win streak"
              valueP1={detailedStats != null ? String(detailedStats.currentWinStreakPlayer1 ?? 0) : null}
              valueP2={detailedStats != null ? String(detailedStats.currentWinStreakPlayer2 ?? 0) : null}
            />
            <StatTableRow
              metric="Best win streak"
              valueP1={detailedStats != null ? String(detailedStats.bestWinStreakPlayer1 ?? 0) : null}
              valueP2={detailedStats != null ? String(detailedStats.bestWinStreakPlayer2 ?? 0) : null}
            />
            <StatTableRow metric="Closest set" valueScore={detailedStats?.closestSet} />
            <StatTableRow metric="Easiest set" valueScore={detailedStats?.easiestSet} />
            <StatTableRow metric="Average set score" valueScore={detailedStats?.averageSetScore} />
            <StatTableRow
              metric="Average win margin"
              valueP1={
                detailedStats != null && detailedStats.avgWinMarginPlayer1 != null
                  ? String(detailedStats.avgWinMarginPlayer1)
                  : null
              }
              valueP2={
                detailedStats != null && detailedStats.avgWinMarginPlayer2 != null
                  ? String(detailedStats.avgWinMarginPlayer2)
                  : null
              }
              fallback={detailedStats != null && detailedStats.avgWinMarginPlayer1 == null && detailedStats.avgWinMarginPlayer2 == null ? '—' : undefined}
            />
            <StatTableRow
              metric="Bagels served (6–0)"
              valueP1={detailedStats != null ? String(detailedStats.bagelsServedPlayer1 ?? 0) : null}
              valueP2={detailedStats != null ? String(detailedStats.bagelsServedPlayer2 ?? 0) : null}
            />
            <StatTableRow
              metric="Breadsticks (6–1)"
              valueP1={detailedStats != null ? String(detailedStats.breadsticksServedPlayer1 ?? 0) : null}
              valueP2={detailedStats != null ? String(detailedStats.breadsticksServedPlayer2 ?? 0) : null}
            />
            <StatTableRow metric="Tie breaks played" value={detailedStats?.tieBreaksPlayed ?? '—'} />
          </View>
        </ScrollView>
      ) : activeTab === 'graph' ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.graphContent} showsVerticalScrollIndicator={false}>
            <UnifiedTopBar
              player1Name={player1Name}
              player2Name={player2Name}
              setsPlayer1={detailedStats?.setsPlayer1}
              setsPlayer2={detailedStats?.setsPlayer2}
            />
            {graphData.length === 0 ? (
              <Text style={styles.hintGlass}>No days yet. Play matches to see the graph.</Text>
            ) : (
              <>
                {graphData.map(({ year, months }) => (
                  <View key={year} style={styles.graphYearBlock}>
                    {months.map(({ monthLabel, monthLabelFull, days }) => (
                      <View key={`${year}-${monthLabel}`} style={styles.graphMonthCard}>
                        <Text style={styles.graphMonthTitle}>{monthLabelFull} {year}</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.graphXAxisWrap}
                        >
                          {days.map((day) => {
                            const totalSets = day.setsPlayer1 + day.setsPlayer2;
                            const hasIncomplete = day.hasIncompleteSets;
                            const barHeight = (totalSets > 0 || hasIncomplete)
                              ? (totalSets + (hasIncomplete ? 1 : 0)) * BAR_HEIGHT_PER_SET
                              : 0;
                            const dayNum = day.date.getDate();
                            const dayName = DAY_NAMES[day.date.getDay()];
                            return (
                              <TouchableOpacity
                                key={day.dateStr}
                                style={styles.graphDayColumn}
                                onPress={day.matchId ? () => navigation.navigate('MatchView', { matchId: day.matchId }) : undefined}
                                activeOpacity={day.matchId ? 0.8 : 1}
                                disabled={!day.matchId}
                              >
                                <View style={styles.graphDayBarColumn}>
                                  {(totalSets > 0 || hasIncomplete) && (
                                    <View style={[styles.graphVerticalBar, { height: barHeight }]}>
                                      {hasIncomplete && totalSets === 0 ? (
                                        <View style={[styles.graphVerticalSegment, styles.graphBarYellow, { height: BAR_HEIGHT_PER_SET }]} />
                                      ) : (
                                        <>
                                          <View style={[styles.graphVerticalSegment, styles.graphBarPlayer1, { height: (day.setsPlayer1 || 0) * BAR_HEIGHT_PER_SET }]} />
                                          <View style={[styles.graphVerticalSegment, styles.graphBarPlayer2, { height: (day.setsPlayer2 || 0) * BAR_HEIGHT_PER_SET }]} />
                                          {hasIncomplete && (
                                            <View style={[styles.graphVerticalSegment, styles.graphBarYellow, { height: BAR_HEIGHT_PER_SET }]} />
                                          )}
                                        </>
                                      )}
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.graphXAxisLabel}>{dayNum}</Text>
                                <Text style={styles.graphXAxisDay}>{dayName}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ))}
                  </View>
                ))}
              </>
            )}
          </ScrollView>
      ) : null}
      </ImageBackground>
    </View>
  );
}

/** Format one set for list display */
function formatSetForList(s) {
  if (!s || s.games_player1 == null || s.games_player2 == null) return '';
  const g1 = Number(s.games_player1);
  const g2 = Number(s.games_player2);
  if (setNeedsTiebreak(g1, g2) && (s.tiebreak_player1 != null || s.tiebreak_player2 != null)) {
    const tb = g1 > g2 ? s.tiebreak_player1 : s.tiebreak_player2;
    return `${Math.max(g1, g2)}-${Math.min(g1, g2)}${tb != null && tb !== '' ? `(${tb})` : ''}`;
  }
  return `${g1}-${g2}`;
}

function formatSetsForList(sets) {
  if (!sets || !sets.length) return '—';
  return sets.map(formatSetForList).filter(Boolean).join(' ');
}

function MatchRow({ match, detail, onPress, onDelete }) {
  if (!match) return null;
  const dateLabel = match.date_played || 'No date';
  const setScoresStr = detail?.sets ? formatSetsForList(detail.sets) : '—';
  const remarks = (detail?.remarks || '').trim();

  return (
    <View style={styles.matchRowGlassWrap}>
      <TouchableOpacity style={styles.matchRowGlass} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.matchRowLeft}>
          <Text style={styles.matchSetScores} numberOfLines={1}>{setScoresStr}</Text>
          <View style={styles.matchRowMeta}>
            <Text style={styles.matchDate}>{dateLabel}</Text>
            {remarks.length > 0 && (
              <Text style={styles.matchRemarks} numberOfLines={1}>{remarks}</Text>
            )}
          </View>
        </View>
        <Text style={styles.matchChevron}>›</Text>
      </TouchableOpacity>
      {onDelete ? (
        <TouchableOpacity
          style={styles.matchRowDeleteBtn}
          onPress={(e) => { e?.stopPropagation?.(); onDelete(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.matchRowDeleteText}>Delete</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function StatTableRow({ metric, value, valueP1, valueP2, valueScore, fallback }) {
  const parsed = valueScore != null ? valueScore.split(/\s*[–-]\s*/) : [];
  const p1 = valueP1 ?? (parsed[0] != null && parsed[0].trim() !== '' ? parsed[0].trim() : null);
  const p2 = valueP2 ?? (parsed[1] != null && parsed[1].trim() !== '' ? parsed[1].trim() : null);
  const hasAnyP1P2 = p1 != null || p2 != null;
  const displayNeutral = !hasAnyP1P2 ? (value ?? fallback ?? '—') : null;
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableMetric}>{metric}</Text>
      <View style={styles.tableValueWrap}>
        {hasAnyP1P2 ? (
          <>
            <Text style={[styles.tableValueP1, { color: COLOR_PLAYER1 }]}>{p1 ?? '—'}</Text>
            <Text style={styles.tableValueDash}> – </Text>
            <Text style={[styles.tableValueP2, { color: COLOR_PLAYER2 }]}>{p2 ?? '—'}</Text>
          </>
        ) : (
          <Text style={styles.tableValueNeutral}>{displayNeutral}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a2e1a' },
  backgroundImage: { flex: 1 },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
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
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
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
  tabTextInactive: { color: 'rgba(255,255,255,0.9)' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  loading: { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.9)' },
  h2hBoxGlass: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  h2hLabelGlass: { fontSize: 12, color: '#1a472a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  unifiedLegendRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6, gap: 12, justifyContent: 'center' },
  h2hScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  h2hScoreGlass: { fontSize: 20, fontWeight: '700' },
  h2hScoreDash: { fontSize: 20, fontWeight: '700', color: '#555', marginHorizontal: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 12, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  tableHeaderTableName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1a472a', textTransform: 'uppercase', letterSpacing: 0.3 },
  statsTableGlassSecond: { marginTop: 16 },
  addDayBtn: {
    backgroundColor: '#1a472a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addDayText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteAllDaysBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(197,48,48,0.2)' },
  deleteAllDaysText: { color: '#c53030', fontSize: 14, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.9)', fontSize: 15, marginBottom: 16, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  matchRowGlassWrap: { marginBottom: 10 },
  matchRowGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#1a472a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  matchRowLeft: { flex: 1, minWidth: 0, marginRight: 10 },
  matchSetScores: { fontSize: 16, fontWeight: '700', color: '#1a472a', marginBottom: 4 },
  matchRowMeta: {},
  matchDate: { fontSize: 14, color: '#444' },
  matchRemarks: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 2 },
  matchChevron: { fontSize: 20, color: '#1a472a', fontWeight: '700' },
  matchRowDeleteBtn: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 10 },
  matchRowDeleteText: { fontSize: 12, fontWeight: '600', color: '#c53030' },
  statsTableGlass: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#1a472a',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  tableHeaderMetric: { flex: 1, fontSize: 13, fontWeight: '700', color: COLOR_NEUTRAL, textTransform: 'uppercase', letterSpacing: 0.3 },
  tableHeaderValueWrap: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  tableHeaderValueP1: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableHeaderValueDash: { fontSize: 13, fontWeight: '700', color: '#555' },
  tableHeaderValueP2: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  tableMetric: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1a472a' },
  tableValueWrap: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  tableValueP1: { fontSize: 14, fontWeight: '600' },
  tableValueDash: { fontSize: 14, fontWeight: '600', color: '#555' },
  tableValueP2: { fontSize: 14, fontWeight: '600' },
  tableValueNeutral: { fontSize: 14, fontWeight: '600', color: COLOR_NEUTRAL },
  graphContent: { padding: 16, paddingBottom: 40 },
  legendPlayer1: { fontSize: 13, color: COLOR_PLAYER1, fontWeight: '600' },
  legendPlayer2: { fontSize: 13, color: COLOR_PLAYER2, fontWeight: '600' },
  hintGlass: { color: 'rgba(255,255,255,0.95)', fontSize: 15, marginBottom: 16, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  graphYearBlock: { marginBottom: 20 },
  graphMonthCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  graphMonthTitle: { fontSize: 16, fontWeight: '700', color: '#1a472a', marginBottom: 10, paddingLeft: 2 },
  graphXAxisWrap: { paddingVertical: 8, paddingRight: 16, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  graphDayColumn: {
    width: DAY_COLUMN_WIDTH,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 56,
  },
  graphDayBarColumn: {
    minHeight: 32,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  graphVerticalBar: {
    flexDirection: 'column-reverse',
    width: 14,
    borderRadius: 4,
    overflow: 'hidden',
    minHeight: 2,
  },
  graphVerticalSegment: {
    width: '100%',
    minHeight: 2,
  },
  graphBarPlayer1: { backgroundColor: COLOR_PLAYER1 },
  graphBarPlayer2: { backgroundColor: COLOR_PLAYER2 },
  graphBarYellow: { backgroundColor: '#c0840c' },
  legendYellow: { fontSize: 13, color: '#c0840c', fontWeight: '600' },
  graphXAxisLabel: { fontSize: 11, fontWeight: '600', color: '#333' },
  graphXAxisDay: { fontSize: 9, color: '#666', marginTop: 1 },
});
