import * as SQLite from 'expo-sqlite';

const DB_NAME = 'tennis_scorekeeper.db';
let db = null;

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

export async function getDb() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(SCHEMA);
  try {
    await db.execAsync('ALTER TABLE players ADD COLUMN profile_image TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE players ADD COLUMN description TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE players ADD COLUMN start_date TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE players ADD COLUMN racket_level TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE matches ADD COLUMN remarks TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE matches ADD COLUMN images TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE tournaments ADD COLUMN date TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE tournaments ADD COLUMN description TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE tournaments ADD COLUMN remarks TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE tournaments ADD COLUMN images TEXT');
  } catch (_) {}
  return db;
}

// --- Tournaments ---
function isValidDrawSize(n) {
  return n >= 2 && n <= 64 && (n & (n - 1)) === 0;
}

export async function getAllTournaments() {
  const database = await getDb();
  const rows = await database.getAllAsync(
    'SELECT * FROM tournaments ORDER BY created_at DESC'
  );
  return rows;
}

export async function getTournamentById(tournamentId) {
  const database = await getDb();
  const t = await database.getFirstAsync('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  return t ?? null;
}

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
    'INSERT INTO tournaments (name, status, draw_size, date, description, remarks, images) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [trimmed, 'ongoing', size, date, description, remarks, images]
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
  const drawSize = (await getTournamentById(tournamentId))?.draw_size ?? 8;
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

export async function setTournamentMatchWinner(tournamentMatchId, winnerParticipantId) {
  const database = await getDb();
  const row = await database.getFirstAsync(
    'SELECT id, tournament_id, round, match_index_in_round FROM tournament_matches WHERE id = ?',
    [tournamentMatchId]
  );
  if (!row) return;
  await database.runAsync('UPDATE tournament_matches SET winner_participant_id = ? WHERE id = ?', [
    winnerParticipantId,
    tournamentMatchId,
  ]);
  const nextRound = row.round - 1;
  if (nextRound < 0) {
    const t = await database.getFirstAsync('SELECT id FROM tournaments WHERE id = ?', [row.tournament_id]);
    if (t) await database.runAsync("UPDATE tournaments SET status = 'complete' WHERE id = ?", [row.tournament_id]);
    return;
  }
  const nextMatchIndex = Math.floor(row.match_index_in_round / 2);
  const slot = row.match_index_in_round % 2;
  const nextMatch = await database.getFirstAsync(
    'SELECT id FROM tournament_matches WHERE tournament_id = ? AND round = ? AND match_index_in_round = ?',
    [row.tournament_id, nextRound, nextMatchIndex]
  );
  if (nextMatch) {
    const col = slot === 0 ? 'player1_participant_id' : 'player2_participant_id';
    await database.runAsync(`UPDATE tournament_matches SET ${col} = ? WHERE id = ?`, [
      winnerParticipantId,
      nextMatch.id,
    ]);
  }
}

export async function linkTournamentMatchToAppMatch(tournamentMatchId, matchId) {
  const database = await getDb();
  await database.runAsync('UPDATE tournament_matches SET linked_match_id = ? WHERE id = ?', [
    matchId,
    tournamentMatchId,
  ]);
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

export async function deletePlayer(id) {
  const database = await getDb();
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

/** Update match: datePlayed, setScores (array of { gamesPlayer1, gamesPlayer2 }), remarks, images (JSON string array). */
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
      const { gamesPlayer1, gamesPlayer2 } = setScores[i];
      await database.runAsync(
        'INSERT INTO set_scores (match_id, set_number, games_player1, games_player2) VALUES (?, ?, ?, ?)',
        [matchId, i + 1, gamesPlayer1 ?? 0, gamesPlayer2 ?? 0]
      );
    }
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
    'SELECT set_number, games_player1, games_player2 FROM set_scores WHERE match_id = ? ORDER BY set_number',
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
  for (const s of sets) {
    if (s.games_player1 > s.games_player2) setsPlayer1++;
    else setsPlayer2++;
    gamesPlayer1 += s.games_player1;
    gamesPlayer2 += s.games_player2;
  }
  const database = await getDb();
  const m = await database.getFirstAsync('SELECT player1_id, player2_id FROM matches WHERE id = ?', [matchId]);
  if (!m) return null;
  const winnerId = setsPlayer1 > setsPlayer2 ? m.player1_id : m.player2_id;
  const loserId = setsPlayer1 > setsPlayer2 ? m.player2_id : m.player1_id;
  return {
    winnerId,
    loserId,
    setsPlayer1,
    setsPlayer2,
    gamesPlayer1,
    gamesPlayer2,
  };
}

export async function getPlayerStats(playerId) {
  const matches = await getMatchesForPlayer(playerId);
  let wins = 0;
  let recordedMatches = 0;
  let totalGamesWon = 0;
  let totalSetsWon = 0;
  let totalSetsPlayed = 0;
  let totalGamesPlayed = 0;
  let bagelsServed = 0;
  let breadsticksServed = 0;
  const opponentCounts = {};
  const matchWins = [];

  for (const match of matches) {
    const result = await getMatchResult(match.id);
    if (!result) continue;
    recordedMatches++;
    const isPlayer1 = match.player1_id === playerId;
    const won = result.winnerId === playerId;
    if (won) wins++;
    matchWins.push(won);
    totalGamesWon += isPlayer1 ? result.gamesPlayer1 : result.gamesPlayer2;
    totalSetsWon += isPlayer1 ? result.setsPlayer1 : result.setsPlayer2;
    totalSetsPlayed += result.setsPlayer1 + result.setsPlayer2;
    totalGamesPlayed += result.gamesPlayer1 + result.gamesPlayer2;
    const sets = await getSetScoresForMatch(match.id);
    for (const s of sets) {
      const myGames = isPlayer1 ? s.games_player1 : s.games_player2;
      const oppGames = isPlayer1 ? s.games_player2 : s.games_player1;
      if (myGames === 6 && oppGames === 0) bagelsServed++;
      if (myGames === 6 && oppGames === 1) breadsticksServed++;
    }
    const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
    const opponentName = isPlayer1 ? match.player2_name : match.player1_name;
    if (!opponentCounts[opponentId]) {
      opponentCounts[opponentId] = { playerId: opponentId, name: opponentName, matches: 0 };
    }
    opponentCounts[opponentId].matches += 1;
  }

  let currentWinStreak = 0;
  for (let i = 0; i < matchWins.length && matchWins[i]; i++) currentWinStreak++;
  let bestWinStreak = 0;
  let run = 0;
  for (let i = 0; i < matchWins.length; i++) {
    if (matchWins[i]) {
      run++;
      if (run > bestWinStreak) bestWinStreak = run;
    } else {
      run = 0;
    }
  }

  const mostPlayedWith = Object.values(opponentCounts).sort((a, b) => b.matches - a.matches)[0] || null;
  const losses = recordedMatches - wins;
  const winPct = recordedMatches > 0 ? (wins / recordedMatches) * 100 : 0;

  return {
    matchesPlayed: matches.length,
    recordedMatches,
    wins,
    losses,
    totalGamesWon,
    totalSetsWon,
    totalSetsPlayed,
    totalGamesPlayed,
    totalUniquePlayers: Object.keys(opponentCounts).length,
    mostPlayedWith,
    winPercentage: winPct,
    currentWinStreak,
    bestWinStreak,
    bagelsServed,
    breadsticksServed,
  };
}

export async function getHeadToHead(playerAId, playerBId) {
  const matches = await getMatchesForPlayer(playerAId);
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    const otherId = m.player1_id === playerAId ? m.player2_id : m.player1_id;
    if (otherId !== playerBId) continue;
    const result = await getMatchResult(m.id);
    if (!result) continue;
    if (result.winnerId === playerAId) wins++;
    else losses++;
  }
  return { wins, losses };
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

/** Detailed H2H stats for a matchup: days, sets, games, closest/easiest set, tie breaks, win %, margins */
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
  const dayWinners = [];

  for (const m of between) {
    const sets = await getSetScoresForMatch(m.id);
    const isP1First = m.player1_id === player1Id;
    let setsP1ThisDay = 0;
    let setsP2ThisDay = 0;
    if (sets.length > mostSetsInSingleDay) mostSetsInSingleDay = sets.length;

    for (const s of sets) {
      const g1 = s.games_player1 ?? 0;
      const g2 = s.games_player2 ?? 0;
      const p1Games = isP1First ? g1 : g2;
      const p2Games = isP1First ? g2 : g1;
      totalSetsPlayed++;
      totalGamesPlayed += p1Games + p2Games;
      gamesPlayer1 += p1Games;
      gamesPlayer2 += p2Games;
      const margin = Math.abs(p1Games - p2Games);
      const scoreStr = `${p1Games}-${p2Games}`;
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
    if (setsP1ThisDay > setsP2ThisDay) {
      daysWonPlayer1++;
      dayWinners.push('p1');
    } else if (setsP2ThisDay > setsP1ThisDay) {
      daysWonPlayer2++;
      dayWinners.push('p2');
    }
  }

  let currentWinStreakPlayer1 = 0;
  let currentWinStreakPlayer2 = 0;
  for (let i = 0; i < dayWinners.length && dayWinners[i] === 'p1'; i++) currentWinStreakPlayer1++;
  for (let i = 0; i < dayWinners.length && dayWinners[i] === 'p2'; i++) currentWinStreakPlayer2++;
  let bestWinStreakPlayer1 = 0;
  let bestWinStreakPlayer2 = 0;
  let run1 = 0, run2 = 0;
  for (let i = 0; i < dayWinners.length; i++) {
    if (dayWinners[i] === 'p1') {
      run1++;
      run2 = 0;
      if (run1 > bestWinStreakPlayer1) bestWinStreakPlayer1 = run1;
    } else if (dayWinners[i] === 'p2') {
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
    setsPlayer1,
    setsPlayer2,
    totalGamesPlayed,
    gamesPlayer1,
    gamesPlayer2,
    tieBreaksPlayed,
    closestSet: closestSet ? closestSet.score : null,
    easiestSet: easiestSet ? easiestSet.score : null,
    mostSetsInSingleDay,
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

/** Per-day data for matchup graph: date, sets won by P1 and P2 (chronological, oldest first) */
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
    });
  }
  days.sort((a, b) => (a.date || '').localeCompare(b.date || '') || 0);
  return days;
}
