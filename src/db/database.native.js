import { openDatabaseAsync, defaultDatabaseDirectory } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import {
  isSetComplete,
  formatSetScoreDisplay,
  parseTournamentScoreAggregateFromBracketString,
  computeTourBracketPairDetailedStats,
} from '../utils/tennisScoring';
import { TOUR_CALENDAR_COLORS, toDateStr, addDays, parseDateStr } from '../utils/tourCalendar';
import { shuffle, tournamentDrawFromSeeds } from '../utils/knockoutSeeding';

/** On-device SQLite filename (was `tennis_scorekeeper.db`; migrated on first launch if needed). */
const DB_NAME = 'tennis_statbot.db';
const LEGACY_DB_FILE = 'tennis_scorekeeper.db';

/** Move legacy DB file so existing installs keep data after rename. */
async function migrateLegacySqliteFileIfNeeded() {
  try {
    const dir = defaultDatabaseDirectory;
    if (dir == null || typeof dir !== 'string') return;
    const base = dir.replace(/\/+$/, '');
    const legacyPath = `${base}/${LEGACY_DB_FILE}`;
    const newPath = `${base}/${DB_NAME}`;
    const newInfo = await FileSystem.getInfoAsync(newPath);
    if (newInfo.exists) return;
    const legacyInfo = await FileSystem.getInfoAsync(legacyPath);
    if (!legacyInfo.exists) return;
    await FileSystem.moveAsync({ from: legacyPath, to: newPath });
  } catch (_) {
    /* non-fatal */
  }
}

/**
 * Single-flight DB open + schema/migrations. Important: we must NOT expose the
 * SQLite handle until execAsync(SCHEMA) completes; otherwise concurrent getDb()
 * callers can run queries mid-migration and hit NativeDatabase.prepareAsync NPE
 * (common in release builds; Expo Go timing often hides it).
 */
let dbPromise = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    profile_image TEXT,
    description TEXT,
    start_date TEXT,
    racket_level TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    date_played TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    remarks TEXT,
    images TEXT,
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS set_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    set_number INTEGER NOT NULL,
    games_player1 INTEGER NOT NULL,
    games_player2 INTEGER NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_id);
  CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_id);
  CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date_played);
  CREATE INDEX IF NOT EXISTS idx_set_scores_match ON set_scores(match_id);

  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ongoing',
    draw_size INTEGER NOT NULL,
    format TEXT DEFAULT 'knockout',
    date TEXT,
    description TEXT,
    remarks TEXT,
    images TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tournament_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    player_id INTEGER,
    display_name TEXT NOT NULL,
    slot INTEGER NOT NULL,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
  );
  CREATE TABLE IF NOT EXISTS tournament_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    round INTEGER NOT NULL,
    match_index_in_round INTEGER NOT NULL,
    player1_participant_id INTEGER,
    player2_participant_id INTEGER,
    winner_participant_id INTEGER,
    linked_match_id INTEGER,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (player1_participant_id) REFERENCES tournament_participants(id),
    FOREIGN KEY (player2_participant_id) REFERENCES tournament_participants(id),
    FOREIGN KEY (winner_participant_id) REFERENCES tournament_participants(id),
    FOREIGN KEY (linked_match_id) REFERENCES matches(id)
  );
  CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON tournament_participants(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
`;

async function openDatabaseAndMigrate() {
  // Android: native SQLite module can NPE on execAsync if we open before the context is ready (cold start / fast refresh).
  if (Platform.OS === 'android') {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  await migrateLegacySqliteFileIfNeeded();
  const database = await openDatabaseAsync(DB_NAME);
  if (!database?.execAsync) {
    throw new Error('SQLite openDatabaseAsync returned an invalid handle');
  }
  await database.execAsync('PRAGMA foreign_keys = ON;');
  await database.execAsync(SCHEMA);
  try {
    await database.execAsync('ALTER TABLE players ADD COLUMN profile_image TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE players ADD COLUMN description TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE players ADD COLUMN start_date TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE players ADD COLUMN racket_level TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE matches ADD COLUMN remarks TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE matches ADD COLUMN images TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournaments ADD COLUMN date TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournaments ADD COLUMN description TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournaments ADD COLUMN remarks TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournaments ADD COLUMN images TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE set_scores ADD COLUMN tiebreak_player1 INTEGER');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE set_scores ADD COLUMN tiebreak_player2 INTEGER');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournaments ADD COLUMN format TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournament_matches ADD COLUMN remark TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournament_matches ADD COLUMN score TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournament_matches ADD COLUMN match_date TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tournament_matches ADD COLUMN remarks TEXT');
  } catch (_) {}
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS tours (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        symbol_image TEXT,
        season_start_date TEXT,
        rolling_weeks INTEGER NOT NULL DEFAULT 4,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tour_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tour_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
        UNIQUE(tour_id, player_id)
      );
      CREATE TABLE IF NOT EXISTS tour_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tour_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT '200',
        winner_points REAL NOT NULL,
        finalist_points REAL NOT NULL,
        linked_tournament_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        completed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS tour_point_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tour_id INTEGER NOT NULL,
        tour_event_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        points REAL NOT NULL,
        role TEXT NOT NULL,
        earned_at TEXT NOT NULL,
        FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
        FOREIGN KEY (tour_event_id) REFERENCES tour_events(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tour_participants_tour ON tour_participants(tour_id);
      CREATE INDEX IF NOT EXISTS idx_tour_events_tour ON tour_events(tour_id);
      CREATE INDEX IF NOT EXISTS idx_tour_point_entries_tour ON tour_point_entries(tour_id);
      CREATE INDEX IF NOT EXISTS idx_tour_point_entries_earned ON tour_point_entries(earned_at);
    `);
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tour_events ADD COLUMN scheduled_date TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tour_events ADD COLUMN calendar_color TEXT');
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tour_events ADD COLUMN draw_size INTEGER NOT NULL DEFAULT 8');
  } catch (_) {}
  try {
    await database.execAsync("ALTER TABLE tour_events ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'seeds'");
  } catch (_) {}
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS tour_seasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tour_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tour_seasons_tour ON tour_seasons(tour_id);
    `);
  } catch (_) {}
  try {
    await database.execAsync('ALTER TABLE tour_events ADD COLUMN season_id INTEGER REFERENCES tour_seasons(id)');
  } catch (_) {}
  await ensureTourSeasonsBackfill(database);
  await backfillTourEventCalendar(database);
  return database;
}

/** One-time: every tour gets a default season; orphan events attach to it. */
async function ensureTourSeasonsBackfill(database) {
  try {
    const tours = await database.getAllAsync('SELECT id FROM tours');
    for (const { id: tourId } of tours) {
      let rows = await database.getAllAsync('SELECT id FROM tour_seasons WHERE tour_id = ? ORDER BY sort_order ASC', [tourId]);
      let seasonId;
      if (rows.length === 0) {
        const r = await database.runAsync(
          'INSERT INTO tour_seasons (tour_id, sort_order, name) VALUES (?, 0, ?)',
          [tourId, 'Season 1']
        );
        seasonId = r.lastInsertRowId;
      } else {
        seasonId = rows[0].id;
      }
      await database.runAsync('UPDATE tour_events SET season_id = ? WHERE tour_id = ? AND season_id IS NULL', [
        seasonId,
        tourId,
      ]);
    }
  } catch (_) {
    /* non-fatal */
  }
}

async function backfillTourEventCalendar(database) {
  try {
    const rows = await database.getAllAsync(
      `SELECT te.id, te.tour_id, te.sort_order, te.scheduled_date, te.calendar_color, t.created_at AS tour_created
       FROM tour_events te JOIN tours t ON t.id = te.tour_id`
    );
    for (const r of rows) {
      const needsDate = !r.scheduled_date || String(r.scheduled_date).length < 10;
      const needsColor = !r.calendar_color || !/^#[0-9a-fA-F]{6}$/i.test(String(r.calendar_color));
      if (!needsDate && !needsColor) continue;
      let sd = r.scheduled_date;
      if (needsDate) {
        const baseStr = (r.tour_created || '').slice(0, 10) || toDateStr(new Date());
        const base = parseDateStr(baseStr) || new Date();
        const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
        sd = toDateStr(addDays(start, (r.sort_order ?? 0) * 7));
      }
      const col =
        needsColor
          ? TOUR_CALENDAR_COLORS[(r.sort_order ?? 0) % TOUR_CALENDAR_COLORS.length]
          : r.calendar_color;
      await database.runAsync('UPDATE tour_events SET scheduled_date = ?, calendar_color = ? WHERE id = ?', [
        sd,
        col,
        r.id,
      ]);
    }
  } catch (_) {
    /* non-fatal */
  }
}

async function openDatabaseAndMigrateWithRetry() {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (Platform.OS === 'android' && attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
      return await openDatabaseAndMigrate();
    } catch (e) {
      lastError = e;
      if (__DEV__) {
        console.warn(`[sqlite] open attempt ${attempt + 1}/3 failed`, e?.message || e);
      }
    }
  }
  throw lastError;
}

export async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        return await openDatabaseAndMigrateWithRetry();
      } catch (e) {
        dbPromise = null;
        throw e;
      }
    })();
  }
  return dbPromise;
}

// --- Tournaments ---
function isValidDrawSize(n) {
  return n >= 2 && n <= 64 && (n & (n - 1)) === 0;
}

/** Power-of-2 draw sizes for tour events (default 8). */
function normalizeTourEventDrawSize(n) {
  const v = parseInt(n, 10) || 8;
  return isValidDrawSize(v) ? v : 8;
}

export async function getTournamentById(tournamentId) {
  const database = await getDb();
  const t = await database.getFirstAsync('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  return t ?? null;
}

/** New brackets are always knockout (tour-linked). Legacy DB rows may still have format = round_robin. */
export async function createTournament(name, drawSize, opts = {}) {
  const database = await getDb();
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Tournament name is required');
  const size = parseInt(drawSize, 10) || 8;
  if (!isValidDrawSize(size)) throw new Error('Draw size must be 2, 4, 8, 16, 32, or 64');
  const date = (opts.date || '').trim() || null;
  const description = (opts.description || '').trim() || null;
  const remarks = (opts.remarks || '').trim() || null;
  const images = Array.isArray(opts.images) ? JSON.stringify(opts.images) : (opts.images || null);
  const result = await database.runAsync(
    'INSERT INTO tournaments (name, status, draw_size, format, date, description, remarks, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [trimmed, 'ongoing', size, 'knockout', date, description, remarks, images]
  );
  return result.lastInsertRowId;
}

export async function updateTournament(tournamentId, updates = {}) {
  const database = await getDb();
  const fields = [];
  const values = [];
  if (updates.date !== undefined) {
    fields.push('date = ?');
    values.push((updates.date || '').trim() || null);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push((updates.description || '').trim() || null);
  }
  if (updates.remarks !== undefined) {
    fields.push('remarks = ?');
    values.push((updates.remarks || '').trim() || null);
  }
  if (updates.images !== undefined) {
    const img = updates.images;
    fields.push('images = ?');
    values.push(Array.isArray(img) ? JSON.stringify(img) : (img || null));
  }
  if (updates.format !== undefined) {
    fields.push('format = ?');
    values.push(updates.format);
  }
  if (!fields.length) return;
  values.push(tournamentId);
  await database.runAsync(`UPDATE tournaments SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function addTournamentParticipant(tournamentId, { playerId, displayName }, slot) {
  const database = await getDb();
  const name = (displayName || '').trim() || 'Unknown';
  let assignedSlot = slot;
  if (assignedSlot == null) {
    const count = await database.getFirstAsync(
      'SELECT COUNT(*) AS c FROM tournament_participants WHERE tournament_id = ?',
      [tournamentId]
    );
    assignedSlot = count?.c ?? 0;
  }
  const result = await database.runAsync(
    'INSERT INTO tournament_participants (tournament_id, player_id, display_name, slot) VALUES (?, ?, ?, ?)',
    [tournamentId, playerId ?? null, name, assignedSlot]
  );
  return result.lastInsertRowId;
}

