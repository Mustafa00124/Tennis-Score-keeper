import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTourWithDetails, TOUR_EVENT_TYPES, updateTourEvent } from '../db/database';
import {
  buildTourCalendarGraph,
  TOUR_CALENDAR_COLORS,
  DAY_NAMES,
  formatShortDate,
  parseDateStr,
  TOUR_CALENDAR_DAY_COLUMN_WIDTH,
  TOUR_CALENDAR_SEGMENT_HEIGHT,
} from '../utils/tourCalendar';

function eventTypeLabel(ev) {
  if (ev.event_type === '400') return 'Grand Slam';
  return TOUR_EVENT_TYPES[ev.event_type]?.label || ev.event_type;
}

function eventCalendarCaption(ev) {
  const slot = ev.scheduled_date && ev.scheduled_date.length >= 10 ? formatShortDate(ev.scheduled_date) : '—';
  if (ev.status === 'complete' && ev.completed_at) {
    return `Played ${formatShortDate(ev.completed_at.slice(0, 10))} · slot ${slot}`;
  }
  return `Slot ${slot}`;
}

function eventBracketSpecs(ev) {
  const d = ev.draw_size ?? 8;
  const m = ev.match_mode === 'random' ? 'Random pairings' : 'Seeded by tour ranking';
  return `${d}-player draw · ${m}`;
}

function eventStatusLine(ev) {
  if (ev.status === 'complete') return 'Completed';
  if (ev.status === 'ongoing') return 'In progress';
  return 'Scheduled';
}

