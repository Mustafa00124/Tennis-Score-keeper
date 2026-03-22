/**
 * Web fallback: localStorage-backed store (expo-sqlite not supported in browser).
 * Same API as database.native.js for Players, Matches, Stats, H2H.
 */
import { isSetComplete } from '../utils/tennisScoring';

const KEY_PLAYERS = 'tennis_statbot_players';
const KEY_MATCHES = 'tennis_statbot_matches';
const KEY_SET_SCORES = 'tennis_statbot_set_scores';
const KEY_TOURNAMENTS = 'tennis_statbot_tournaments';
const KEY_TOURNAMENT_PARTICIPANTS = 'tennis_statbot_tournament_participants';
const KEY_TOURNAMENT_MATCHES = 'tennis_statbot_tournament_matches';

const WEB_STORAGE_MIGRATION_FLAG = 'tennis_statbot_storage_migrated_v1';
const LEGACY_WEB_KEYS = [
  ['tennis_players', KEY_PLAYERS],
  ['tennis_matches', KEY_MATCHES],
  ['tennis_set_scores', KEY_SET_SCORES],
  ['tennis_tournaments', KEY_TOURNAMENTS],
  ['tennis_tournament_participants', KEY_TOURNAMENT_PARTICIPANTS],
  ['tennis_tournament_matches', KEY_TOURNAMENT_MATCHES],
];

(function migrateWebStorageOnce() {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(WEB_STORAGE_MIGRATION_FLAG)) return;
  for (const [legacy, next] of LEGACY_WEB_KEYS) {
    const v = localStorage.getItem(legacy);
    if (v != null && localStorage.getItem(next) == null) {
      localStorage.setItem(next, v);
      localStorage.removeItem(legacy);
    }
  }
  localStorage.setItem(WEB_STORAGE_MIGRATION_FLAG, '1');
})();

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

/** Delete a player and all their matches (and set_scores). Tournament participants referencing this player are unlinked (player_id set to null). */
export async function deletePlayer(id) {
  const matches = loadMatches().filter((m) => m.player1_id !== id && m.player2_id !== id);
  const matchIdsToRemove = loadMatches().filter((m) => m.player1_id === id || m.player2_id === id).map((m) => m.id);
  saveMatches(matches);
  const scores = loadSetScores().filter((s) => !matchIdsToRemove.includes(s.match_id));
  saveSetScores(scores);
  const participants = loadTournamentParticipants();
  participants.forEach((p) => { if (p.player_id === id) p.player_id = null; });
  saveTournamentParticipants(participants);
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
      const tb1 = s.tiebreakPlayer1 != null && s.tiebreakPlayer1 !== '' ? s.tiebreakPlayer1 : null;
      const tb2 = s.tiebreakPlayer2 != null && s.tiebreakPlayer2 !== '' ? s.tiebreakPlayer2 : null;
      allScores.push({
        id: maxId + i + 1,
        match_id: matchId,
        set_number: i + 1,
        games_player1: s.gamesPlayer1 ?? 0,
        games_player2: s.gamesPlayer2 ?? 0,
        tiebreak_player1: tb1,
        tiebreak_player2: tb2,
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
    tiebreak_player1: s.tiebreak_player1,
    tiebreak_player2: s.tiebreak_player2,
  }));
}

/** Find a match for the same two players (in either order) on the same date (YYYY-MM-DD). Returns first match or null. */
export async function getMatchByPlayersAndDate(player1Id, player2Id, dateStr) {
  if (!dateStr || dateStr.length < 10) return null;
  const prefix = dateStr.slice(0, 10);
  const matches = loadMatches();
  const m = matches.find(
    (x) =>
      ((x.player1_id === player1Id && x.player2_id === player2Id) ||
        (x.player1_id === player2Id && x.player2_id === player1Id)) &&
      (x.date_played || '').slice(0, 10) === prefix
  );
  return m ?? null;
}

/** Delete a match and its set_scores. */
export async function deleteMatch(matchId) {
  const matches = loadMatches().filter((m) => m.id !== matchId);
  saveMatches(matches);
  const scores = loadSetScores().filter((s) => s.match_id !== matchId);
  saveSetScores(scores);
}