export async function getTournamentParticipants(tournamentId) {
  const database = await getDb();
  const rows = await database.getAllAsync(
    `SELECT p.*, pl.name AS player_name FROM tournament_participants p
     LEFT JOIN players pl ON pl.id = p.player_id
     WHERE p.tournament_id = ? ORDER BY p.slot`,
    [tournamentId]
  );
  return rows.map((r) => ({
    ...r,
    display_name: r.display_name || r.player_name || 'Unknown',
  }));
}

export async function setTournamentDraw(tournamentId, participantIdsBySlot) {
  const tournament = await getTournamentById(tournamentId);
  if (tournament?.format === 'round_robin') return;
  const database = await getDb();
  for (let slot = 0; slot < participantIdsBySlot.length; slot++) {
    const participantId = participantIdsBySlot[slot];
    if (participantId != null) {
      await database.runAsync('UPDATE tournament_participants SET slot = ? WHERE id = ? AND tournament_id = ?', [
        slot,
        participantId,
        tournamentId,
      ]);
    }
  }
  const drawSize = tournament?.draw_size ?? 8;
  const numFirstRoundMatches = drawSize / 2;
  await database.runAsync('DELETE FROM tournament_matches WHERE tournament_id = ?', [tournamentId]);
  const participants = await database.getAllAsync(
    'SELECT id, slot FROM tournament_participants WHERE tournament_id = ? ORDER BY slot',
    [tournamentId]
  );
  const slotToParticipant = Object.fromEntries(participants.map((p) => [p.slot, p.id]));
  let round = 0;
  let matchesInRound = numFirstRoundMatches;
  const matchInserts = [];
  while (matchesInRound >= 1) {
    for (let i = 0; i < matchesInRound; i++) {
      let p1 = null;
      let p2 = null;
      if (round === 0) {
        p1 = slotToParticipant[i * 2] ?? null;
        p2 = slotToParticipant[i * 2 + 1] ?? null;
      }
      matchInserts.push({ tournament_id: tournamentId, round, match_index_in_round: i, p1, p2 });
    }
    round++;
    matchesInRound = Math.floor(matchesInRound / 2);
  }
  for (const row of matchInserts) {
    await database.runAsync(
      `INSERT INTO tournament_matches (tournament_id, round, match_index_in_round, player1_participant_id, player2_participant_id)
       VALUES (?, ?, ?, ?, ?)`,
      [row.tournament_id, row.round, row.match_index_in_round, row.p1, row.p2]
    );
  }
  if (drawSize >= 4 && matchInserts.length) {
    const lastBracketRound = Math.max(...matchInserts.map((m) => m.round));
    await database.runAsync(
      `INSERT INTO tournament_matches (tournament_id, round, match_index_in_round, player1_participant_id, player2_participant_id)
       VALUES (?, ?, 1, NULL, NULL)`,
      [tournamentId, lastBracketRound]
    );
  }
}

export async function getTournamentMatches(tournamentId) {
  const database = await getDb();
  return database.getAllAsync(
    `SELECT m.*,
      p1.display_name AS player1_name, p1.player_id AS player1_app_id,
      p2.display_name AS player2_name, p2.player_id AS player2_app_id
     FROM tournament_matches m
     LEFT JOIN tournament_participants p1 ON p1.id = m.player1_participant_id
     LEFT JOIN tournament_participants p2 ON p2.id = m.player2_participant_id
     WHERE m.tournament_id = ?
     ORDER BY m.round ASC, m.match_index_in_round ASC`,
    [tournamentId]
  );
}

export async function getTournamentWithBracket(tournamentId) {
  const [tournament, participants, matches] = await Promise.all([
    getTournamentById(tournamentId),
    getTournamentParticipants(tournamentId),
    getTournamentMatches(tournamentId),
  ]);
  if (!tournament) return null;
  const partById = Object.fromEntries(participants.map((p) => [p.id, p]));
  const matchesWithNames = matches.map((m) => ({
    ...m,
    player1_name: m.player1_name ?? partById[m.player1_participant_id]?.display_name ?? 'TBD',
    player2_name: m.player2_name ?? partById[m.player2_participant_id]?.display_name ?? 'TBD',
  }));
  return { tournament, participants, matches: matchesWithNames };
}

/** Award ranking points when a knockout bracket linked to a tour event completes. */
async function awardTourPointsIfKnockoutComplete(tournamentId) {
  const database = await getDb();
  const t = await database.getFirstAsync('SELECT id, status, format FROM tournaments WHERE id = ?', [tournamentId]);
  if (!t || t.status !== 'complete' || t.format === 'round_robin') return;
  const ev = await database.getFirstAsync('SELECT * FROM tour_events WHERE linked_tournament_id = ?', [tournamentId]);
  if (!ev) return;
  const cnt = await database.getFirstAsync('SELECT COUNT(*) AS c FROM tour_point_entries WHERE tour_event_id = ?', [ev.id]);
  if (cnt && cnt.c > 0) return;
  const matches = await database.getAllAsync('SELECT * FROM tournament_matches WHERE tournament_id = ?', [tournamentId]);
  if (!matches.length) return;
  const maxR = Math.max(...matches.map((m) => m.round));
  const final = matches.find((m) => m.round === maxR && m.match_index_in_round === 0);
  const bronze = matches.find((m) => m.round === maxR && m.match_index_in_round === 1);
  if (!final?.winner_participant_id) return;
  if (bronze && !bronze.winner_participant_id) return;
  const winnerPid = final.winner_participant_id;
  const loserPid =
    final.player1_participant_id === winnerPid ? final.player2_participant_id : final.player1_participant_id;
  const winPart = await database.getFirstAsync('SELECT player_id FROM tournament_participants WHERE id = ?', [winnerPid]);
  const losePart = await database.getFirstAsync('SELECT player_id FROM tournament_participants WHERE id = ?', [loserPid]);
  const winnerPlayerId = winPart?.player_id;
  const finalistPlayerId = losePart?.player_id;
  if (winnerPlayerId == null || finalistPlayerId == null) return;
  const earnedAt = new Date().toISOString().slice(0, 10);
  await database.runAsync(
    `INSERT INTO tour_point_entries (tour_id, tour_event_id, player_id, points, role, earned_at) VALUES (?, ?, ?, ?, 'winner', ?)`,
    [ev.tour_id, ev.id, winnerPlayerId, ev.winner_points, earnedAt]
  );
  await database.runAsync(
    `INSERT INTO tour_point_entries (tour_id, tour_event_id, player_id, points, role, earned_at) VALUES (?, ?, ?, ?, 'finalist', ?)`,
    [ev.tour_id, ev.id, finalistPlayerId, ev.finalist_points, earnedAt]
  );
  if (bronze?.winner_participant_id) {
    const thirdPid = bronze.winner_participant_id;
    const thirdPart = await database.getFirstAsync('SELECT player_id FROM tournament_participants WHERE id = ?', [thirdPid]);
    const thirdPlayerId = thirdPart?.player_id;
    if (thirdPlayerId != null) {
      const thirdPoints = (ev.finalist_points ?? 0) / 2;
      await database.runAsync(
        `INSERT INTO tour_point_entries (tour_id, tour_event_id, player_id, points, role, earned_at) VALUES (?, ?, ?, ?, 'third', ?)`,
        [ev.tour_id, ev.id, thirdPlayerId, thirdPoints, earnedAt]
      );
    }
  }
  await database.runAsync(`UPDATE tour_events SET status = 'complete', completed_at = ? WHERE id = ?`, [earnedAt, ev.id]);
}

async function tryFinalizeKnockoutTournament(database, tournamentId) {
  const t = await database.getFirstAsync('SELECT id, format, draw_size FROM tournaments WHERE id = ?', [tournamentId]);
  if (!t || t.format === 'round_robin') return;
  const drawSize = t.draw_size ?? 8;
  const matches = await database.getAllAsync('SELECT * FROM tournament_matches WHERE tournament_id = ?', [tournamentId]);
  if (!matches.length) return;
  const maxR = Math.max(...matches.map((m) => m.round));
  const finalM = matches.find((m) => m.round === maxR && m.match_index_in_round === 0);
  const bronzeM = matches.find((m) => m.round === maxR && m.match_index_in_round === 1);
  if (!finalM?.winner_participant_id) return;
  if (drawSize >= 4 && bronzeM && !bronzeM.winner_participant_id) return;
  await database.runAsync("UPDATE tournaments SET status = 'complete' WHERE id = ?", [tournamentId]);
  await awardTourPointsIfKnockoutComplete(tournamentId);
}

