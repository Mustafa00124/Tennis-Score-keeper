/**
 * Web fallback: localStorage-backed store (expo-sqlite not supported in browser).
 * Same API as database.native.js for Players, Matches, Stats, H2H.
 */
const KEY_PLAYERS = 'tennis_players';
const KEY_MATCHES = 'tennis_matches';
const KEY_SET_SCORES = 'tennis_set_scores';
const KEY_TOURNAMENTS = 'tennis_tournaments';
const KEY_TOURNAMENT_PARTICIPANTS = 'tennis_tournament_participants';
const KEY_TOURNAMENT_MATCHES = 'tennis_tournament_matches';

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

function loadTournaments() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_TOURNAMENTS) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTournaments(data) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_TOURNAMENTS, JSON.stringify(data));
}

function loadTournamentParticipants() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_TOURNAMENT_PARTICIPANTS) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTournamentParticipants(data) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_TOURNAMENT_PARTICIPANTS, JSON.stringify(data));
}

function loadTournamentMatches() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_TOURNAMENT_MATCHES) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTournamentMatches(data) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_TOURNAMENT_MATCHES, JSON.stringify(data));
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
  let bagelsServed = 0;
  let breadsticksServed = 0;
  const opponentCounts = {};
  const matchWins = []; // true if player won, most recent first
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
    currentWinStreak,
    bestWinStreak,
    bagelsServed,
    breadsticksServed,
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
  const dayWinners = []; // 'p1' | 'p2', most recent first

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

// --- Tournaments ---
function isValidDrawSize(n) {
  return n >= 2 && n <= 64 && (n & (n - 1)) === 0;
}

export async function getAllTournaments() {
  const list = loadTournaments();
  return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function getTournamentById(tournamentId) {
  const list = loadTournaments();
  return list.find((t) => t.id === tournamentId) ?? null;
}

export async function createTournament(name, drawSize, opts = {}) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Tournament name is required');
  const size = parseInt(drawSize, 10) || 8;
  if (!isValidDrawSize(size)) throw new Error('Draw size must be 2, 4, 8, 16, 32, or 64');
  const list = loadTournaments();
  const id = list.length ? Math.max(...list.map((t) => t.id)) + 1 : 1;
  const date = (opts.date || '').trim() || null;
  const description = (opts.description || '').trim() || null;
  const remarks = (opts.remarks || '').trim() || null;
  const images = Array.isArray(opts.images) ? opts.images : (opts.images ? null : null);
  list.push({
    id,
    name: trimmed,
    status: 'ongoing',
    draw_size: size,
    date: date || null,
    description: description || null,
    remarks: remarks || null,
    images: images || null,
    created_at: new Date().toISOString(),
  });
  saveTournaments(list);
  return id;
}

export async function updateTournament(tournamentId, updates = {}) {
  const list = loadTournaments();
  const t = list.find((x) => x.id === tournamentId);
  if (!t) return;
  if (updates.date !== undefined) t.date = (updates.date || '').trim() || null;
  if (updates.description !== undefined) t.description = (updates.description || '').trim() || null;
  if (updates.remarks !== undefined) t.remarks = (updates.remarks || '').trim() || null;
  if (updates.images !== undefined) t.images = Array.isArray(updates.images) ? updates.images : (updates.images || null);
  saveTournaments(list);
}

export async function addTournamentParticipant(tournamentId, { playerId, displayName }, slot) {
  const name = (displayName || '').trim() || 'Unknown';
  const all = loadTournamentParticipants();
  const existing = all.filter((p) => p.tournament_id === tournamentId);
  const assignedSlot = slot != null ? slot : existing.length;
  const id = all.length ? Math.max(...all.map((p) => p.id)) + 1 : 1;
  all.push({
    id,
    tournament_id: tournamentId,
    player_id: playerId ?? null,
    display_name: name,
    slot: assignedSlot,
  });
  saveTournamentParticipants(all);
  return id;
}

export async function getTournamentParticipants(tournamentId) {
  const players = loadPlayers();
  const list = loadTournamentParticipants()
    .filter((p) => p.tournament_id === tournamentId)
    .sort((a, b) => a.slot - b.slot)
    .map((p) => {
      const pl = players.find((x) => x.id === p.player_id);
      return {
        ...p,
        display_name: p.display_name || (pl && pl.name) || 'Unknown',
      };
    });
  return list;
}