/** Delete all matches (and their set_scores) between two players. */
export async function deleteAllMatchesForMatchup(player1Id, player2Id) {
  const matches = loadMatches().filter(
    (m) =>
      (m.player1_id === player1Id && m.player2_id === player2Id) ||
      (m.player1_id === player2Id && m.player2_id === player1Id)
  );
  const idsToRemove = matches.map((m) => m.id);
  const newMatches = loadMatches().filter((m) => !idsToRemove.includes(m.id));
  saveMatches(newMatches);
  const scores = loadSetScores().filter((s) => !idsToRemove.includes(s.match_id));
  saveSetScores(scores);
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
  let setsPlayer1 = 0, setsPlayer2 = 0, gamesPlayer1 = 0, gamesPlayer2 = 0, incompleteSetCount = 0;
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
    } else if ((s.games_player1 ?? 0) > 0 || (s.games_player2 ?? 0) > 0) incompleteSetCount++;
  }
  const matches = loadMatches();
  const m = matches.find((x) => x.id === matchId);
  if (!m) return null;
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
    hasIncompleteSets: incompleteSetCount > 0,
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
  const dayOutcomes = [];

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
      dayOutcomes.push(true);
    } else if (mySets < oppSets) {
      daysLost++;
      dayOutcomes.push(false);
    } else {
      daysTied++;
      dayOutcomes.push(false);
    }
  }

  let currentWinStreak = 0;
  for (let i = 0; i < dayOutcomes.length && dayOutcomes[i]; i++) currentWinStreak++;
  let bestWinStreak = 0;
  let run = 0;
  for (let i = 0; i < dayOutcomes.length; i++) {
    if (dayOutcomes[i]) {
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
    recordedMatches: daysDecided,
    daysWon,
    daysLost,
    daysTied,
    daysNoResult,
    wins: daysWon,
    losses: daysLost,
    totalGamesWon,
    totalSetsWon,
    totalSetsPlayed,
    totalGamesPlayed,
    incompleteSets,
    totalUniquePlayers: Object.keys(opponentCounts).length,
    mostPlayedWith,
    setWinPercentage: setWinPct,
    gameWinPercentage: gameWinPct,
    winPercentage: setWinPct,
    currentWinStreak,
    bestWinStreak,
    bagelsServed,
    breadsticksServed,
  };
}

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
  };
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
    } catch (e) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('getMatchWithDetails: images parse failed', e?.message);
    }
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
  let incompleteSets = 0;
  const dayWinners = [];
  /** { dateStr, sets } for each match day, used to compute mostSetsInWeek/Month */
  const daySets = [];

  for (const m of between) {
    const sets = await getSetScoresForMatch(m.id);
    const isP1First = m.player1_id === player1Id;
    let setsP1ThisDay = 0;
    let setsP2ThisDay = 0;
    let completedCountThisDay = 0;
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
    if (completedCountThisDay > mostSetsInSingleDay) mostSetsInSingleDay = completedCountThisDay;
    const dateStr = (m.date_played || '').slice(0, 10);
    if (dateStr) daySets.push({ dateStr, sets: completedCountThisDay });
    if (setsP1ThisDay > setsP2ThisDay) {
      daysWonPlayer1++;
      dayWinners.push('p1');
    } else if (setsP2ThisDay > setsP1ThisDay) {
      daysWonPlayer2++;
      dayWinners.push('p2');
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
      hasIncompleteSets: result.hasIncompleteSets ?? false,
    });
  }
  days.sort((a, b) => (a.date || '').localeCompare(b.date || '') || 0);
  return days;
}

// --- Tournaments ---
function isValidDrawSize(n) {
  return n >= 2 && n <= 64 && (n & (n - 1)) === 0;
}