export async function setTournamentMatchWinner(tournamentMatchId, winnerParticipantId, details = {}) {
  const database = await getDb();
  const row = await database.getFirstAsync(
    'SELECT id, tournament_id, round, match_index_in_round, player1_participant_id, player2_participant_id FROM tournament_matches WHERE id = ?',
    [tournamentMatchId]
  );
  if (!row) return;
  const round = Number(row.round);
  const matchIdx = Number(row.match_index_in_round);
  const roundN = Number.isFinite(round) ? round : 0;
  const idxN = Number.isFinite(matchIdx) ? matchIdx : 0;
  await database.runAsync('UPDATE tournament_matches SET winner_participant_id = ? WHERE id = ?', [
    winnerParticipantId,
    tournamentMatchId,
  ]);
  const { score, match_date, remarks } = details;
  if (score != null && score !== '') {
    await database.runAsync('UPDATE tournament_matches SET score = ? WHERE id = ?', [String(score).trim(), tournamentMatchId]);
  }
  if (match_date != null && match_date !== '') {
    await database.runAsync('UPDATE tournament_matches SET match_date = ? WHERE id = ?', [String(match_date).trim(), tournamentMatchId]);
  }
  if (remarks != null && remarks !== '') {
    await database.runAsync('UPDATE tournament_matches SET remarks = ? WHERE id = ?', [String(remarks).trim(), tournamentMatchId]);
  }
  const tournament = await database.getFirstAsync('SELECT format, draw_size FROM tournaments WHERE id = ?', [row.tournament_id]);
  if (tournament?.format === 'round_robin') return;
  const drawSize = tournament?.draw_size ?? 8;
  const allMatches = await database.getAllAsync('SELECT * FROM tournament_matches WHERE tournament_id = ?', [row.tournament_id]);
  const maxR = Math.max(0, ...allMatches.map((m) => Number(m.round) || 0));
  const hasBronze = drawSize >= 4 && allMatches.some((m) => Number(m.round) === maxR && Number(m.match_index_in_round) === 1);
  const semiRound = maxR >= 1 ? maxR - 1 : -1;
  if (hasBronze && semiRound >= 0 && roundN === semiRound) {
    const loserPid =
      row.player1_participant_id === winnerParticipantId
        ? row.player2_participant_id
        : row.player1_participant_id;
    const bronzeMatch = allMatches.find((m) => Number(m.round) === maxR && Number(m.match_index_in_round) === 1);
    if (bronzeMatch && loserPid != null) {
      const bronzeCol = idxN === 0 ? 'player1_participant_id' : 'player2_participant_id';
      await database.runAsync(`UPDATE tournament_matches SET ${bronzeCol} = ? WHERE id = ?`, [loserPid, bronzeMatch.id]);
    }
  }
  const nextRound = roundN + 1;
  const nextMatchIndex = Math.floor(idxN / 2);
  const slot = idxN % 2;
  const nextMatch = await database.getFirstAsync(
    'SELECT id FROM tournament_matches WHERE tournament_id = ? AND round = ? AND match_index_in_round = ?',
    [row.tournament_id, nextRound, nextMatchIndex]
  );
  if (!nextMatch) {
    await tryFinalizeKnockoutTournament(database, row.tournament_id);
    return;
  }
  const advCol = slot === 0 ? 'player1_participant_id' : 'player2_participant_id';
  await database.runAsync(`UPDATE tournament_matches SET ${advCol} = ? WHERE id = ?`, [
    winnerParticipantId,
    nextMatch.id,
  ]);
}

export async function linkTournamentMatchToAppMatch(tournamentMatchId, matchId) {
  const database = await getDb();
  await database.runAsync('UPDATE tournament_matches SET linked_match_id = ? WHERE id = ?', [
    matchId,
    tournamentMatchId,
  ]);
}

export async function setTournamentMatchRemark(tournamentMatchId, remark) {
  const database = await getDb();
  const value = (remark != null && String(remark).trim() !== '') ? String(remark).trim() : null;
  await database.runAsync('UPDATE tournament_matches SET remark = ? WHERE id = ?', [value, tournamentMatchId]);
}

export async function getTournamentMatchById(tournamentMatchId) {
  const database = await getDb();
  const row = await database.getFirstAsync(
    `SELECT m.*,
      p1.display_name AS player1_name, p1.player_id AS player1_app_id,
      p2.display_name AS player2_name, p2.player_id AS player2_app_id
     FROM tournament_matches m
     LEFT JOIN tournament_participants p1 ON p1.id = m.player1_participant_id
     LEFT JOIN tournament_participants p2 ON p2.id = m.player2_participant_id
     WHERE m.id = ?`,
    [tournamentMatchId]
  );
  return row ?? null;
}

export async function getTournamentH2H(tournamentId, playerAId, playerBId) {
  const participants = await getTournamentParticipants(tournamentId);
  const a = participants.find((p) => p.player_id === playerAId);
  const b = participants.find((p) => p.player_id === playerBId);
  if (!a || !b) return { wins: 0, losses: 0 };
  const matches = await getTournamentMatches(tournamentId);
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    if (m.winner_participant_id !== a.id && m.winner_participant_id !== b.id) continue;
    const hasA = m.player1_participant_id === a.id || m.player2_participant_id === a.id;
    const hasB = m.player1_participant_id === b.id || m.player2_participant_id === b.id;
    if (!hasA || !hasB) continue;
    if (m.winner_participant_id === a.id) wins++;
    else losses++;
  }
  return { wins, losses };
}

export async function deleteTournament(tournamentId) {
  const database = await getDb();
  await database.runAsync('DELETE FROM tournaments WHERE id = ?', [tournamentId]);
}

export async function getAllPlayers() {
  const database = await getDb();
  const rows = await database.getAllAsync('SELECT * FROM players ORDER BY name');
  return rows;
}

export async function createPlayer(name, profile = {}) {
  const database = await getDb();
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Player name is required');
  const description = (profile.description || '').trim() || null;
  const startDate = (profile.startDate || '').trim() || null;
  const racketLevel = (profile.racketLevel || '').trim() || null;
  const profileImage = profile.profileImage || null;
  const result = await database.runAsync(
    'INSERT INTO players (name, profile_image, description, start_date, racket_level) VALUES (?, ?, ?, ?, ?)',
    [trimmed, profileImage, description, startDate, racketLevel]
  );
  return result.lastInsertRowId;
}