export default function TourHistoryScreen({ route, navigation }) {
  const { tourId, tourName: initialName } = route.params || {};
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [view, setView] = useState('cards'); // 'cards' | 'calendar'
  const [scheduleEditEvent, setScheduleEditEvent] = useState(null);
  const [scheduleDraftDate, setScheduleDraftDate] = useState('');
  const [scheduleDraftColor, setScheduleDraftColor] = useState(TOUR_CALENDAR_COLORS[0]);

  const load = useCallback(async () => {
    if (!tourId) return;
    const t = await getTourWithDetails(tourId);
    setData(t);
  }, [tourId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  React.useEffect(() => {
    navigation.setOptions({ title: data?.tour?.name ? `${data.tour.name} · History` : 'Past tournaments' });
  }, [navigation, data?.tour?.name]);

  const tour = data?.tour;
  const events = data?.events ?? [];
  const sortedAll = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          (a.season_sort_order ?? 0) - (b.season_sort_order ?? 0) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.id - b.id
      ),
    [events]
  );
  const graphData = useMemo(() => buildTourCalendarGraph(sortedAll), [sortedAll]);

  const goToBracket = (ev) => {
    if (!ev.linked_tournament_id) return;
    navigation.navigate('TournamentDetail', {
      tournamentId: ev.linked_tournament_id,
      tournamentName: ev.bracket_name || ev.name,
    });
  };

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

  return (
    <ImageBackground source={require('../../media/Tournament.jpg')} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 12, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Full archive across all seasons (schedule order). Tap a row with a bracket to open it. Calendar uses slot or
          completion dates.
        </Text>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'cards' && styles.toggleBtnOn]}
            onPress={() => setView('cards')}
            activeOpacity={0.85}
          >
            <Text style={[styles.toggleText, view === 'cards' && styles.toggleTextOn]}>Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'calendar' && styles.toggleBtnOn]}
            onPress={() => setView('calendar')}
            activeOpacity={0.85}
          >
            <Text style={[styles.toggleText, view === 'calendar' && styles.toggleTextOn]}>Calendar</Text>
          </TouchableOpacity>
        </View>

        {events.length === 0 ? (
          <Text style={styles.muted}>No tournaments on this tour yet.</Text>
        ) : view === 'cards' ? (
          sortedAll.map((ev) => (
            <View key={ev.id} style={styles.eventCard}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!ev.linked_tournament_id}
                onPress={() => goToBracket(ev)}
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
                {ev.season_name ? (
                  <Text style={styles.eventMeta}>{ev.season_name}</Text>
                ) : null}
                <Text style={styles.eventMeta}>
                  {eventStatusLine(ev)} · {eventTypeLabel(ev)}
                </Text>
                <Text style={styles.eventMeta}>{eventBracketSpecs(ev)}</Text>
                <Text style={styles.eventMeta}>{eventCalendarCaption(ev)}</Text>
                {!ev.linked_tournament_id ? (
                  <Text style={styles.warn}>No bracket linked</Text>
                ) : (
                  <Text style={styles.linkHint}>Tap to view bracket →</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.editSlotBtn} onPress={() => openScheduleEdit(ev)}>
                <Text style={styles.editSlotText}>Set slot / color</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : graphData.length === 0 ? (
          <Text style={styles.muted}>Set completion dates on events to see them on the calendar.</Text>
        ) : (
          graphData.map(({ year, months }) => (
            <View key={year} style={styles.graphYearBlock}>
              {months.map(({ monthLabelFull, days }) => (
                <View key={`${year}-${monthLabelFull}`} style={styles.graphMonthCard}>
                  <Text style={styles.graphMonthTitle}>
                    {monthLabelFull} {year}
                  </Text>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.graphXAxisWrap}
                  >
                    {days.map((day) => {
                      const dayNum = day.date.getDate();
                      const dayName = DAY_NAMES[day.date.getDay()];
                      const segCount = day.segments.length;
                      const barHeight = segCount > 0 ? segCount * TOUR_CALENDAR_SEGMENT_HEIGHT + 4 : 0;
                      return (
                        <View key={day.dateStr} style={styles.graphDayColumn}>
                          <View style={styles.graphDayBarColumn}>
                            {segCount > 0 && (
                              <View style={[styles.graphVerticalBar, { height: barHeight }]}>
                                {day.segments.map((seg) => (
                                  <TouchableOpacity
                                    key={seg.eventId}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                      const ev = sortedAll.find((e) => e.id === seg.eventId);
                                      if (ev) goToBracket(ev);
                                    }}
                                    disabled={!seg.linked_tournament_id}
                                    style={[
                                      styles.graphSeg,
                                      {
                                        height: TOUR_CALENDAR_SEGMENT_HEIGHT,
                                        backgroundColor: seg.color,
                                        opacity: seg.linked_tournament_id ? 1 : 0.55,
                                      },
                                    ]}
                                  />
                                ))}
                              </View>
                            )}
                          </View>
                          <Text style={styles.graphXAxisLabel}>{dayNum}</Text>
                          <Text style={styles.graphXAxisDay}>{dayName}</Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!scheduleEditEvent} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Calendar · {scheduleEditEvent?.name}</Text>
            <Text style={styles.modalHint}>
              Slot date (YYYY-MM-DD). Moving a day does not change weeks-at-#1 — that still follows schedule order.
            </Text>
            <Text style={styles.modalLabel}>Slot date</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="2026-04-18"
              placeholderTextColor="#666"
              value={scheduleDraftDate}
              onChangeText={setScheduleDraftDate}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalLabel}>Color</Text>
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lead: { color: '#ccc', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  muted: { color: '#aaa', fontSize: 14 },
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  toggleBtnOn: {
    backgroundColor: 'rgba(127,217,154,0.35)',
    borderColor: 'rgba(127,217,154,0.85)',
  },
  toggleText: { color: '#ccc', fontWeight: '600', fontSize: 14 },
  toggleTextOn: { color: '#fff' },
  eventCard: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  eventColorDot: { width: 10, height: 10, borderRadius: 5 },
  eventName: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
  eventMeta: { color: '#bbb', fontSize: 13, marginTop: 4 },
  linkHint: { color: '#7fd99a', fontSize: 13, marginTop: 8, fontWeight: '600' },
  warn: { color: '#fca5a5', fontSize: 12, marginTop: 6 },
  graphYearBlock: { marginBottom: 8 },
  graphMonthCard: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(26,71,42,0.28)',
  },
  graphMonthTitle: { fontSize: 16, fontWeight: '700', color: '#1a472a', marginBottom: 10 },
  graphXAxisWrap: { paddingVertical: 8, paddingRight: 16, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  graphDayColumn: {
    width: TOUR_CALENDAR_DAY_COLUMN_WIDTH,
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
  graphSeg: { width: '100%' },
  graphXAxisLabel: { fontSize: 11, fontWeight: '600', color: '#333' },
  graphXAxisDay: { fontSize: 9, color: '#666', marginTop: 1 },
  editSlotBtn: { marginTop: 10, alignSelf: 'flex-start' },
  editSlotText: { color: '#7fd99a', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 12 },
  modalHint: { color: '#aaa', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  modalLabel: { color: '#aaa', fontSize: 13, marginTop: 10, marginBottom: 6 },
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
  primaryBtn: {
    backgroundColor: '#2d6a4f',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  modalClose: { marginTop: 12, alignItems: 'center' },
  modalCloseText: { color: '#888', fontSize: 16 },
});
