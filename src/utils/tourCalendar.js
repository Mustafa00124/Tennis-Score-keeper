/** Distinct colors for tour events on the schedule calendar (cycle by index). */
export const TOUR_CALENDAR_COLORS = [
  '#2563eb',
  '#b91c1c',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const TOUR_CALENDAR_DAY_COLUMN_WIDTH = 26;
export const TOUR_CALENDAR_SEGMENT_HEIGHT = 10;

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function parseDateStr(str) {
  if (!str || str.length < 10) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

/** Date shown on calendar: completion day when finished, else scheduled slot. */
export function calendarDisplayDay(ev) {
  if (!ev) return null;
  if (ev.status === 'complete' && ev.completed_at) {
    return ev.completed_at.slice(0, 10);
  }
  const s = ev.scheduled_date;
  return s && s.length >= 10 ? s.slice(0, 10) : null;
}

export function formatShortDate(isoYmd) {
  if (!isoYmd || isoYmd.length < 10) return '—';
  const p = parseDateStr(isoYmd);
  if (!p) return isoYmd;
  return `${MONTH_NAMES[p.getMonth()]} ${p.getDate()}, ${p.getFullYear()}`;
}

function groupTourDaysByYearMonth(fullDays) {
  const byYear = {};
  for (const day of fullDays) {
    const y = day.date.getFullYear();
    const m = day.date.getMonth();
    if (!byYear[y]) byYear[y] = {};
    if (!byYear[y][m]) byYear[y][m] = [];
    byYear[y][m].push(day);
  }
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b);
  return years.map((year) => {
    const monthIndices = Object.keys(byYear[year])
      .map(Number)
      .sort((a, b) => a - b);
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

/**
 * Matchup-style month blocks with horizontal day columns; each day has `segments`
 * for tournaments on that calendar day.
 */
export function buildTourCalendarGraph(events) {
  const byDate = {};
  for (const ev of events) {
    const key = calendarDisplayDay(ev);
    if (!key) continue;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push({
      eventId: ev.id,
      name: ev.name,
      color: ev.calendar_color || TOUR_CALENDAR_COLORS[(ev.sort_order ?? 0) % TOUR_CALENDAR_COLORS.length],
      linked_tournament_id: ev.linked_tournament_id,
    });
  }
  const keys = Object.keys(byDate).filter(Boolean).sort();
  if (keys.length === 0) return [];
  const start = parseDateStr(keys[0]);
  if (!start) return [];
  const parsedEnds = keys.map(parseDateStr).filter(Boolean);
  const end = parsedEnds.concat([new Date()]).reduce((a, b) => (a > b ? a : b));
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const list = [];
  let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (d <= endDay) {
    const dateStr = toDateStr(d);
    list.push({
      dateStr,
      date: new Date(d),
      segments: byDate[dateStr] || [],
    });
    d = addDays(d, 1);
  }
  return groupTourDaysByYearMonth(list);
}