export async function setTournamentDraw(tournamentId, participantIdsBySlot) {
  let participants = loadTournamentParticipants().filter((p) => p.tournament_id === tournamentId);
  for (let slot = 0; slot < participantIdsBySlot.length; slot++) {
    const pid = participantIdsBySlot[slot];
    const p = participants.find((x) => x.id === pid);
    if (p) p.slot = slot;
  }
  saveTournamentParticipants([
    ...loadTournamentParticipants().filter((p) => p.tournament_id !== tournamentId),
    ...participants,
  ]);
  participants = loadTournamentParticipants().filter((p) => p.tournament_id === tournamentId).sort((a, b) => a.slot - b.slot);
  const slotToParticipant = Object.fromEntries(participants.map((p) => [p.slot, p.id]));
  const tournament = await getTournamentById(tournamentId);
  const drawSize = tournament?.draw_size ?? 8;
  let numMatches = drawSize / 2;
  let round = 0;
  const toAdd = [];
  while (numMatches >= 1) {
    for (let i = 0; i < numMatches; i++) {
      let p1 = null;
      let p2 = null;
      if (round === 0) {
        p1 = slotToParticipant[i * 2] ?? null;
        p2 = slotToParticipant[i * 2 + 1] ?? null;
      }
      toAdd.push({
        tournament_id: tournamentId,
        round,
        match_index_in_round: i,
        player1_participant_id: p1,
        player2_participant_id: p2,
        winner_participant_id: null,
        linked_match_id: null,
      });
    }
    round++;
    numMatches = Math.floor(numMatches / 2);
  }
  const existing = loadTournamentMatches();
  const maxId = existing.length ? Math.max(...existing.map((m) => m.id)) : 0;
  toAdd.forEach((m, i) => {
    m.id = maxId + i + 1;
  });
  saveTournamentMatches([
    ...existing.filter((m) => m.tournament_id !== tournamentId),
    ...toAdd,
  ]);
}

export async function getTournamentMatches(tournamentId) {
  const participants = loadTournamentParticipants().filter((p) => p.tournament_id === tournamentId);
  const partById = Object.fromEntries(participants.map((p) => [p.id, { ...p, display_name: p.display_name || 'TBD' }]));
  const players = loadPlayers();
  return loadTournamentMatches()
    .filter((m) => m.tournament_id === tournamentId)
    .sort((a, b) => a.round - b.round || a.match_index_in_round - b.match_index_in_round)
    .map((m) => {
      const p1 = partById[m.player1_participant_id];
      const p2 = partById[m.player2_participant_id];
      const pl1 = p1?.player_id ? players.find((x) => x.id === p1.player_id) : null;
      const pl2 = p2?.player_id ? players.find((x) => x.id === p2.player_id) : null;
      return {
        ...m,
        player1_name: p1 ? (pl1 ? pl1.name : p1.display_name) : 'TBD',
        player2_name: p2 ? (pl2 ? pl2.name : p2.display_name) : 'TBD',
        player1_app_id: p1?.player_id ?? null,
        player2_app_id: p2?.player_id ?? null,
      };
    });
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
  const all = loadTournamentMatches();
  const row = all.find((m) => m.id === tournamentMatchId);
  if (!row) return;
  row.winner_participant_id = winnerParticipantId;
  saveTournamentMatches(all);
  const nextRound = row.round - 1;
  if (nextRound < 0) {
    const tournaments = loadTournaments();
    const t = tournaments.find((x) => x.id === row.tournament_id);
    if (t) {
      t.status = 'complete';
      saveTournaments(tournaments);
    }
    return;
  }
  const nextMatchIndex = Math.floor(row.match_index_in_round / 2);
  const slot = row.match_index_in_round % 2;
  const nextMatch = all.find(
    (m) => m.tournament_id === row.tournament_id && m.round === nextRound && m.match_index_in_round === nextMatchIndex
  );
  if (nextMatch) {
    if (slot === 0) nextMatch.player1_participant_id = winnerParticipantId;
    else nextMatch.player2_participant_id = winnerParticipantId;
    saveTournamentMatches(all);
  }
}

export async function linkTournamentMatchToAppMatch(tournamentMatchId, matchId) {
  const all = loadTournamentMatches();
  const m = all.find((x) => x.id === tournamentMatchId);
  if (m) {
    m.linked_match_id = matchId;
    saveTournamentMatches(all);
  }
}

export async function getTournamentMatchById(tournamentMatchId) {
  const participants = loadTournamentParticipants();
  const players = loadPlayers();
  const partById = Object.fromEntries(participants.map((p) => [p.id, p]));
  const m = loadTournamentMatches().find((x) => x.id === tournamentMatchId);
  if (!m) return null;
  const p1 = partById[m.player1_participant_id];
  const p2 = partById[m.player2_participant_id];
  const pl1 = p1?.player_id ? players.find((x) => x.id === p1.player_id) : null;
  const pl2 = p2?.player_id ? players.find((x) => x.id === p2.player_id) : null;
  return {
    ...m,
    player1_name: p1 ? (pl1 ? pl1.name : p1.display_name) : 'TBD',
    player2_name: p2 ? (pl2 ? pl2.name : p2.display_name) : 'TBD',
    player1_app_id: p1?.player_id ?? null,
    player2_app_id: p2?.player_id ?? null,
  };
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
  saveTournaments(loadTournaments().filter((t) => t.id !== tournamentId));
  saveTournamentParticipants(loadTournamentParticipants().filter((p) => p.tournament_id !== tournamentId));
  saveTournamentMatches(loadTournamentMatches().filter((m) => m.tournament_id !== tournamentId));
}
