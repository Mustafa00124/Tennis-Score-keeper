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
  return db;
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
  const opponentCounts = {};

  for (const match of matches) {
    const result = await getMatchResult(match.id);
    if (!result) continue;
    recordedMatches++;
    const isPlayer1 = match.player1_id === playerId;
    const won = result.winnerId === playerId;
    if (won) wins++;
    totalGamesWon += isPlayer1 ? result.gamesPlayer1 : result.gamesPlayer2;
    totalSetsWon += isPlayer1 ? result.setsPlayer1 : result.setsPlayer2;
    totalSetsPlayed += result.setsPlayer1 + result.setsPlayer2;
    totalGamesPlayed += result.gamesPlayer1 + result.gamesPlayer2;
    const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
    const opponentName = isPlayer1 ? match.player2_name : match.player1_name;
    if (!opponentCounts[opponentId]) {
      opponentCounts[opponentId] = { playerId: opponentId, name: opponentName, matches: 0 };
    }
    opponentCounts[opponentId].matches += 1;
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
