/**
 * Web fallback: localStorage-backed store (expo-sqlite not supported in browser).
 * Same API as database.native.js for Players, Matches, Stats, H2H.
 */
const KEY_PLAYERS = 'tennis_players';
const KEY_MATCHES = 'tennis_matches';
const KEY_SET_SCORES = 'tennis_set_scores';

function loadPlayers() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_PLAYERS) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePlayers(players) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_PLAYERS, JSON.stringify(players));
}

function loadMatches() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_MATCHES) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMatches(matches) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_MATCHES, JSON.stringify(matches));
}

function loadSetScores() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_SET_SCORES) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSetScores(scores) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_SET_SCORES, JSON.stringify(scores));
}

export async function getDb() {
  return null;
}

export async function getAllPlayers() {
  const players = loadPlayers();
  return players.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function createPlayer(name, profile = {}) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Player name is required');
  const players = loadPlayers();
  if (players.some((p) => (p.name || '').toLowerCase() === trimmed.toLowerCase())) {
    const e = new Error('UNIQUE constraint failed');
    e.message = 'UNIQUE constraint failed';
    throw e;
  }
  const id = players.length ? Math.max(...players.map((p) => p.id)) + 1 : 1;
  const created_at = new Date().toISOString();
  players.push({
    id,
    name: trimmed,
    created_at,
    profile_image: profile.profileImage || null,
    description: (profile.description || '').trim() || null,
    start_date: (profile.startDate || '').trim() || null,
    racket_level: (profile.racketLevel || '').trim() || null,
  });
  savePlayers(players);
  return id;
}

export async function updatePlayer(id, updates = {}) {
  const players = loadPlayers();
  const player = players.find((p) => p.id === id);
  if (!player) return;

  if (updates.name !== undefined) {
    const trimmed = (updates.name || '').trim();
    if (!trimmed) throw new Error('Player name is required');
    const duplicate = players.find((p) => p.id !== id && (p.name || '').toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      const e = new Error('UNIQUE constraint failed');
      e.message = 'UNIQUE constraint failed';
      throw e;
    }
    player.name = trimmed;
  }
  if (updates.profileImage !== undefined) player.profile_image = updates.profileImage || null;
  if (updates.description !== undefined) player.description = (updates.description || '').trim() || null;
  if (updates.startDate !== undefined) player.start_date = (updates.startDate || '').trim() || null;
  if (updates.racketLevel !== undefined) player.racket_level = (updates.racketLevel || '').trim() || null;
  savePlayers(players);
}

export async function getPlayerById(id) {
  const players = loadPlayers();
  return players.find((p) => p.id === id) ?? null;
}

export async function deletePlayer(id) {
  const players = loadPlayers().filter((p) => p.id !== id);
  savePlayers(players);
}

export async function createMatchup(player1Id, player2Id) {
  if (player1Id === player2Id) throw new Error('Players must be different');
  const matches = loadMatches();
  const matchId = matches.length ? Math.max(...matches.map((m) => m.id)) + 1 : 1;
  matches.push({
    id: matchId,
    player1_id: player1Id,
    player2_id: player2Id,
    date_played: '',
    created_at: new Date().toISOString(),
    remarks: null,
    images: null,
  });
  saveMatches(matches);
  return matchId;
}

export async function createMatch(player1Id, player2Id, datePlayed, setScores) {
  if (!setScores?.length) throw new Error('At least one set is required');
  const dateStr = datePlayed || new Date().toISOString().slice(0, 10);
  const matchId = await createMatchup(player1Id, player2Id);
  await updateMatch(matchId, { datePlayed: dateStr, setScores });
  return matchId;
}

