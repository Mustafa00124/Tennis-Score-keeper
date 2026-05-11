import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  getTourWithDetails,
  getTourRankings,
  getTourRollingPointsSparkline,
  getTourRollingWindowSize,
  getTourEventPodiumsForTour,
  startTourEventBracket,
  updateTour,
  updateTourEvent,
  TOUR_EVENT_TYPES,
} from '../db/database';
import { TOUR_CALENDAR_COLORS, formatShortDate, parseDateStr } from '../utils/tourCalendar';
import { knockoutDrawSizesAllowed, clampDrawSizeToParticipants } from '../utils/tourDrawSizes';

function eventTypeLabel(ev) {
  return TOUR_EVENT_TYPES[ev.event_type]?.label || ev.event_type;
}

function eventCalendarCaption(ev) {
  const slot = ev.scheduled_date && ev.scheduled_date.length >= 10 ? formatShortDate(ev.scheduled_date) : '—';
  if (ev.status === 'complete' && ev.completed_at) {
    return `Played ${formatShortDate(ev.completed_at.slice(0, 10))} on chart · slot ${slot}`;
  }
  return `Slot ${slot}`;
}

function eventBracketSpecs(ev) {
  const d = ev.draw_size ?? 8;
  if (ev.event_type === 'tourfinals') return 'Top 2 ranked players · full-set final';
  const m = ev.match_mode === 'random' ? 'Random pairings' : 'Seeded by tour ranking';
  return `${d}-player draw · ${m}`;
}

function requiredEventDrawSize(ev, rosterCount) {
  if (ev?.event_type === 'tourfinals') return 2;
  return clampDrawSizeToParticipants(ev?.draw_size ?? 8, rosterCount);
}

const SPARKLINE_COLORS = ['#00e676', '#40c4ff', '#ffab40', '#ea80fc', '#ffee58'];

/** Only the next tournament in schedule order may be started; all earlier events must be complete. */
function canStartTourEventInSequence(sortedEvents, ev) {
  const idx = sortedEvents.findIndex((e) => e.id === ev.id);
  if (idx < 0) return false;
  for (let i = 0; i < idx; i++) {
    if (sortedEvents[i].status !== 'complete') return false;
  }
  return true;
}

/** Active schedule row: first season with an open slot or unfinished event; else last season. */
function pickDisplaySeasonId(seasons, events) {
  if (!seasons?.length) return null;
  for (const s of seasons) {
    const evs = events.filter((e) => e.season_id === s.id);
    if (evs.length === 0) return s.id;
    if (evs.some((e) => e.status !== 'complete')) return s.id;
  }
  return seasons[seasons.length - 1].id;
}