export async function updatePlayer(id, updates = {}) {
  const database = await getDb();
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    const trimmed = (updates.name || '').trim();
    if (!trimmed) throw new Error('Player name is required');
    fields.push('name = ?');
    values.push(trimmed);
  }
  if (updates.profileImage !== undefined) {
    fields.push('profile_image = ?');
    values.push(updates.profileImage || null);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push((updates.description || '').trim() || null);
  }
  if (updates.startDate !== undefined) {
    fields.push('start_date = ?');
    values.push((updates.startDate || '').trim() || null);
  }
  if (updates.racketLevel !== undefined) {
    fields.push('racket_level = ?');
    values.push((updates.racketLevel || '').trim() || null);
  }

  if (!fields.length) return;
  values.push(id);
  await database.runAsync(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function getPlayerById(id) {
  const database = await getDb();
  const rows = await database.getAllAsync('SELECT * FROM players WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/** Delete a player and all their matches (and set_scores). Tournament participants referencing this player are unlinked (player_id set to null). */
export async function deletePlayer(id) {
  const database = await getDb();
  const matchRows = await database.getAllAsync('SELECT id FROM matches WHERE player1_id = ? OR player2_id = ?', [id, id]);
  for (const row of matchRows) {
    await database.runAsync('DELETE FROM set_scores WHERE match_id = ?', [row.id]);
    await database.runAsync('DELETE FROM matches WHERE id = ?', [row.id]);
  }
  await database.runAsync('UPDATE tournament_participants SET player_id = NULL WHERE player_id = ?', [id]);
  await database.runAsync('DELETE FROM players WHERE id = ?', [id]);
}

/** Create a matchup (no scores yet). Use updateMatch to add scores, date, remarks, images. */
export async function createMatchup(player1Id, player2Id) {
  const database = await getDb();
  if (player1Id === player2Id) throw new Error('Players must be different');
  const result = await database.runAsync(
    'INSERT INTO matches (player1_id, player2_id, date_played) VALUES (?, ?, ?)',
    [player1Id, player2Id, '']
  );
  return result.lastInsertRowId;
}

export async function createMatch(player1Id, player2Id, datePlayed, setScores) {
  if (!setScores?.length) throw new Error('At least one set is required');
  const dateStr = datePlayed || new Date().toISOString().slice(0, 10);
  const matchId = await createMatchup(player1Id, player2Id);
  await updateMatch(matchId, { datePlayed: dateStr, setScores });
  return matchId;
}

/** Update match: datePlayed, setScores (array of { gamesPlayer1, gamesPlayer2, tiebreakPlayer1?, tiebreakPlayer2? }), remarks, images. */
export async function updateMatch(matchId, { datePlayed, setScores, remarks, images }) {
  const database = await getDb();
  if (datePlayed !== undefined) {
    await database.runAsync('UPDATE matches SET date_played = ? WHERE id = ?', [datePlayed || '', matchId]);
  }
  if (remarks !== undefined) {
    await database.runAsync('UPDATE matches SET remarks = ? WHERE id = ?', [remarks ?? null, matchId]);
  }
  if (images !== undefined) {
    const str = Array.isArray(images) ? JSON.stringify(images) : (images || null);
    await database.runAsync('UPDATE matches SET images = ? WHERE id = ?', [str, matchId]);
  }
  if (setScores && setScores.length >= 0) {
    await database.runAsync('DELETE FROM set_scores WHERE match_id = ?', [matchId]);
    for (let i = 0; i < setScores.length; i++) {
      const { gamesPlayer1, gamesPlayer2, tiebreakPlayer1, tiebreakPlayer2 } = setScores[i];
      const tb1 = tiebreakPlayer1 != null && tiebreakPlayer1 !== '' ? tiebreakPlayer1 : null;
      const tb2 = tiebreakPlayer2 != null && tiebreakPlayer2 !== '' ? tiebreakPlayer2 : null;
      await database.runAsync(
        'INSERT INTO set_scores (match_id, set_number, games_player1, games_player2, tiebreak_player1, tiebreak_player2) VALUES (?, ?, ?, ?, ?, ?)',
        [matchId, i + 1, gamesPlayer1 ?? 0, gamesPlayer2 ?? 0, tb1, tb2]
      );
    }
  }
}

/** Find a match for the same two players (in either order) on the same date (YYYY-MM-DD). Returns first match or null. */
export async function getMatchByPlayersAndDate(player1Id, player2Id, dateStr) {
  if (!dateStr || dateStr.length < 10) return null;
  const database = await getDb();
  const prefix = dateStr.slice(0, 10);
  const rows = await database.getAllAsync(
    `SELECT id, player1_id, player2_id, date_played FROM matches
     WHERE ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?))
     AND (date_played = ? OR date_played LIKE ?)
     ORDER BY id DESC LIMIT 1`,
    [player1Id, player2Id, player2Id, player1Id, prefix, prefix + '%']
  );
  return rows[0] ?? null;
}

/** Delete a match and its set_scores. */
export async function deleteMatch(matchId) {
  const database = await getDb();
  await database.runAsync('DELETE FROM set_scores WHERE match_id = ?', [matchId]);
  await database.runAsync('DELETE FROM matches WHERE id = ?', [matchId]);
}

/** Delete all matches (and their set_scores) between two players. */
export async function deleteAllMatchesForMatchup(player1Id, player2Id) {
  const database = await getDb();
  const rows = await database.getAllAsync(
    'SELECT id FROM matches WHERE (player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?)',
    [player1Id, player2Id, player2Id, player1Id]
  );
  for (const row of rows) {
    await database.runAsync('DELETE FROM set_scores WHERE match_id = ?', [row.id]);
    await database.runAsync('DELETE FROM matches WHERE id = ?', [row.id]);
  }
}

export async function getMatchesForPlayer(playerId) {
  const database = await getDb();
  const rows = await database.getAllAsync(
    `SELECT m.id, m.player1_id, m.player2_id, m.date_played,
            p1.name AS player1_name, p2.name AS player2_name
     FROM matches m
     JOIN players p1 ON p1.id = m.player1_id
     JOIN players p2 ON p2.id = m.player2_id
     WHERE m.player1_id = ? OR m.player2_id = ?
     ORDER BY m.date_played DESC, m.id DESC`,
    [playerId, playerId]
  );
  return rows;
}

export async function getSetScoresForMatch(matchId) {
  const database = await getDb();
  const rows = await database.getAllAsync(
    'SELECT set_number, games_player1, games_player2, tiebreak_player1, tiebreak_player2 FROM set_scores WHERE match_id = ? ORDER BY set_number',
    [matchId]
  );
  return rows;
}

export async function getAllMatches() {
  const database = await getDb();
  const rows = await database.getAllAsync(
    `SELECT m.id, m.player1_id, m.player2_id, m.date_played, m.remarks, m.images,
            p1.name AS player1_name, p2.name AS player2_name
     FROM matches m
     JOIN players p1 ON p1.id = m.player1_id
     JOIN players p2 ON p2.id = m.player2_id
     ORDER BY m.id DESC`
  );
  return rows;
}

export async function getMatchResult(matchId) {
  const sets = await getSetScoresForMatch(matchId);
  if (!sets.length) return null;
  let setsPlayer1 = 0;
  let setsPlayer2 = 0;
  let gamesPlayer1 = 0;
  let gamesPlayer2 = 0;
  let incompleteSetCount = 0;
  for (const s of sets) {
    const complete = isSetComplete(
      s.games_player1,
      s.games_player2,
      s.tiebreak_player1,
      s.tiebreak_player2
    );
    if (complete) {
      if (s.games_player1 > s.games_player2) setsPlayer1++;
      else setsPlayer2++;
      gamesPlayer1 += s.games_player1;
      gamesPlayer2 += s.games_player2;
    } else if ((s.games_player1 ?? 0) > 0 || (s.games_player2 ?? 0) > 0) {
      incompleteSetCount++;
    }
  }
  const database = await getDb();
  const m = await database.getFirstAsync('SELECT player1_id, player2_id FROM matches WHERE id = ?', [matchId]);
  if (!m) return null;
  const hasIncompleteSets = incompleteSetCount > 0;
  const winnerId = setsPlayer1 > setsPlayer2 ? m.player1_id : setsPlayer2 > setsPlayer1 ? m.player2_id : null;
  const loserId = setsPlayer2 > setsPlayer1 ? m.player1_id : setsPlayer1 > setsPlayer2 ? m.player2_id : null;
  return {
    winnerId,
    loserId,
    setsPlayer1,
    setsPlayer2,
    gamesPlayer1,
    gamesPlayer2,
    incompleteSetCount,
    hasIncompleteSets,
  };
}

export async function getPlayerStats(playerId) {
  const matches = await getMatchesForPlayer(playerId);
  let daysWon = 0;
  let daysLost = 0;
  let daysTied = 0;
  let daysNoResult = 0;
  let totalGamesWon = 0;
  let totalSetsWon = 0;
  let totalSetsPlayed = 0;
  let totalGamesPlayed = 0;
  let incompleteSets = 0;
  let bagelsServed = 0;
  let breadsticksServed = 0;
  const opponentCounts = {};
  /** Set win streak (consecutive sets won); newest set first — matches DESC, then sets within match DESC */
  const setOutcomes = [];

  for (const match of matches) {
    const result = await getMatchResult(match.id);
    if (!result) continue;
    incompleteSets += result.incompleteSetCount ?? 0;
    const isPlayer1 = match.player1_id === playerId;
    const mySets = isPlayer1 ? result.setsPlayer1 : result.setsPlayer2;
    const oppSets = isPlayer1 ? result.setsPlayer2 : result.setsPlayer1;

    totalSetsWon += mySets;
    totalSetsPlayed += mySets + oppSets;
    totalGamesWon += isPlayer1 ? result.gamesPlayer1 : result.gamesPlayer2;
    totalGamesPlayed += result.gamesPlayer1 + result.gamesPlayer2;

    const sets = await getSetScoresForMatch(match.id);
    for (const s of sets) {
      if (!isSetComplete(s.games_player1, s.games_player2, s.tiebreak_player1, s.tiebreak_player2)) continue;
      const myGames = isPlayer1 ? s.games_player1 : s.games_player2;
      const oppGames = isPlayer1 ? s.games_player2 : s.games_player1;
      if (myGames === 6 && oppGames === 0) bagelsServed++;
      if (myGames === 6 && oppGames === 1) breadsticksServed++;
    }

    const setsNewestFirst = [...sets].sort((a, b) => b.set_number - a.set_number);
    for (const s of setsNewestFirst) {
      if (!isSetComplete(s.games_player1, s.games_player2, s.tiebreak_player1, s.tiebreak_player2)) continue;
      const myGames = isPlayer1 ? s.games_player1 : s.games_player2;
      const oppGames = isPlayer1 ? s.games_player2 : s.games_player1;
      setOutcomes.push(myGames > oppGames);
    }

    const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
    const opponentName = isPlayer1 ? match.player2_name : match.player1_name;
    if (!opponentCounts[opponentId]) {
      opponentCounts[opponentId] = { playerId: opponentId, name: opponentName, matches: 0 };
    }
    opponentCounts[opponentId].matches += 1;

    const completeSetsThatDay = mySets + oppSets;
    if (completeSetsThatDay === 0) {
      daysNoResult++;
      continue;
    }
    if (mySets > oppSets) {
      daysWon++;
    } else if (mySets < oppSets) {
      daysLost++;
    } else {
      daysTied++;
    }
  }

  let currentWinStreak = 0;
  for (let i = 0; i < setOutcomes.length && setOutcomes[i]; i++) currentWinStreak++;
  let bestWinStreak = 0;
  let run = 0;
  for (let i = 0; i < setOutcomes.length; i++) {
    if (setOutcomes[i]) {
      run++;
      if (run > bestWinStreak) bestWinStreak = run;
    } else {
      run = 0;
    }
  }

  const mostPlayedWith = Object.values(opponentCounts).sort((a, b) => b.matches - a.matches)[0] || null;
  const daysDecided = daysWon + daysLost + daysTied;
  const setWinPct = totalSetsPlayed > 0 ? (totalSetsWon / totalSetsPlayed) * 100 : 0;
  const gameWinPct = totalGamesPlayed > 0 ? (totalGamesWon / totalGamesPlayed) * 100 : 0;

  return {
    matchesPlayed: matches.length,
    /** Days with at least one completed set (outcome: win, loss, or tie on sets) */
    recordedMatches: daysDecided,
    daysWon,
    daysLost,
    daysTied,
    daysNoResult,
    /** @deprecated use daysWon — kept for older call sites */
    wins: daysWon,
    /** @deprecated use daysLost */
    losses: daysLost,
    totalGamesWon,
    totalSetsWon,
    totalSetsPlayed,
    totalGamesPlayed,
    incompleteSets,
    totalUniquePlayers: Object.keys(opponentCounts).length,
    mostPlayedWith,
    /** % of completed sets won (primary “win rate”) */
    setWinPercentage: setWinPct,
    gameWinPercentage: gameWinPct,
    /** @deprecated use setWinPercentage */
    winPercentage: setWinPct,
    currentWinStreak,
    bestWinStreak,
    bagelsServed,
    breadsticksServed,
  };
}

async function accumulateTournamentKnockoutScoresForPair(playerAId, playerBId) {
  const database = await getDb();
  const rows = await database.getAllAsync(
    `SELECT tm.score, tp1.player_id AS pid1, tp2.player_id AS pid2
     FROM tournament_matches tm
     INNER JOIN tournament_participants tp1 ON tp1.id = tm.player1_participant_id
     INNER JOIN tournament_participants tp2 ON tp2.id = tm.player2_participant_id
     INNER JOIN tournaments t ON t.id = tm.tournament_id
     WHERE t.format = 'knockout'
       AND tm.winner_participant_id IS NOT NULL
       AND tm.linked_match_id IS NULL
       AND ((tp1.player_id = ? AND tp2.player_id = ?) OR (tp1.player_id = ? AND tp2.player_id = ?))`,
    [playerAId, playerBId, playerBId, playerAId]
  );
  let setsWon = 0;
  let setsLost = 0;
  let gamesWon = 0;
  let gamesLost = 0;
  for (const row of rows) {
    const agg = parseTournamentScoreAggregateFromBracketString(row.score || '');
    const p1IsA = row.pid1 === playerAId;
    if (p1IsA) {
      setsWon += agg.setsLeft;
      setsLost += agg.setsRight;
      gamesWon += agg.gamesLeft;
      gamesLost += agg.gamesRight;
    } else {
      setsWon += agg.setsRight;
      setsLost += agg.setsLeft;
      gamesWon += agg.gamesRight;
      gamesLost += agg.gamesLeft;
    }
  }
  return { setsWon, setsLost, gamesWon, gamesLost };
}

/**
 * Head-to-head between two players (all match days).
 * Primary: completed sets won. Secondary: days won / lost / tied (by who won more sets that day).
 * Includes knockout tournament bracket scores (not linked to an app match) in sets/games totals.
 */
export async function getHeadToHead(playerAId, playerBId) {
  const matches = await getMatchesForPlayer(playerAId);
  let setsWon = 0;
  let setsLost = 0;
  let daysWon = 0;
  let daysLost = 0;
  let daysTied = 0;
  for (const m of matches) {
    const otherId = m.player1_id === playerAId ? m.player2_id : m.player1_id;
    if (otherId !== playerBId) continue;
    const result = await getMatchResult(m.id);
    if (!result) continue;
    const aIsP1 = m.player1_id === playerAId;
    const aSets = aIsP1 ? result.setsPlayer1 : result.setsPlayer2;
    const bSets = aIsP1 ? result.setsPlayer2 : result.setsPlayer1;
    setsWon += aSets;
    setsLost += bSets;
    const played = aSets + bSets;
    if (played === 0) continue;
    if (aSets > bSets) daysWon++;
    else if (bSets > aSets) daysLost++;
    else daysTied++;
  }
  const tAdd = await accumulateTournamentKnockoutScoresForPair(playerAId, playerBId);
  setsWon += tAdd.setsWon;
  setsLost += tAdd.setsLost;
  const totalSets = setsWon + setsLost;
  const setWinPct = totalSets > 0 ? (setsWon / totalSets) * 100 : 0;
  return {
    setsWon,
    setsLost,
    setWinPct,
    daysWon,
    daysLost,
    daysTied,
    wins: daysWon,
    losses: daysLost,
    gamesWon: tAdd.gamesWon,
    gamesLost: tAdd.gamesLost,
  };
}

export async function getMatchWithDetails(matchId) {
  const database = await getDb();
  const match = await database.getFirstAsync(
    `SELECT m.id, m.player1_id, m.player2_id, m.date_played, m.remarks, m.images,
            p1.name AS player1_name, p2.name AS player2_name
     FROM matches m
     JOIN players p1 ON p1.id = m.player1_id
     JOIN players p2 ON p2.id = m.player2_id
     WHERE m.id = ?`,
    [matchId]
  );
  if (!match) return null;
  const sets = await getSetScoresForMatch(matchId);
  const result = await getMatchResult(matchId);
  let images = [];
  if (match.images) {
    try {
      images = typeof match.images === 'string' ? JSON.parse(match.images) : (match.images || []);
    } catch (_) {}
  }
  return { ...match, images, sets, ...result };
}

/** Detailed H2H stats for a matchup: days, sets, games, closest/easiest set, tie breaks, win %, set-based win streaks */
export async function getMatchupDetailedStats(player1Id, player2Id) {
  const matches = await getMatchesForPlayer(player1Id);
  const between = matches.filter(
    (m) => m.player1_id === player2Id || m.player2_id === player2Id
  );
  let totalSetsPlayed = 0;
  let setsPlayer1 = 0;
  let setsPlayer2 = 0;
  let totalGamesPlayed = 0;
  let gamesPlayer1 = 0;
  let gamesPlayer2 = 0;
  let tieBreaksPlayed = 0;
  let closestSet = null;
  let easiestSet = null;
  let mostSetsInSingleDay = 0;
  let daysWonPlayer1 = 0;
  let daysWonPlayer2 = 0;
  let marginSumPlayer1 = 0;
  let marginSumPlayer2 = 0;
  let setsWonCountPlayer1 = 0;
  let setsWonCountPlayer2 = 0;
  let bagelsServedPlayer1 = 0;
  let bagelsServedPlayer2 = 0;
  let breadsticksServedPlayer1 = 0;
  let breadsticksServedPlayer2 = 0;
  let incompleteSets = 0;
  /** Per-set winners in matchup order (p1 vs p2), newest set first — for streak */
  const setWinners = [];
  const daySets = [];

  for (const m of between) {
    const sets = await getSetScoresForMatch(m.id);
    const isP1First = m.player1_id === player1Id;
    let setsP1ThisDay = 0;
    let setsP2ThisDay = 0;
    let completedCountThisDay = 0;

    const setsNewestFirst = [...sets].sort((a, b) => b.set_number - a.set_number);
    for (const s of setsNewestFirst) {
      const completeStreak = isSetComplete(
        s.games_player1,
        s.games_player2,
        s.tiebreak_player1,
        s.tiebreak_player2
      );
      if (!completeStreak) continue;
      const g1s = s.games_player1 ?? 0;
      const g2s = s.games_player2 ?? 0;
      const p1G = isP1First ? g1s : g2s;
      const p2G = isP1First ? g2s : g1s;
      setWinners.push(p1G > p2G ? 'p1' : 'p2');
    }

    for (const s of sets) {
      const complete = isSetComplete(
        s.games_player1,
        s.games_player2,
        s.tiebreak_player1,
        s.tiebreak_player2
      );
      if (!complete) {
        if ((s.games_player1 ?? 0) > 0 || (s.games_player2 ?? 0) > 0) incompleteSets++;
        continue;
      }
      completedCountThisDay++;
      const g1 = s.games_player1 ?? 0;
      const g2 = s.games_player2 ?? 0;
      const p1Games = isP1First ? g1 : g2;
      const p2Games = isP1First ? g2 : g1;
      totalSetsPlayed++;
      totalGamesPlayed += p1Games + p2Games;
      gamesPlayer1 += p1Games;
      gamesPlayer2 += p2Games;
      const margin = Math.abs(p1Games - p2Games);
      const tbP1 = isP1First ? s.tiebreak_player1 : s.tiebreak_player2;
      const tbP2 = isP1First ? s.tiebreak_player2 : s.tiebreak_player1;
      const scoreStr = formatSetScoreDisplay(p1Games, p2Games, tbP1, tbP2);
      if ((g1 === 7 && g2 === 6) || (g1 === 6 && g2 === 7)) tieBreaksPlayed++;
      if (p1Games === 6 && p2Games === 0) bagelsServedPlayer1++;
      if (p2Games === 6 && p1Games === 0) bagelsServedPlayer2++;
      if (p1Games === 6 && p2Games === 1) breadsticksServedPlayer1++;
      if (p2Games === 6 && p1Games === 1) breadsticksServedPlayer2++;
      if (!closestSet || margin < closestSet.margin) closestSet = { score: scoreStr, margin };
      if (!easiestSet || margin > easiestSet.margin) easiestSet = { score: scoreStr, margin };

      if (p1Games > p2Games) {
        setsPlayer1++;
        setsP1ThisDay++;
        marginSumPlayer1 += p1Games - p2Games;
        setsWonCountPlayer1++;
      } else {
        setsPlayer2++;
        setsP2ThisDay++;
        marginSumPlayer2 += p2Games - p1Games;
        setsWonCountPlayer2++;
      }
    }
    if (completedCountThisDay > mostSetsInSingleDay) mostSetsInSingleDay = completedCountThisDay;
    const dateStr = (m.date_played || '').slice(0, 10);
    if (dateStr) daySets.push({ dateStr, sets: completedCountThisDay });
    if (setsP1ThisDay > setsP2ThisDay) {
      daysWonPlayer1++;
    } else if (setsP2ThisDay > setsP1ThisDay) {
      daysWonPlayer2++;
    }
  }

  let mostSetsInWeek = 0;
  let mostSetsInMonth = 0;
  const setsByWeek = {};
  const setsByMonth = {};
  for (const { dateStr, sets } of daySets) {
    const t = new Date(dateStr + 'T12:00:00').getTime();
    const weekKey = Math.floor(t / (7 * 24 * 60 * 60 * 1000));
    const monthKey = dateStr.slice(0, 7);
    setsByWeek[weekKey] = (setsByWeek[weekKey] || 0) + sets;
    setsByMonth[monthKey] = (setsByMonth[monthKey] || 0) + sets;
  }
  if (Object.keys(setsByWeek).length) mostSetsInWeek = Math.max(...Object.values(setsByWeek));
  if (Object.keys(setsByMonth).length) mostSetsInMonth = Math.max(...Object.values(setsByMonth));

  let currentWinStreakPlayer1 = 0;
  let currentWinStreakPlayer2 = 0;
  for (let i = 0; i < setWinners.length && setWinners[i] === 'p1'; i++) currentWinStreakPlayer1++;
  for (let i = 0; i < setWinners.length && setWinners[i] === 'p2'; i++) currentWinStreakPlayer2++;
  let bestWinStreakPlayer1 = 0;
  let bestWinStreakPlayer2 = 0;
  let run1 = 0, run2 = 0;
  for (let i = 0; i < setWinners.length; i++) {
    if (setWinners[i] === 'p1') {
      run1++;
      run2 = 0;
      if (run1 > bestWinStreakPlayer1) bestWinStreakPlayer1 = run1;
    } else if (setWinners[i] === 'p2') {
      run2++;
      run1 = 0;
      if (run2 > bestWinStreakPlayer2) bestWinStreakPlayer2 = run2;
    }
  }

  const totalDays = between.length;
  const avgGamesP1 = totalSetsPlayed ? gamesPlayer1 / totalSetsPlayed : 0;
  const avgGamesP2 = totalSetsPlayed ? gamesPlayer2 / totalSetsPlayed : 0;
  const averageSetScore =
    totalSetsPlayed
      ? `${avgGamesP1.toFixed(1)} – ${avgGamesP2.toFixed(1)}`
      : null;
  const dayWinPctPlayer1 = totalDays ? (daysWonPlayer1 / totalDays) * 100 : 0;
  const dayWinPctPlayer2 = totalDays ? (daysWonPlayer2 / totalDays) * 100 : 0;
  const setWinPctPlayer1 = totalSetsPlayed ? (setsPlayer1 / totalSetsPlayed) * 100 : 0;
  const setWinPctPlayer2 = totalSetsPlayed ? (setsPlayer2 / totalSetsPlayed) * 100 : 0;
  const avgWinMarginPlayer1 = setsWonCountPlayer1 ? marginSumPlayer1 / setsWonCountPlayer1 : null;
  const avgWinMarginPlayer2 = setsWonCountPlayer2 ? marginSumPlayer2 / setsWonCountPlayer2 : null;

  return {
    totalDaysPlayed: totalDays,
    totalSetsPlayed,
    incompleteSets,
    setsPlayer1,
    setsPlayer2,
    totalGamesPlayed,
    gamesPlayer1,
    gamesPlayer2,
    tieBreaksPlayed,
    closestSet: closestSet ? closestSet.score : null,
    easiestSet: easiestSet ? easiestSet.score : null,
    mostSetsInSingleDay,
    mostSetsInWeek,
    mostSetsInMonth,
    averageSetScore,
    dayWinPctPlayer1,
    dayWinPctPlayer2,
    setWinPctPlayer1,
    setWinPctPlayer2,
    avgWinMarginPlayer1: avgWinMarginPlayer1 != null ? Math.round(avgWinMarginPlayer1 * 10) / 10 : null,
    avgWinMarginPlayer2: avgWinMarginPlayer2 != null ? Math.round(avgWinMarginPlayer2 * 10) / 10 : null,
    currentWinStreakPlayer1,
    currentWinStreakPlayer2,
    bestWinStreakPlayer1,
    bestWinStreakPlayer2,
    bagelsServedPlayer1,
    bagelsServedPlayer2,
    breadsticksServedPlayer1,
    breadsticksServedPlayer2,
  };
}

/** Per-day data for matchup graph: date, sets won by P1 and P2, hasIncompleteSets (chronological, oldest first) */
export async function getMatchupDayByDay(player1Id, player2Id) {
  const matches = await getMatchesForPlayer(player1Id);
  const between = matches.filter(
    (m) => m.player1_id === player2Id || m.player2_id === player2Id
  );
  const days = [];
  for (const m of between) {
    const result = await getMatchResult(m.id);
    if (!result) continue;
    const isP1First = m.player1_id === player1Id;
    const setsPlayer1 = isP1First ? result.setsPlayer1 : result.setsPlayer2;
    const setsPlayer2 = isP1First ? result.setsPlayer2 : result.setsPlayer1;
    days.push({
      date: m.date_played || '',
      matchId: m.id,
      setsPlayer1,
      setsPlayer2,
      hasIncompleteSets: result.hasIncompleteSets ?? false,
    });
  }
  days.sort((a, b) => (a.date || '').localeCompare(b.date || '') || 0);
  return days;
}

/** Preset winner points by event type (finalist = half). Grand Slam uses 400 pts (same tier as former Tour 400). */
export const TOUR_EVENT_TYPES = {
  '200': { winnerPoints: 200, label: 'Tour 200' },
  grandslam: { winnerPoints: 400, label: 'Grand Slam' },
};

export async function getAllTours() {
  const database = await getDb();
  return database.getAllAsync(
    `SELECT t.*,
      (SELECT COUNT(*) FROM tour_events WHERE tour_id = t.id) AS event_count
     FROM tours t ORDER BY t.created_at DESC`
  );
}

export async function getTourById(tourId) {
  const database = await getDb();
  return database.getFirstAsync('SELECT * FROM tours WHERE id = ?', [tourId]);
}

export async function getTourSeasons(tourId) {
  const database = await getDb();
  return database.getAllAsync(
    'SELECT * FROM tour_seasons WHERE tour_id = ? ORDER BY sort_order ASC, id ASC',
    [tourId]
  );
}

async function resolveSeasonIdForNewEvent(database, tourId) {
  const seasons = await database.getAllAsync(
    'SELECT * FROM tour_seasons WHERE tour_id = ? ORDER BY sort_order ASC, id ASC',
    [tourId]
  );
  if (seasons.length === 0) {
    const r = await database.runAsync(
      'INSERT INTO tour_seasons (tour_id, sort_order, name) VALUES (?, 0, ?)',
      [tourId, 'Season 1']
    );
    return r.lastInsertRowId;
  }
  for (const s of seasons) {
    const evs = await database.getAllAsync('SELECT status FROM tour_events WHERE season_id = ?', [s.id]);
    if (evs.length === 0 || evs.some((e) => e.status !== 'complete')) {
      return s.id;
    }
  }
  const last = seasons[seasons.length - 1];
  const nextOrder = last.sort_order + 1;
  const r = await database.runAsync(
    'INSERT INTO tour_seasons (tour_id, sort_order, name) VALUES (?, ?, ?)',
    [tourId, nextOrder, `Season ${nextOrder + 1}`]
  );
  return r.lastInsertRowId;
}

async function cloneSeasonEventsFromTemplate(database, tourId, templateEvs, targetSeasonId) {
  for (const src of templateEvs) {
    await database.runAsync(
      `INSERT INTO tour_events (tour_id, season_id, name, event_type, winner_points, finalist_points, linked_tournament_id, status, sort_order, scheduled_date, calendar_color, draw_size, match_mode)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'scheduled', ?, ?, ?, ?, ?)`,
      [
        tourId,
        targetSeasonId,
        src.name,
        src.event_type,
        src.winner_points,
        src.finalist_points,
        src.sort_order,
        src.scheduled_date,
        src.calendar_color,
        src.draw_size,
        src.match_mode,
      ]
    );
  }
}

/**
 * When every event in a season is complete, the next season must get the same schedule (new rows)
 * so the tour cycles (e.g. T1→T2→T3→next season T1…). Empty placeholder seasons are filled from the prior completed season.
 */
async function ensureTourSeasonRollover(tourId) {
  const database = await getDb();
  const seasons = await database.getAllAsync(
    'SELECT * FROM tour_seasons WHERE tour_id = ? ORDER BY sort_order ASC, id ASC',
    [tourId]
  );
  if (seasons.length === 0) return;

  for (let i = 0; i < seasons.length; i++) {
    const s = seasons[i];
    const evs = await database.getAllAsync(
      'SELECT * FROM tour_events WHERE season_id = ? ORDER BY sort_order ASC, id ASC',
      [s.id]
    );
    if (evs.length === 0) continue;
    if (!evs.every((e) => e.status === 'complete')) continue;

    const nextSeason = seasons[i + 1];
    if (nextSeason) {
      const nextCnt = await database.getFirstAsync(
        'SELECT COUNT(*) AS c FROM tour_events WHERE season_id = ?',
        [nextSeason.id]
      );
      if ((nextCnt?.c ?? 0) > 0) continue;
      await cloneSeasonEventsFromTemplate(database, tourId, evs, nextSeason.id);
      return;
    }
    const r = await database.runAsync(
      'INSERT INTO tour_seasons (tour_id, sort_order, name) VALUES (?, ?, ?)',
      [tourId, s.sort_order + 1, `Season ${s.sort_order + 2}`]
    );
    await cloneSeasonEventsFromTemplate(database, tourId, evs, r.lastInsertRowId);
    return;
  }
}

/** Rolling window size for points: events in the first season (one full cycle), else tour.rolling_weeks. */
export async function getTourRollingWindowSize(tourId) {
  const database = await getDb();
  const tour = await getTourById(tourId);
  if (!tour) return 1;
  const slotsRow = await database.getFirstAsync(
    `SELECT COUNT(*) AS c FROM tour_events e
     JOIN tour_seasons s ON s.id = e.season_id
     WHERE e.tour_id = ? AND s.sort_order = (SELECT MIN(sort_order) FROM tour_seasons WHERE tour_id = ?)`,
    [tourId, tourId]
  );
  const fromSlots = parseInt(slotsRow?.c, 10) || 0;
  if (fromSlots > 0) return fromSlots;
  return Math.max(1, parseInt(tour.rolling_weeks, 10) || 4);
}

/** Winner / finalist / third names per event (from point entries). */
export async function getTourEventPodiumsForTour(tourId) {
  const database = await getDb();
  const rows = await database.getAllAsync(
    `SELECT tpe.tour_event_id, tpe.role, pl.name AS player_name
     FROM tour_point_entries tpe
     JOIN players pl ON pl.id = tpe.player_id
     WHERE tpe.tour_id = ? AND tpe.role IN ('winner', 'finalist', 'third')`,
    [tourId]
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.tour_event_id]) map[r.tour_event_id] = {};
    map[r.tour_event_id][r.role] = r.player_name;
  }
  return map;
}

export async function createTour(name, opts = {}) {
  const database = await getDb();
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Tour name is required');
  const description = (opts.description || '').trim() || null;
  const symbol_image = (opts.symbolImage || '').trim() || null;
  const season_start_date = (opts.seasonStartDate || '').trim() || null;
  const sched = Array.isArray(opts.scheduledEvents) ? opts.scheduledEvents : [];
  const schedCount = sched.filter((row) => (row.name || '').trim()).length;
  // Stored as rolling_weeks: number of completed tournaments whose points count toward standings (one full cycle = schedule length).
  const rolling_weeks = Math.max(
    1,
    schedCount > 0 ? schedCount : parseInt(opts.rollingWeeks, 10) || 4
  );
  const r = await database.runAsync(
    'INSERT INTO tours (name, description, symbol_image, season_start_date, rolling_weeks) VALUES (?, ?, ?, ?, ?)',
    [trimmed, description, symbol_image, season_start_date, rolling_weeks]
  );
  const tourId = r.lastInsertRowId;
  const rSeason = await database.runAsync(
    'INSERT INTO tour_seasons (tour_id, sort_order, name) VALUES (?, 0, ?)',
    [tourId, 'Season 1']
  );
  const seasonId = rSeason.lastInsertRowId;
  const anchorStr = (opts.scheduleStartDate || '').trim().slice(0, 10) || toDateStr(new Date());
  const anchorDate = parseDateStr(anchorStr) || new Date();
  const weekStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  let eventIndex = 0;
  for (let i = 0; i < sched.length; i++) {
    const row = sched[i];
    const ename = (row.name || '').trim();
    if (!ename) continue;
    const etype = row.eventType === 'grandslam' ? 'grandslam' : '200';
    const wp = TOUR_EVENT_TYPES[etype]?.winnerPoints ?? 200;
    const fp = wp / 2;
    const scheduled_date = toDateStr(addDays(weekStart, eventIndex * 7));
    const calendar_color = TOUR_CALENDAR_COLORS[eventIndex % TOUR_CALENDAR_COLORS.length];
    const draw_size = normalizeTourEventDrawSize(row.drawSize);
    const match_mode = row.matchMode === 'random' ? 'random' : 'seeds';
    await database.runAsync(
      `INSERT INTO tour_events (tour_id, season_id, name, event_type, winner_points, finalist_points, linked_tournament_id, status, sort_order, scheduled_date, calendar_color, draw_size, match_mode)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'scheduled', ?, ?, ?, ?, ?)`,
      [tourId, seasonId, ename, etype, wp, fp, eventIndex, scheduled_date, calendar_color, draw_size, match_mode]
    );
    eventIndex += 1;
  }
  return tourId;
}

/** Add one scheduled tour event (no bracket yet). Dates: first event uses scheduleStartDate; later events are +7 days after the previous. */
export async function addScheduledTourEvent(tourId, opts = {}) {
  const database = await getDb();
  const tour = await getTourById(tourId);
  if (!tour) throw new Error('Tour not found');
  const trimmed = (opts.name || '').trim();
  if (!trimmed) throw new Error('Event name is required');
  const etype = opts.eventType === 'grandslam' ? 'grandslam' : '200';
  const wp = TOUR_EVENT_TYPES[etype]?.winnerPoints ?? 200;
  const fp = wp / 2;
  const draw_size = normalizeTourEventDrawSize(opts.drawSize);
  const match_mode = opts.matchMode === 'random' ? 'random' : 'seeds';

  const seasonId = await resolveSeasonIdForNewEvent(database, tourId);
  const maxOrder = await database.getFirstAsync(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM tour_events WHERE season_id = ?',
    [seasonId]
  );
  const sortOrder = (maxOrder?.m ?? -1) + 1;

  const rawOpt = (opts.scheduledDate || '').trim().slice(0, 10);
  let scheduled_date;
  if (rawOpt.length >= 10 && parseDateStr(rawOpt)) {
    scheduled_date = rawOpt;
  } else {
    const lastEv = await database.getFirstAsync(
      `SELECT scheduled_date FROM tour_events WHERE season_id = ?
       AND scheduled_date IS NOT NULL AND length(scheduled_date) >= 10
       ORDER BY sort_order DESC LIMIT 1`,
      [seasonId]
    );
    if (lastEv?.scheduled_date) {
      const pd = parseDateStr(lastEv.scheduled_date);
      scheduled_date = pd ? toDateStr(addDays(pd, 7)) : toDateStr(new Date());
    } else {
      const anchor = (opts.scheduleStartDate || '').trim().slice(0, 10);
      scheduled_date = parseDateStr(anchor) ? anchor : toDateStr(new Date());
    }
  }

  const calendar_color = TOUR_CALENDAR_COLORS[sortOrder % TOUR_CALENDAR_COLORS.length];
  const r = await database.runAsync(
    `INSERT INTO tour_events (tour_id, season_id, name, event_type, winner_points, finalist_points, linked_tournament_id, status, sort_order, scheduled_date, calendar_color, draw_size, match_mode)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 'scheduled', ?, ?, ?, ?, ?)`,
    [tourId, seasonId, trimmed, etype, wp, fp, sortOrder, scheduled_date, calendar_color, draw_size, match_mode]
  );
  return r.lastInsertRowId;
}

export async function updateTour(tourId, updates = {}) {
  const database = await getDb();
  const fields = [];
  const values = [];
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(String(updates.name).trim());
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push((updates.description || '').trim() || null);
  }
  if (updates.symbolImage !== undefined) {
    fields.push('symbol_image = ?');
    values.push((updates.symbolImage || '').trim() || null);
  }
  if (updates.seasonStartDate !== undefined) {
    fields.push('season_start_date = ?');
    values.push((updates.seasonStartDate || '').trim() || null);
  }
  if (updates.rollingWeeks !== undefined) {
    fields.push('rolling_weeks = ?');
    values.push(Math.max(1, parseInt(updates.rollingWeeks, 10) || 4));
  }
  if (!fields.length) return;
  values.push(tourId);
  await database.runAsync(`UPDATE tours SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteTour(tourId) {
  const database = await getDb();
  const events = await database.getAllAsync('SELECT linked_tournament_id FROM tour_events WHERE tour_id = ?', [tourId]);
  for (const ev of events) {
    if (ev.linked_tournament_id) {
      await database.runAsync('DELETE FROM tournaments WHERE id = ?', [ev.linked_tournament_id]);
    }
  }
  await database.runAsync('DELETE FROM tours WHERE id = ?', [tourId]);
}

export async function getTourParticipants(tourId) {
  const database = await getDb();
  return database.getAllAsync(
    `SELECT tp.*, pl.name AS player_name FROM tour_participants tp
     JOIN players pl ON pl.id = tp.player_id
     WHERE tp.tour_id = ? ORDER BY pl.name`,
    [tourId]
  );
}

export async function addTourParticipant(tourId, playerId) {
  const database = await getDb();
  await database.runAsync('INSERT OR IGNORE INTO tour_participants (tour_id, player_id) VALUES (?, ?)', [tourId, playerId]);
}

export async function removeTourParticipant(tourId, playerId) {
  const database = await getDb();
  await database.runAsync('DELETE FROM tour_participants WHERE tour_id = ? AND player_id = ?', [tourId, playerId]);
}

export async function updateTourEvent(tourEventId, updates = {}) {
  const database = await getDb();
  const fields = [];
  const values = [];
  if (updates.scheduledDate !== undefined) {
    fields.push('scheduled_date = ?');
    const raw = (updates.scheduledDate || '').trim();
    values.push(raw.length >= 10 ? raw.slice(0, 10) : null);
  }
  if (updates.calendarColor !== undefined) {
    const c = (updates.calendarColor || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) {
      fields.push('calendar_color = ?');
      values.push(c);
    }
  }
  if (!fields.length) return;
  values.push(tourEventId);
  await database.runAsync(`UPDATE tour_events SET ${fields.join(', ')} WHERE id = ?`, values);
}

/** Create a knockout bracket for a scheduled tour event (fixed schedule row). */
export async function startTourEventBracket(tourEventId, { drawSize: drawSizeOverride } = {}) {
  const database = await getDb();
  const ev = await database.getFirstAsync('SELECT * FROM tour_events WHERE id = ?', [tourEventId]);
  if (!ev) throw new Error('Event not found');
  if (ev.linked_tournament_id) {
    return { tourEventId: tourEventId, tournamentId: ev.linked_tournament_id, alreadyStarted: true };
  }
  const eventsInScheduleOrder =
    ev.season_id != null
      ? await database.getAllAsync(
          'SELECT id, status, sort_order FROM tour_events WHERE season_id = ? ORDER BY sort_order ASC, id ASC',
          [ev.season_id]
        )
      : await database.getAllAsync(
          'SELECT id, status, sort_order FROM tour_events WHERE tour_id = ? ORDER BY sort_order ASC, id ASC',
          [ev.tour_id]
        );
  const idx = eventsInScheduleOrder.findIndex((row) => row.id === tourEventId);
  if (idx > 0) {
    for (let i = 0; i < idx; i++) {
      if (eventsInScheduleOrder[i].status !== 'complete') {
        throw new Error('Finish earlier tournaments in schedule order before starting this one.');
      }
    }
  }
  const tour = await getTourById(ev.tour_id);
  if (!tour) throw new Error('Tour not found');
  const size = normalizeTourEventDrawSize(drawSizeOverride ?? ev.draw_size ?? 8);
  if (!isValidDrawSize(size)) throw new Error('Draw size must be 2, 4, 8, 16, 32, or 64');

  const rankings = await getTourRankings(ev.tour_id);
  const rankOrder = rankings.map((r) => r.player_id);
  if (rankOrder.length < size) {
    throw new Error(
      `Need at least ${size} players on this tour for a ${size}-player draw (there are ${rankOrder.length}).`
    );
  }

  const tName = `${tour.name} — ${ev.name}`;
  const tid = await createTournament(tName, size);
  await database.runAsync(
    `UPDATE tour_events SET linked_tournament_id = ?, status = 'ongoing' WHERE id = ?`,
    [tid, tourEventId]
  );

  const nameByPlayerId = Object.fromEntries(rankings.map((r) => [r.player_id, r.player_name]));
  const topPlayerIds = rankOrder.slice(0, size);
  const tpIds = [];
  for (let s = 0; s < size; s++) {
    const pid = topPlayerIds[s];
    const nm = nameByPlayerId[pid] || 'Player';
    const tpid = await addTournamentParticipant(tid, { playerId: pid, displayName: nm }, s);
    tpIds.push(tpid);
  }

  const mode = String(ev.match_mode || 'seeds').toLowerCase() === 'random' ? 'random' : 'seeds';
  const drawOrder =
    mode === 'random' ? shuffle(tpIds) : tournamentDrawFromSeeds(tpIds, size);
  if (!drawOrder) throw new Error('Could not build draw');
  await setTournamentDraw(tid, drawOrder);

  return { tourEventId: tourEventId, tournamentId: tid, alreadyStarted: false };
}

/** @deprecated Prefer scheduled events at createTour + startTourEventBracket */
export async function createTourEvent(tourId, { name, eventType = '200', winnerPoints, drawSize = 8 }) {
  const database = await getDb();
  const tour = await getTourById(tourId);
  if (!tour) throw new Error('Tour not found');
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Event name is required');
  let wp = parseFloat(winnerPoints);
  if (!Number.isFinite(wp) || wp <= 0) {
    const preset = TOUR_EVENT_TYPES[eventType];
    wp = preset ? preset.winnerPoints : 200;
  }
  const fp = wp / 2;
  const size = parseInt(drawSize, 10) || 8;
  const tName = `${tour.name} — ${trimmed}`;
  const tid = await createTournament(tName, size);
  const seasonId = await resolveSeasonIdForNewEvent(database, tourId);
  const maxOrder = await database.getFirstAsync(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM tour_events WHERE season_id = ?',
    [seasonId]
  );
  const sortOrder = (maxOrder?.m ?? -1) + 1;
  const lastEv = await database.getFirstAsync(
    `SELECT scheduled_date FROM tour_events WHERE season_id = ? AND scheduled_date IS NOT NULL AND length(scheduled_date) >= 10
     ORDER BY sort_order DESC LIMIT 1`,
    [seasonId]
  );
  let scheduled_date = toDateStr(new Date());
  if (lastEv?.scheduled_date) {
    const pd = parseDateStr(lastEv.scheduled_date);
    if (pd) scheduled_date = toDateStr(addDays(pd, 7));
  }
  const calendar_color = TOUR_CALENDAR_COLORS[sortOrder % TOUR_CALENDAR_COLORS.length];
  const r = await database.runAsync(
    `INSERT INTO tour_events (tour_id, season_id, name, event_type, winner_points, finalist_points, linked_tournament_id, status, sort_order, scheduled_date, calendar_color, draw_size, match_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ongoing', ?, ?, ?, ?, 'seeds')`,
    [tourId, seasonId, trimmed, String(eventType), wp, fp, tid, sortOrder, scheduled_date, calendar_color, size]
  );
  return { tourEventId: r.lastInsertRowId, tournamentId: tid };
}

export async function getTourEvents(tourId) {
  const database = await getDb();
  return database.getAllAsync(
    `SELECT e.*, t.name AS bracket_name, t.status AS bracket_status,
            s.sort_order AS season_sort_order, s.name AS season_name
     FROM tour_events e
     LEFT JOIN tournaments t ON t.id = e.linked_tournament_id
     LEFT JOIN tour_seasons s ON s.id = e.season_id
     WHERE e.tour_id = ?
     ORDER BY COALESCE(s.sort_order, 0) ASC, e.sort_order ASC, e.id ASC`,
    [tourId]
  );
}

/** Standings: sum points from the last N *completed* scheduled tournaments; N = number of events on this tour’s schedule. */
export async function getTourRankings(tourId) {
  const database = await getDb();
  const tour = await getTourById(tourId);
  if (!tour) return [];
  const n = await getTourRollingWindowSize(tourId);
  const evRows = await database.getAllAsync(
    `SELECT e.id FROM tour_events e
     LEFT JOIN tour_seasons s ON s.id = e.season_id
     WHERE e.tour_id = ? AND e.status = 'complete'
     ORDER BY COALESCE(s.sort_order, 0) ASC, e.sort_order ASC, e.id ASC`,
    [tourId]
  );
  const ids = evRows.map((r) => r.id);
  const eventIds = ids.slice(-n);
  if (eventIds.length === 0) {
    const zeroRows = await database.getAllAsync(
      `SELECT tp.player_id, pl.name AS player_name, 0 AS total_points
       FROM tour_participants tp
       JOIN players pl ON pl.id = tp.player_id
       WHERE tp.tour_id = ?
       ORDER BY pl.name ASC`,
      [tourId]
    );
    return zeroRows.map((r, i) => ({ ...r, rank: i + 1 }));
  }
  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await database.getAllAsync(
    `SELECT tp.player_id, pl.name AS player_name,
      COALESCE((SELECT SUM(tpe.points) FROM tour_point_entries tpe
        WHERE tpe.tour_id = tp.tour_id AND tpe.player_id = tp.player_id
        AND tpe.tour_event_id IN (${placeholders})), 0) AS total_points
     FROM tour_participants tp
     JOIN players pl ON pl.id = tp.player_id
     WHERE tp.tour_id = ?
     ORDER BY total_points DESC, pl.name ASC`,
    [...eventIds, tourId]
  );
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Cumulative tour points after each completed event in the rolling window (for standings chart).
 * Window size N = scheduled event count; uses the last N completed events in schedule order.
 */
export async function getTourRollingPointsSparkline(tourId) {
  const database = await getDb();
  const n = await getTourRollingWindowSize(tourId);
  const completedChrono = await database.getAllAsync(
    `SELECT e.id, e.name FROM tour_events e
     LEFT JOIN tour_seasons s ON s.id = e.season_id
     WHERE e.tour_id = ? AND e.status = 'complete'
     ORDER BY COALESCE(s.sort_order, 0) ASC, e.sort_order ASC, e.id ASC`,
    [tourId]
  );
  const windowEv = completedChrono.slice(-n);
  if (windowEv.length === 0) {
    return { labels: [], series: [] };
  }
  const eventIds = windowEv.map((e) => e.id);
  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await database.getAllAsync(
    `SELECT tour_event_id, player_id, points FROM tour_point_entries WHERE tour_id = ? AND tour_event_id IN (${placeholders})`,
    [tourId, ...eventIds]
  );
  const byEventPlayer = {};
  for (const r of rows) {
    const k = `${r.tour_event_id}:${r.player_id}`;
    byEventPlayer[k] = (byEventPlayer[k] || 0) + r.points;
  }
  const players = await database.getAllAsync(
    `SELECT tp.player_id, pl.name AS player_name
     FROM tour_participants tp
     JOIN players pl ON pl.id = tp.player_id
     WHERE tp.tour_id = ?
     ORDER BY pl.name ASC`,
    [tourId]
  );
  const series = players.map((p) => {
    let cum = 0;
    const cumulative = [];
    for (const ev of windowEv) {
      cum += byEventPlayer[`${ev.id}:${p.player_id}`] || 0;
      cumulative.push(cum);
    }
    return { player_id: p.player_id, player_name: p.player_name, cumulative };
  });
  series.sort(
    (a, b) =>
      (b.cumulative[b.cumulative.length - 1] || 0) - (a.cumulative[a.cumulative.length - 1] || 0)
  );
  return {
    labels: windowEv.map((e) => e.name),
    series: series.slice(0, 5),
  };
}

export async function getTourTitlesWon(tourId) {
  const database = await getDb();
  return database.getAllAsync(
    `SELECT player_id, COUNT(*) AS titles FROM tour_point_entries
     WHERE tour_id = ? AND role = 'winner'
     GROUP BY player_id`,
    [tourId]
  );
}

/**
 * "Weeks" at #1: each completed tournament in schedule order counts as one unit.
 * After each event’s points are applied, if there is a sole points leader, they get +1.
 */
export async function getTourWeeksAtNumberOne(tourId) {
  const database = await getDb();
  const events = await database.getAllAsync(
    `SELECT e.id FROM tour_events e
     LEFT JOIN tour_seasons s ON s.id = e.season_id
     WHERE e.tour_id = ?
     ORDER BY COALESCE(s.sort_order, 0) ASC, e.sort_order ASC, e.id ASC`,
    [tourId]
  );
  const players = await database.getAllAsync('SELECT player_id FROM tour_participants WHERE tour_id = ?', [tourId]);
  const playerIds = players.map((p) => p.player_id);
  const weeksCount = Object.fromEntries(playerIds.map((id) => [id, 0]));
  if (!playerIds.length) return [];
  const totals = Object.fromEntries(playerIds.map((id) => [id, 0]));

  for (const ev of events) {
    const rows = await database.getAllAsync(
      'SELECT player_id, points FROM tour_point_entries WHERE tour_id = ? AND tour_event_id = ?',
      [tourId, ev.id]
    );
    if (!rows.length) continue;
    for (const row of rows) {
      totals[row.player_id] = (totals[row.player_id] || 0) + row.points;
    }
    let best = -1;
    const leaders = [];
    for (const pid of playerIds) {
      const pts = totals[pid] || 0;
      if (pts > best) {
        best = pts;
        leaders.length = 0;
        leaders.push(pid);
      } else if (pts === best && pts > 0) {
        leaders.push(pid);
      }
    }
    if (leaders.length === 1 && best > 0) {
      weeksCount[leaders[0]] += 1;
    }
  }
  return playerIds.map((player_id) => ({ player_id, weeks_at_one: weeksCount[player_id] || 0 }));
}

export async function getTourSummaryStats(tourId) {
  const database = await getDb();
  const tour = await getTourById(tourId);
  if (!tour) return null;
  const participants = await database.getFirstAsync(
    'SELECT COUNT(*) AS c FROM tour_participants WHERE tour_id = ?',
    [tourId]
  );
  const events = await database.getAllAsync('SELECT id, status FROM tour_events WHERE tour_id = ?', [tourId]);
  const completed = events.filter((e) => e.status === 'complete').length;
  const eventCount = events.length;
  return {
    createdAt: tour.created_at,
    rollingTournamentCount: Math.max(1, eventCount),
    participantCount: participants?.c ?? 0,
    eventCount,
    completedEventCount: completed,
  };
}

export async function getTourH2HAcrossEvents(tourId, playerAId, playerBId) {
  const database = await getDb();
  const events = await database.getAllAsync(
    'SELECT linked_tournament_id FROM tour_events WHERE tour_id = ? AND linked_tournament_id IS NOT NULL',
    [tourId]
  );
  let wins = 0;
  let losses = 0;
  for (const ev of events) {
    const h = await getTournamentH2H(ev.linked_tournament_id, playerAId, playerBId);
    wins += h.wins;
    losses += h.losses;
  }
  return { wins, losses };
}

/**
 * Detailed tour-only bracket stats between two app players (all events on this tour).
 * Excludes app matchups; only knockout/round-robin rows in linked tournaments.
 */
export async function getTourPairBracketDetailedStats(tourId, playerAId, playerBId) {
  const database = await getDb();
  const events = await database.getAllAsync(
    `SELECT e.id, e.linked_tournament_id, e.sort_order FROM tour_events e
     LEFT JOIN tour_seasons s ON s.id = e.season_id
     WHERE e.tour_id = ? AND e.linked_tournament_id IS NOT NULL
     ORDER BY COALESCE(s.sort_order, 0) ASC, e.sort_order ASC, e.id ASC`,
    [tourId]
  );
  const meetings = [];
  for (let evIdx = 0; evIdx < events.length; evIdx++) {
    const tid = events[evIdx].linked_tournament_id;
    const participants = await getTournamentParticipants(tid);
    const pa = participants.find((p) => p.player_id === playerAId);
    const pb = participants.find((p) => p.player_id === playerBId);
    if (!pa || !pb) continue;
    const tourn = await getTournamentById(tid);
    const matches = await getTournamentMatches(tid);
    const maxR = matches.length ? Math.max(...matches.map((m) => Number(m.round) || 0)) : 0;
    const isKnockout = tourn?.format === 'knockout';
    for (const m of matches) {
      if (!m.winner_participant_id) continue;
      const hasA = m.player1_participant_id === pa.id || m.player2_participant_id === pa.id;
      const hasB = m.player1_participant_id === pb.id || m.player2_participant_id === pb.id;
      if (!hasA || !hasB) continue;
      meetings.push({
        score: m.score || '',
        aIsPlayer1: m.player1_participant_id === pa.id,
        winnerIsA: m.winner_participant_id === pa.id,
        isFinalMeeting: isKnockout && Number(m.round) === maxR && Number(m.match_index_in_round) === 0,
        sortIndex: evIdx * 10000 + Number(m.round) * 100 + Number(m.match_index_in_round),
      });
    }
  }
  meetings.sort((a, b) => a.sortIndex - b.sortIndex);
  return computeTourBracketPairDetailedStats(meetings.map(({ sortIndex, ...rest }) => rest));
}

/** Finals = reached championship match (winner or finalist points row for that event). */
export async function getTourFinalsAppearanceCounts(tourId) {
  const database = await getDb();
  return database.getAllAsync(
    `SELECT tpe.player_id, pl.name AS player_name, COUNT(*) AS finals
     FROM tour_point_entries tpe
     JOIN players pl ON pl.id = tpe.player_id
     WHERE tpe.tour_id = ? AND tpe.role IN ('winner', 'finalist')
     GROUP BY tpe.player_id
     ORDER BY finals DESC, pl.name ASC`,
    [tourId]
  );
}

/** Pair with smallest |wins − losses| in tour bracket H2H (tie-break: more meetings). */
export async function getTourClosestH2HPair(tourId) {
  const players = await getTourParticipants(tourId);
  if (players.length < 2) return null;
  let best = null;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i].player_id;
      const b = players[j].player_id;
      const h = await getTourH2HAcrossEvents(tourId, a, b);
      const played = h.wins + h.losses;
      if (played === 0) continue;
      const diff = Math.abs(h.wins - h.losses);
      if (
        !best ||
        diff < best.diff ||
        (diff === best.diff && played > best.played)
      ) {
        best = {
          player_a_id: a,
          player_b_id: b,
          player_a_name: players[i].player_name,
          player_b_name: players[j].player_name,
          wins_a: h.wins,
          losses_a: h.losses,
          diff,
          played,
        };
      }
    }
  }
  return best;
}