export async function updateMatch(matchId, { datePlayed, setScores, remarks, images }) {
  const matches = loadMatches();
  const m = matches.find((x) => x.id === matchId);
  if (!m) return;
  if (datePlayed !== undefined) m.date_played = datePlayed || '';
  if (remarks !== undefined) m.remarks = remarks ?? null;
  if (images !== undefined) m.images = Array.isArray(images) ? JSON.stringify(images) : (images || null);
  saveMatches(matches);
  if (setScores && setScores.length >= 0) {
    const allScores = loadSetScores().filter((s) => s.match_id !== matchId);
    const maxId = allScores.length ? Math.max(...allScores.map((s) => s.id)) : 0;
    setScores.forEach((s, i) => {
      allScores.push({
        id: maxId + i + 1,
        match_id: matchId,
        set_number: i + 1,
        games_player1: s.gamesPlayer1 ?? 0,
        games_player2: s.gamesPlayer2 ?? 0,
      });
    });
    saveSetScores(allScores);
  }
}

function getPlayerName(players, id) {
  return players.find((p) => p.id === id)?.name ?? 'Unknown';
}

export async function getMatchesForPlayer(playerId) {
  const players = loadPlayers();
  const matches = loadMatches();
  return matches
    .filter((m) => m.player1_id === playerId || m.player2_id === playerId)
    .map((m) => ({
      id: m.id,
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      date_played: m.date_played,
      player1_name: getPlayerName(players, m.player1_id),
      player2_name: getPlayerName(players, m.player2_id),
    }))
    .sort((a, b) => (b.date_played + b.id) - (a.date_played + a.id));
}

export async function getSetScoresForMatch(matchId) {
  const scores = loadSetScores().filter((s) => s.match_id === matchId);
  return scores.sort((a, b) => a.set_number - b.set_number).map((s) => ({
    set_number: s.set_number,
    games_player1: s.games_player1,
    games_player2: s.games_player2,
  }));
}

export async function getAllMatches() {
  const players = loadPlayers();
  const matches = loadMatches();
  return matches.map((m) => ({
    id: m.id,
    player1_id: m.player1_id,
    player2_id: m.player2_id,
    date_played: m.date_played || '',
    remarks: m.remarks,
    images: m.images,
    player1_name: getPlayerName(players, m.player1_id),
    player2_name: getPlayerName(players, m.player2_id),
  })).sort((a, b) => b.id - a.id);
}

export async function getMatchResult(matchId) {
  const sets = await getSetScoresForMatch(matchId);
  if (!sets.length) return null;
  let setsPlayer1 = 0, setsPlayer2 = 0, gamesPlayer1 = 0, gamesPlayer2 = 0;
  for (const s of sets) {
    if (s.games_player1 > s.games_player2) setsPlayer1++;
    else setsPlayer2++;
    gamesPlayer1 += s.games_player1;
    gamesPlayer2 += s.games_player2;
  }
  const matches = loadMatches();
  const m = matches.find((x) => x.id === matchId);
  if (!m) return null;
  const winnerId = setsPlayer1 > setsPlayer2 ? m.player1_id : m.player2_id;
  const loserId = setsPlayer1 > setsPlayer2 ? m.player2_id : m.player1_id;
  return { winnerId, loserId, setsPlayer1, setsPlayer2, gamesPlayer1, gamesPlayer2 };
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
    if (result.winnerId === playerId) wins++;
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
  const winPercentage = recordedMatches > 0 ? (wins / recordedMatches) * 100 : 0;
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
    winPercentage,
  };
}

export async function getHeadToHead(playerAId, playerBId) {
  const matches = await getMatchesForPlayer(playerAId);
  let wins = 0, losses = 0;
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
  const players = loadPlayers();
  const matches = loadMatches();
  const m = matches.find((x) => x.id === matchId);
  if (!m) return null;
  const sets = await getSetScoresForMatch(matchId);
  const result = await getMatchResult(matchId);
  let images = [];
  if (m.images) {
    try {
      images = typeof m.images === 'string' ? JSON.parse(m.images) : (m.images || []);
    } catch (_) {}
  }
  return {
    ...m,
    player1_name: getPlayerName(players, m.player1_id),
    player2_name: getPlayerName(players, m.player2_id),
    images: images || [],
    sets,
    ...result,
  };
}