function RollingPointsSparkline({ labels, series }) {
  const W = Math.min(Dimensions.get('window').width - 56, 360);
  const H = 132;
  const padL = 6;
  const padR = 6;
  const padT = 10;
  const padB = 4;
  if (!series?.length || !labels?.length) return null;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const s of series) {
    for (const v of s.cumulative) {
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  if (!Number.isFinite(minV)) return null;
  if (maxV === minV) {
    minV = 0;
    maxV += 1;
  }
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const nPts = labels.length;
  const xAt = (i) => padL + (nPts <= 1 ? innerW / 2 : (i / (nPts - 1)) * innerW);
  const yAt = (v) => padT + innerH * (1 - (v - minV) / (maxV - minV));
  return (
    <View style={{ marginTop: 10 }}>
      <Svg width={W} height={H}>
        {series.map((s, si) => {
          const pts = s.cumulative.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
          return (
            <Polyline
              key={s.player_id}
              points={pts}
              fill="none"
              stroke={SPARKLINE_COLORS[si % SPARKLINE_COLORS.length]}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {series.map((s, si) => (
          <View key={s.player_id} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
            <View style={[styles.sparkLegendSwatch, { backgroundColor: SPARKLINE_COLORS[si % SPARKLINE_COLORS.length] }]} />
            <Text style={styles.sparkLegendText} numberOfLines={1}>
              {s.player_name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function TourDetailScreen({ route, navigation }) {
  const { tourId, tourName: initialName } = route.params || {};
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [startModal, setStartModal] = useState(null);
  const [startPlayerIds, setStartPlayerIds] = useState(() => new Set());
  const [editDesc, setEditDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [scheduleEditEvent, setScheduleEditEvent] = useState(null);
  const [scheduleDraftDate, setScheduleDraftDate] = useState('');
  const [scheduleDraftColor, setScheduleDraftColor] = useState(TOUR_CALENDAR_COLORS[0]);
  const [sparkline, setSparkline] = useState({ labels: [], series: [] });
  const [podiums, setPodiums] = useState({});
  const [rollingN, setRollingN] = useState(1);

  const load = useCallback(async () => {
    if (!tourId) return;
    const [t, rank, sp, pod, rollW] = await Promise.all([
      getTourWithDetails(tourId),
      getTourRankings(tourId),
      getTourRollingPointsSparkline(tourId),
      getTourEventPodiumsForTour(tourId),
      getTourRollingWindowSize(tourId),
    ]);
    setData(t);
    setRankings(rank || []);
    setSparkline(sp && sp.series ? sp : { labels: [], series: [] });
    setPodiums(pod && typeof pod === 'object' ? pod : {});
    setRollingN(Math.max(1, rollW || 1));
    if (t?.tour?.description) setDescDraft(t.tour.description);
  }, [tourId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    navigation.setOptions({ title: data?.tour?.name ?? initialName ?? 'Tour' });
  }, [navigation, data?.tour?.name, initialName]);

  const onSaveDescription = async () => {
    try {
      await updateTour(tourId, { description: descDraft });
      setEditDesc(false);
      await load();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save');
    }
  };

  const pickSymbol = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission', 'Photo access is needed for the tour symbol.');
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (!r.canceled && r.assets?.[0]?.uri) {
        await updateTour(tourId, { symbolImage: r.assets[0].uri });
        await load();
      }
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not pick image');
    }
  };

  const participants = data?.participants ?? [];
  const events = data?.events ?? [];
  const seasons = data?.seasons ?? [];

  const runStartTournament = async () => {
    if (!startModal) return;
    const name = startModal.name;
    const rosterCount = (data?.participants ?? []).length;
    const allowed = knockoutDrawSizesAllowed(rosterCount);
    if (allowed.length === 0) {
      Alert.alert('Players', 'Add at least two players to this tour before starting a tournament.');
      return;
    }
    const size = requiredEventDrawSize(startModal, rosterCount);
    if (size == null) {
      Alert.alert('Draw size', 'Could not determine a valid draw for this roster.');
      return;
    }
    if (startModal.event_type !== 'tourfinals' && startPlayerIds.size !== size) {
      Alert.alert(
        'Participants',
        `This is a ${size}-player tournament. You selected ${startPlayerIds.size}. Select exactly ${size} players to create the draw.`
      );
      return;
    }
    try {
      const { tournamentId } = await startTourEventBracket(startModal.id, {
        drawSize: size,
        participantPlayerIds: Array.from(startPlayerIds),
      });
      setStartModal(null);
      setStartPlayerIds(new Set());
      await load();
      navigation.navigate('TournamentDetail', {
        tournamentId,
        tournamentName: `${data?.tour?.name ?? initialName} — ${name}`,
      });
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not start tournament');
    }
  };

  const openStartTournament = useCallback(
    (ev) => {
      const roster = participants.length;
      const targetSize = requiredEventDrawSize(ev, roster);
      const byRank = rankings.map((r) => r.player_id);
      const initial = byRank.slice(0, targetSize || 0);
      setStartPlayerIds(new Set(initial));
      setStartModal(ev);
    },
    [participants.length, rankings]
  );

  const openScheduleEdit = useCallback((ev) => {
    setScheduleEditEvent(ev);
    setScheduleDraftDate((ev.scheduled_date || '').slice(0, 10));
    setScheduleDraftColor(
      ev.calendar_color || TOUR_CALENDAR_COLORS[(ev.sort_order ?? 0) % TOUR_CALENDAR_COLORS.length]
    );
  }, []);

  const saveScheduleEdit = async () => {
    if (!scheduleEditEvent) return;
    const raw = scheduleDraftDate.trim().slice(0, 10);
    if (!raw || !parseDateStr(raw)) {
      Alert.alert('Date', 'Enter a valid calendar day as YYYY-MM-DD.');
      return;
    }
    try {
      await updateTourEvent(scheduleEditEvent.id, {
        scheduledDate: raw,
        calendarColor: scheduleDraftColor,
      });
      setScheduleEditEvent(null);
      await load();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save');
    }
  };

  if (!tourId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Missing tour.</Text>
      </View>
    );
  }

  const tour = data?.tour;
  const displaySeasonId = useMemo(
    () => pickDisplaySeasonId(seasons, events),
    [seasons, events]
  );
  const seasonEvents = useMemo(() => {
    if (displaySeasonId == null) return events;
    return events.filter(
      (e) => e.season_id === displaySeasonId || (e.season_id == null && displaySeasonId === seasons[0]?.id)
    );
  }, [events, displaySeasonId, seasons]);
  const seasonTitle =
    seasons.find((s) => s.id === displaySeasonId)?.name ||
    seasonEvents.find((e) => e.season_name)?.season_name ||
    'Season';
  const sortedSchedule = useMemo(
    () => [...seasonEvents].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id),
    [seasonEvents]
  );
  const startRequiredDrawSize = requiredEventDrawSize(startModal, participants.length);
  const startSelectionCount = startModal?.event_type === 'tourfinals' ? Math.min(2, rankings.length) : startPlayerIds.size;
  const startSelectionOk =
    !startModal || startModal.event_type === 'tourfinals' || startSelectionCount === startRequiredDrawSize;
  return (
    <ImageBackground source={require('../../media/Tournament.jpg')} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroRow}>
          <TouchableOpacity onPress={pickSymbol} activeOpacity={0.85}>
            {tour?.symbol_image ? (
              <Image source={{ uri: tour.symbol_image }} style={styles.symbol} />
            ) : (
              <View style={styles.symbolPlaceholder}>
                <Text style={styles.symbolPlaceholderText}>🏆</Text>
              </View>
            )}
            <Text style={styles.tapSymbolHint}>Tap to set image</Text>
          </TouchableOpacity>
          <View style={styles.heroText}>
            <Text style={styles.tourName}>{tour?.name ?? initialName}</Text>
            <Text style={styles.meta}>
              Rolling window = {rollingN} tournament{rollingN === 1 ? '' : 's'} for points · {seasonEvents.length} in{' '}
              {seasonTitle}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>About</Text>
            {!editDesc ? (
              <TouchableOpacity onPress={() => setEditDesc(true)}>
                <Text style={styles.link}>Edit</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onSaveDescription}>
                <Text style={styles.link}>Save</Text>
              </TouchableOpacity>
            )}
          </View>
          {editDesc ? (
            <TextInput
              style={styles.descInput}
              multiline
              placeholder="Tour description"
              placeholderTextColor="#888"
              value={descDraft}
              onChangeText={setDescDraft}
            />
          ) : (
            <Text style={styles.body}>{tour?.description || 'No description yet.'}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Standings</Text>
          <Text style={[styles.footnote, { color: '#fff' }]}>
            Points use the last {rollingN} completed tournament{rollingN === 1 ? '' : 's'} (one full cycle on this schedule).
            Each completed event counts as one “week” for weeks-at-#1.
          </Text>

          {rankings.length === 0 ? (
            <Text style={styles.muted}>Add participants to see rankings.</Text>
          ) : (
            rankings.map((row) => (
              <View key={row.player_id} style={styles.rankRow}>
                <Text style={styles.rankNum}>{row.rank}</Text>
                <Text style={styles.rankName}>{row.player_name}</Text>
                <Text style={styles.rankPts}>{Math.round(row.total_points)}</Text>
              </View>
            ))
          )}
          {sparkline.series.length > 0 && sparkline.labels.length > 0 && (
            <>
              <Text style={[styles.subLabel, { marginTop: 14 }]}>Points trend (rolling window)</Text>
              <Text style={[styles.footnote, { marginTop: 4 }]}>
                Cumulative tour points after each completed event in the window (top {sparkline.series.length}).
              </Text>
              <RollingPointsSparkline labels={sparkline.labels} series={sparkline.series} />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <Text style={[styles.footnote, { marginBottom: 8, color: '#fff' }]}>Roster is set when the tour is created and cannot be changed.</Text>
     
          {participants.length === 0 ? (
            <Text style={styles.muted}>No players on this tour.</Text>
          ) : (
            participants.map((p) => (
              <View key={p.player_id} style={styles.participantRow}>
                <Text style={styles.participantName}>{p.player_name}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Schedule · {seasonTitle}</Text>
          <Text style={[styles.footnote, { color: '#fff' }]}>
            This season’s rounds in order — finished events stay on the list. Only the next open slot can be started. When all
            rounds finish, the next season repeats the same stops (defend points). Calendar & full history: Past tournaments.
          </Text>
          {seasonEvents.length === 0 ? (
            <Text style={styles.muted}>No tournaments in this season yet.</Text>
          ) : (
            <>
              <Text style={[styles.subLabel, { marginTop: 10 }]}>Rounds</Text>
              {sortedSchedule.map((ev) => {
                const canStart = canStartTourEventInSequence(sortedSchedule, ev);
                const podium = podiums[ev.id];
                const isComplete = ev.status === 'complete';
                return (
                  <View
                    key={ev.id}
                    style={[styles.eventCard, isComplete ? styles.eventCardDone : null]}
                  >
                    <View style={styles.eventTitleRow}>
                      <View
                        style={[
                          styles.eventColorDot,
                          {
                            backgroundColor:
                              ev.calendar_color ||
                              TOUR_CALENDAR_COLORS[(ev.sort_order ?? 0) % TOUR_CALENDAR_COLORS.length],
                          },
                        ]}
                      />
                      <Text style={styles.eventName}>{ev.name}</Text>
                    </View>
                    {isComplete ? (
                      <>
                        {podium?.winner ? (
                          <Text style={styles.eventMeta}>Champion: {podium.winner}</Text>
                        ) : null}
                        {podium?.finalist ? (
                          <Text style={styles.eventMeta}>Runner-up: {podium.finalist}</Text>
                        ) : null}
                        {podium?.third ? <Text style={styles.eventMeta}>3rd: {podium.third}</Text> : null}
                        <Text style={styles.eventMeta}>{eventCalendarCaption(ev)}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.eventMeta}>
                          {eventTypeLabel(ev)} · W {ev.winner_points} / F {ev.finalist_points}
                        </Text>
                        <Text style={styles.eventMeta}>{eventBracketSpecs(ev)}</Text>
                        <Text style={styles.eventMeta}>{eventCalendarCaption(ev)}</Text>
                        {!canStart && !ev.linked_tournament_id ? (
                          <Text style={styles.sequenceHint}>
                            Finish earlier rounds in this season before starting this one.
                          </Text>
                        ) : null}
                      </>
                    )}
                    <View style={styles.eventActions}>
                      <TouchableOpacity onPress={() => openScheduleEdit(ev)}>
                        <Text style={styles.link}>Set date / color</Text>
                      </TouchableOpacity>
                      {!isComplete && !ev.linked_tournament_id ? (
                        <TouchableOpacity
                          style={[
                            styles.startBtn,
                            styles.startBtnInRow,
                            (!canStart || participants.length < 2) && styles.startBtnDisabled,
                          ]}
                          disabled={!canStart || participants.length < 2}
                          onPress={() => {
                            const roster = participants.length;
                            const allowed = knockoutDrawSizesAllowed(roster);
                            if (allowed.length === 0) {
                              Alert.alert(
                                'Players',
                                'Add at least two players to this tour before starting a tournament.'
                              );
                              return;
                            }
                            if (!canStartTourEventInSequence(sortedSchedule, ev)) {
                              Alert.alert(
                                'Schedule order',
                                'Finish earlier rounds in this season before starting this one.'
                              );
                              return;
                            }
                            openStartTournament(ev);
                          }}
                        >
                          <Text style={styles.startBtnText}>Start tournament</Text>
                        </TouchableOpacity>
                      ) : null}
                      {!isComplete && ev.linked_tournament_id ? (
                        <TouchableOpacity
                          style={[styles.openBracketBtn, styles.openBracketInRow]}
                          onPress={() =>
                            navigation.navigate('TournamentDetail', {
                              tournamentId: ev.linked_tournament_id,
                              tournamentName: ev.bracket_name || ev.name,
                            })
                          }
                        >
                          <Text style={styles.openBracketText}>
                            {ev.status === 'complete' ? 'View bracket' : 'Open bracket →'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {isComplete && ev.linked_tournament_id ? (
                        <TouchableOpacity
                          style={[styles.openBracketBtn, styles.openBracketInRow]}
                          onPress={() =>
                            navigation.navigate('TournamentDetail', {
                              tournamentId: ev.linked_tournament_id,
                              tournamentName: ev.bracket_name || ev.name,
                            })
                          }
                        >
                          <Text style={styles.openBracketText}>View bracket</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>

        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statsHalfBtn}
            onPress={() => navigation.navigate('TourStats', { tourId, tourName: tour?.name ?? initialName })}
          >
            <Text style={styles.statsHalfBtnText}>Tour stats</Text>
            <Text style={styles.statsHalfBtnSub}>H2H, duration…</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statsHalfBtn}
            onPress={() => navigation.navigate('TourHistory', { tourId, tourName: tour?.name ?? initialName })}
          >
            <Text style={styles.statsHalfBtnText}>Past tournaments</Text>
            <Text style={styles.statsHalfBtnSub}>All seasons · cards & calendar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={!!scheduleEditEvent} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Calendar · {scheduleEditEvent?.name}</Text>
            <Text style={styles.modalHint}>
              Slot date (YYYY-MM-DD). Moving a day does not change weeks-at-#1 — that still follows schedule order.
            </Text>
            <Text style={styles.label}>Slot date</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="2026-04-18"
              placeholderTextColor="#666"
              value={scheduleDraftDate}
              onChangeText={setScheduleDraftDate}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>Color</Text>
            <View style={styles.colorRow}>
              {TOUR_CALENDAR_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c },
                    scheduleDraftColor === c && styles.colorChipOn,
                  ]}
                  onPress={() => setScheduleDraftColor(c)}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={saveScheduleEdit}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setScheduleEditEvent(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!startModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start tournament · {startModal?.name}</Text>
            <Text style={styles.modalHint}>
              {startModal?.match_mode === 'random'
                ? 'Random: tour players are shuffled into bracket slots (same roster rules).'
                : 'Seeds: top N on current tour standings are seeds 1–N (standard knockout placement).'}
            </Text>
            <Text style={styles.label}>Draw</Text>
            <Text style={styles.modalHint}>
              {participants.length < 2
                ? 'Need at least 2 players on the tour.'
                : `Using the ${clampDrawSizeToParticipants(startModal?.draw_size ?? 8, participants.length) ?? '—'}-player draw from this event’s schedule (capped by your ${participants.length}-player roster).`}
            </Text>
            {startModal?.event_type === 'tourfinals' ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.modalHint}>Tour Finals automatically uses the current top two ranked players.</Text>
                {rankings.slice(0, 2).map((r, idx) => (
                  <View key={r.player_id} style={styles.participantRow}>
                    <Text style={styles.participantName}>#{idx + 1} {r.player_name}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 190, marginTop: 8 }} nestedScrollEnabled>
                {participants.map((p) => {
                  const on = startPlayerIds.has(p.player_id);
                  return (
                    <TouchableOpacity
                      key={p.player_id}
                      style={[styles.playerPickRow, on && styles.playerPickRowOn]}
                      onPress={() => {
                        setStartPlayerIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.player_id)) next.delete(p.player_id);
                          else next.add(p.player_id);
                          return next;
                        });
                      }}
                    >
                      <Text style={styles.playerPickText}>{on ? '✓ ' : ''}{p.player_name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {startModal?.event_type !== 'tourfinals' && !startSelectionOk ? (
              <Text style={styles.selectionWarning}>
                Selected {startSelectionCount}; select exactly {startRequiredDrawSize} to create this tournament.
              </Text>
            ) : null}
            <TouchableOpacity style={[styles.primaryBtn, !startSelectionOk && styles.primaryBtnDisabled]} onPress={runStartTournament}>
              <Text style={styles.primaryBtnText}>Create draw & open</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setStartModal(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 14 },
  symbol: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#222' },
  symbolPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolPlaceholderText: { fontSize: 32 },
  tapSymbolHint: { fontSize: 10, color: '#999', marginTop: 4, textAlign: 'center' },
  heroText: { flex: 1 },
  tourName: { fontSize: 22, fontWeight: '700', color: '#fff' },
  meta: { fontSize: 13, color: '#ccc', marginTop: 4 },
  footnote: { color: '#999', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.28)',
  },
  rankNum: { width: 28, color: '#7fd99a', fontWeight: '700', fontSize: 15 },
  rankName: { flex: 1, color: '#fff', fontSize: 15 },
  rankPts: { color: '#fff', fontWeight: '600', fontSize: 15 },
  subLabel: { color: '#7fd99a', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  link: { color: '#7fd99a', fontWeight: '600' },
  body: { color: '#e8e8e8', fontSize: 15, lineHeight: 22 },
  descInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 15,
  },
  muted: { color: '#aaa', fontSize: 14 },
  participantRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.28)',
  },
  participantName: { color: '#fff', fontSize: 16 },
  playerPickRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  playerPickRowOn: {
    backgroundColor: 'rgba(127,217,154,0.22)',
    borderColor: 'rgba(127,217,154,0.8)',
  },
  playerPickText: { color: '#fff', fontWeight: '700' },
  primaryBtn: {
    backgroundColor: '#2d6a4f',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.62 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  selectionWarning: {
    color: '#ffd166',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 2,
  },
  startBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#2d6a4f',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startBtnInRow: { marginTop: 0 },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  openBracketBtn: { marginTop: 8 },
  openBracketInRow: { marginTop: 0 },
  openBracketText: { color: '#7fd99a', fontSize: 14, fontWeight: '600' },
  eventCard: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  eventCardDone: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  eventName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  eventMeta: { color: '#bbb', fontSize: 13, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  statsHalfBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  statsHalfBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statsHalfBtnSub: { color: '#bbb', fontSize: 11, marginTop: 4, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 12 },
  label: { color: '#aaa', fontSize: 13, marginTop: 10, marginBottom: 6 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  typeChipOn: { backgroundColor: '#2d6a4f' },
  typeChipText: { color: '#ccc', fontSize: 13 },
  typeChipTextOn: { color: '#fff', fontWeight: '600' },
  modalClose: { marginTop: 12, alignItems: 'center' },
  modalCloseText: { color: '#888', fontSize: 16 },
  modalHint: { color: '#aaa', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  dateInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  colorChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorChipOn: { borderColor: '#fff' },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  eventColorDot: { width: 10, height: 10, borderRadius: 5 },
  eventActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  sparkLegendSwatch: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  sparkLegendText: { color: '#ccc', fontSize: 11, maxWidth: 140 },
  startBtnDisabled: { opacity: 0.45 },
  sequenceHint: { color: '#fbbf24', fontSize: 12, marginTop: 8, lineHeight: 16 },
});