/** Players who appeared in every completed event’s bracket on this tour. */
export async function getTourCareerOpenCompleters(tourId) {
  const database = await getDb();
  const events = await database.getAllAsync(
    `SELECT e.id, e.linked_tournament_id FROM tour_events e
     LEFT JOIN tour_seasons s ON s.id = e.season_id
     WHERE e.tour_id = ? AND e.status = 'complete' AND e.linked_tournament_id IS NOT NULL
     ORDER BY COALESCE(s.sort_order, 0) ASC, e.sort_order ASC, e.id ASC`,
    [tourId]
  );
  if (!events.length) return { totalEvents: 0, completers: [] };
  const participants = await getTourParticipants(tourId);
  const completers = [];
  for (const p of participants) {
    let ok = true;
    for (const ev of events) {
      const row = await database.getFirstAsync(
        `SELECT 1 AS x FROM tournament_participants WHERE tournament_id = ? AND player_id = ? LIMIT 1`,
        [ev.linked_tournament_id, p.player_id]
      );
      if (!row) {
        ok = false;
        break;
      }
    }
    if (ok) completers.push({ player_id: p.player_id, player_name: p.player_name });
  }
  return { totalEvents: events.length, completers };
}

export async function getTourWithDetails(tourId) {
  await ensureTourSeasonRollover(tourId);
  const [tour, participants, events, seasons] = await Promise.all([
    getTourById(tourId),
    getTourParticipants(tourId),
    getTourEvents(tourId),
    getTourSeasons(tourId),
  ]);
  if (!tour) return null;
  return { tour, participants, events, seasons };
}