function isValidRoundRobinSize(n) {
  return n >= 2 && n <= 50;
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
  const format = opts.format === 'round_robin' ? 'round_robin' : 'knockout';
  const size = parseInt(drawSize, 10) || (format === 'round_robin' ? 4 : 8);
  if (format === 'knockout' && !isValidDrawSize(size)) throw new Error('Draw size must be 2, 4, 8, 16, 32, or 64');
  if (format === 'round_robin' && !isValidRoundRobinSize(size)) throw new Error('Number of players must be 2–50 for round robin');
  const list = loadTournaments();
  const id = list.length ? Math.max(...list.map((t) => t.id)) + 1 : 1;
  const date = (opts.date || '').trim() || null;
  const description = (opts.description || '').trim() || null;
  const remarks = (opts.remarks || '').trim() || null;
  const images = Array.isArray(opts.images) ? opts.images : null;
  list.push({
    id,
    name: trimmed,
    status: 'ongoing',
    draw_size: size,
    format,
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
  if (updates.format !== undefined) t.format = updates.format;
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

/** Circle method: player 0 fixed, others rotate. Returns [{ round, i, j }] with i < j. For odd n, uses bye (index n) then filters so every real pair plays once. */
function roundRobinPairings(n) {
  if (n < 2) return [];
  const useBye = n % 2 === 1;
  const N = useBye ? n + 1 : n;
  const pairs = [];
  const rounds = N - 1;
  const half = Math.floor(N / 2);
  for (let r = 0; r < rounds; r++) {
    pairs.push({ round: r, i: 0, j: r + 1 });
    for (let k = 1; k < half; k++) {
      const a = (r + k) % (N - 1) + 1;
      const b = (r + N - 1 - k) % (N - 1) + 1;
      pairs.push({ round: r, i: Math.min(a, b), j: Math.max(a, b) });
    }
  }
  if (useBye) {
    return pairs.filter((p) => p.i !== n && p.j !== n);
  }
  return pairs;
}

export async function setTournamentRoundRobinDraw(tournamentId, participantIdsBySlot) {
  const participants = loadTournamentParticipants().filter((p) => p.tournament_id === tournamentId);
  const bySlot = participantIdsBySlot.slice(0).map((pid) => participants.find((x) => x.id === pid)).filter(Boolean);
  for (let slot = 0; slot < bySlot.length; slot++) {
    const p = bySlot[slot];
    if (p) p.slot = slot;
  }
  saveTournamentParticipants([
    ...loadTournamentParticipants().filter((p) => p.tournament_id !== tournamentId),
    ...participants,
  ]);
  const ordered = loadTournamentParticipants()
    .filter((p) => p.tournament_id === tournamentId)
    .sort((a, b) => a.slot - b.slot);
  const slotToParticipant = ordered.map((p) => p.id);
  const n = slotToParticipant.length;
  if (n < 2) return;
  const pairings = roundRobinPairings(n);
  const existing = loadTournamentMatches();
  const maxId = existing.length ? Math.max(...existing.map((m) => m.id)) : 0;
  const toAdd = pairings.map((pr, idx) => ({
    id: maxId + idx + 1,
    tournament_id: tournamentId,
    round: pr.round,
    match_index_in_round: 0,
    player1_participant_id: slotToParticipant[pr.i],
    player2_participant_id: slotToParticipant[pr.j],
    winner_participant_id: null,
    linked_match_id: null,
  }));
  const byRound = {};
  toAdd.forEach((m) => {
    if (!byRound[m.round]) byRound[m.round] = 0;
    m.match_index_in_round = byRound[m.round]++;
  });
  saveTournamentMatches([
    ...existing.filter((m) => m.tournament_id !== tournamentId),
    ...toAdd,
  ]);
}

export async function setTournamentDraw(tournamentId, participantIdsBySlot) {
  const tournament = await getTournamentById(tournamentId);
  if (tournament?.format === 'round_robin') {
    return setTournamentRoundRobinDraw(tournamentId, participantIdsBySlot);
  }
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

export async function setTournamentMatchWinner(tournamentMatchId, winnerParticipantId, details = {}) {
  const all = loadTournamentMatches();
  const row = all.find((m) => m.id === tournamentMatchId);
  if (!row) return;
  row.winner_participant_id = winnerParticipantId;
  if (details.score != null && details.score !== '') row.score = String(details.score).trim();
  if (details.match_date != null && details.match_date !== '') row.match_date = String(details.match_date).trim();
  if (details.remarks != null && details.remarks !== '') row.remarks = String(details.remarks).trim();
  saveTournamentMatches(all);
  const tournament = loadTournaments().find((t) => t.id === row.tournament_id);
  if (tournament?.format === 'round_robin') return;
  const nextRound = row.round + 1;
  const nextMatchIndex = Math.floor(row.match_index_in_round / 2);
  const slot = row.match_index_in_round % 2;
  const nextMatch = all.find(
    (m) => m.tournament_id === row.tournament_id && m.round === nextRound && m.match_index_in_round === nextMatchIndex
  );
  if (!nextMatch) {
    const tournaments = loadTournaments();
    const t = tournaments.find((x) => x.id === row.tournament_id);
    if (t) {
      t.status = 'complete';
      saveTournaments(tournaments);
    }
    return;
  }
  if (slot === 0) nextMatch.player1_participant_id = winnerParticipantId;
  else nextMatch.player2_participant_id = winnerParticipantId;
  saveTournamentMatches(all);
}

export async function linkTournamentMatchToAppMatch(tournamentMatchId, matchId) {
  const all = loadTournamentMatches();
  const m = all.find((x) => x.id === tournamentMatchId);
  if (m) {
    m.linked_match_id = matchId;
    saveTournamentMatches(all);
  }
}

export async function setTournamentMatchRemark(tournamentMatchId, remark) {
  const all = loadTournamentMatches();
  const m = all.find((x) => x.id === tournamentMatchId);
  if (m) {
    m.remark = (remark != null && String(remark).trim() !== '') ? String(remark).trim() : null;
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
