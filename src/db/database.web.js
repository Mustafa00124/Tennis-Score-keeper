/**
 * Web fallback: localStorage-backed store (expo-sqlite not supported in browser).
 * Same API as database.native.js for Players, Matches, Stats, H2H.
 */
import {
  isSetComplete,
  formatSetScoreDisplay,
  parseTournamentScoreAggregateFromBracketString,
  computeTourBracketPairDetailedStats,
} from '../utils/tennisScoring';
import { TOUR_CALENDAR_COLORS, toDateStr, addDays, parseDateStr } from '../utils/tourCalendar';
import { shuffle, tournamentDrawFromSeeds } from '../utils/knockoutSeeding';

const KEY_PLAYERS = 'tennis_statbot_players';
const KEY_MATCHES = 'tennis_statbot_matches';
const KEY_SET_SCORES = 'tennis_statbot_set_scores';
const KEY_TOURNAMENTS = 'tennis_statbot_tournaments';
const KEY_TOURNAMENT_PARTICIPANTS = 'tennis_statbot_tournament_participants';
const KEY_TOURNAMENT_MATCHES = 'tennis_statbot_tournament_matches';
const KEY_TOURS = 'tennis_statbot_tours';
const KEY_TOUR_PARTICIPANTS = 'tennis_statbot_tour_participants';
const KEY_TOUR_EVENTS = 'tennis_statbot_tour_events';
const KEY_TOUR_POINT_ENTRIES = 'tennis_statbot_tour_point_entries';
const KEY_TOUR_SEASONS = 'tennis_statbot_tour_seasons';

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
  /** Consecutive sets won; newest set first */
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

function accumulateTournamentKnockoutScoresForPairWeb(playerAId, playerBId) {
  const allTm = loadTournamentMatches();
  const partList = loadTournamentParticipants();
  const tournaments = loadTournaments();
  const partById = Object.fromEntries(partList.map((p) => [p.id, p]));
  let setsWon = 0;
  let setsLost = 0;
  let gamesWon = 0;
  let gamesLost = 0;
  for (const tm of allTm) {
    if (!tm.winner_participant_id || tm.linked_match_id) continue;
    const t = tournaments.find((x) => x.id === tm.tournament_id);
    if (!t || t.format !== 'knockout') continue;
    const tp1 = partById[tm.player1_participant_id];
    const tp2 = partById[tm.player2_participant_id];
    if (!tp1 || !tp2) continue;
    const ok =
      (tp1.player_id === playerAId && tp2.player_id === playerBId) ||
      (tp1.player_id === playerBId && tp2.player_id === playerAId);
    if (!ok) continue;
    const agg = parseTournamentScoreAggregateFromBracketString(tm.score || '');
    const p1IsA = tp1.player_id === playerAId;
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
  const tAdd = accumulateTournamentKnockoutScoresForPairWeb(playerAId, playerBId);
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
  const setWinners = [];
  /** { dateStr, sets } for each match day, used to compute mostSetsInWeek/Month */
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

function normalizeTourEventDrawSize(n) {
  const v = parseInt(n, 10) || 8;
  return isValidDrawSize(v) ? v : 8;
}

export async function getTournamentById(tournamentId) {
  const list = loadTournaments();
  return list.find((t) => t.id === tournamentId) ?? null;
}

/** New brackets are always knockout (tour-linked). Legacy rows may still have format = round_robin. */
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
  const images = Array.isArray(opts.images) ? opts.images : null;
  const match_set_target = parseInt(opts.matchSetTarget, 10) === 4 ? 4 : 6;
  const match_sets_to_win = parseInt(opts.matchSetsToWin, 10) || null;
  list.push({
    id,
    name: trimmed,
    status: 'ongoing',
    draw_size: size,
    format: 'knockout',
    date: date || null,
    description: description || null,
    remarks: remarks || null,
    images: images || null,
    match_set_target,
    match_sets_to_win,
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

export async function setTournamentDraw(tournamentId, participantIdsBySlot) {
  const tournament = await getTournamentById(tournamentId);
  if (tournament?.format === 'round_robin') return;
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
  if (drawSize >= 4 && toAdd.length) {
    const lastBracketRound = Math.max(...toAdd.map((m) => m.round));
    toAdd.push({
      tournament_id: tournamentId,
      round: lastBracketRound,
      match_index_in_round: 1,
      player1_participant_id: null,
      player2_participant_id: null,
      winner_participant_id: null,
      linked_match_id: null,
    });
  }
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

function loadTours() {
  try {
    return JSON.parse(localStorage.getItem(KEY_TOURS) || '[]');
  } catch (_) {
    return [];
  }
}
function saveTours(data) {
  localStorage.setItem(KEY_TOURS, JSON.stringify(data));
}
function loadTourParticipants() {
  try {
    return JSON.parse(localStorage.getItem(KEY_TOUR_PARTICIPANTS) || '[]');
  } catch (_) {
    return [];
  }
}
function saveTourParticipants(data) {
  localStorage.setItem(KEY_TOUR_PARTICIPANTS, JSON.stringify(data));
}
function ensureTourEventsCalendarDefaults(raw) {
  const tours = loadTours();
  let dirty = false;
  for (const e of raw) {
    const needsDate = !e.scheduled_date || String(e.scheduled_date).length < 10;
    const needsColor = !e.calendar_color || !/^#[0-9a-fA-F]{6}$/i.test(String(e.calendar_color));
    if (!needsDate && !needsColor) continue;
    if (needsDate) {
      const t = tours.find((x) => x.id === e.tour_id);
      const baseStr = (t?.created_at || '').slice(0, 10) || toDateStr(new Date());
      const base = parseDateStr(baseStr) || new Date();
      const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      e.scheduled_date = toDateStr(addDays(start, (e.sort_order ?? 0) * 7));
      dirty = true;
    }
    if (needsColor) {
      e.calendar_color = TOUR_CALENDAR_COLORS[(e.sort_order ?? 0) % TOUR_CALENDAR_COLORS.length];
      dirty = true;
    }
  }
  if (dirty) saveTourEvents(raw);
  return raw;
}

function ensureTourEventsBracketFields(raw) {
  let dirty = false;
  for (const e of raw) {
    const etype = normalizeTourEventType(e.event_type);
    if (e.event_type !== etype) {
      e.event_type = etype;
      dirty = true;
    }
    const preset = getTourEventPreset(e.event_type);
    const ds = parseInt(e.draw_size, 10);
    if (e.draw_size == null || !isValidDrawSize(ds)) {
      e.draw_size = preset.drawSize ?? 8;
      dirty = true;
    }
    if (e.event_type === 'tourfinals' && e.draw_size !== 2) {
      e.draw_size = 2;
      dirty = true;
    }
    if (e.match_mode !== 'random' && e.match_mode !== 'seeds') {
      e.match_mode = 'seeds';
      dirty = true;
    }
  }
  if (dirty) saveTourEvents(raw);
  return raw;
}

function loadTourEvents() {
  ensureTourSeasonsWeb();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_TOUR_EVENTS) || '[]');
    const a = ensureTourEventsCalendarDefaults(raw);
    return ensureTourEventsBracketFields(a);
  } catch (_) {
    return [];
  }
}
function saveTourEvents(data) {
  localStorage.setItem(KEY_TOUR_EVENTS, JSON.stringify(data));
}
function loadTourPointEntries() {
  try {
    return JSON.parse(localStorage.getItem(KEY_TOUR_POINT_ENTRIES) || '[]');
  } catch (_) {
    return [];
  }
}
function saveTourPointEntries(data) {
  localStorage.setItem(KEY_TOUR_POINT_ENTRIES, JSON.stringify(data));
}

function loadTourSeasons() {
  try {
    return JSON.parse(localStorage.getItem(KEY_TOUR_SEASONS) || '[]');
  } catch (_) {
    return [];
  }
}

function saveTourSeasons(data) {
  localStorage.setItem(KEY_TOUR_SEASONS, JSON.stringify(data));
}

/** Backfill Season 1 + season_id on events (web store). */
function ensureTourSeasonsWeb() {
  if (typeof localStorage === 'undefined') return;
  const tours = loadTours();
  if (!tours.length) return;
  let seasons = loadTourSeasons();
  let maxSid = seasons.length ? Math.max(...seasons.map((s) => s.id), 0) : 0;
  let changed = false;
  for (const t of tours) {
    const has = seasons.some((s) => s.tour_id === t.id);
    if (!has) {
      maxSid += 1;
      seasons.push({
        id: maxSid,
        tour_id: t.id,
        sort_order: 0,
        name: 'Season 1',
        created_at: new Date().toISOString(),
      });
      changed = true;
    }
  }
  if (changed) saveTourSeasons(seasons);
  seasons = loadTourSeasons();
  const byTourFirst = {};
  for (const t of tours) {
    const ft = seasons.filter((s) => s.tour_id === t.id).sort((a, b) => a.sort_order - b.sort_order);
    byTourFirst[t.id] = ft[0]?.id;
  }
  const evRaw = JSON.parse(localStorage.getItem(KEY_TOUR_EVENTS) || '[]');
  let evChanged = false;
  for (const e of evRaw) {
    if (e.season_id == null && byTourFirst[e.tour_id]) {
      e.season_id = byTourFirst[e.tour_id];
      evChanged = true;
    }
  }
  if (evChanged) localStorage.setItem(KEY_TOUR_EVENTS, JSON.stringify(evRaw));
}

function sortTourEventsGloballyForTour(events, tourId) {
  ensureTourSeasonsWeb();
  const seasons = loadTourSeasons().filter((s) => s.tour_id === tourId).sort((a, b) => a.sort_order - b.sort_order);
  return events
    .filter((e) => e.tour_id === tourId)
    .sort((a, b) => {
      const sa = seasons.find((x) => x.id === a.season_id);
      const sb = seasons.find((x) => x.id === b.season_id);
      const oa = sa ? sa.sort_order : 0;
      const ob = sb ? sb.sort_order : 0;
      if (oa !== ob) return oa - ob;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
    });
}

function resolveSeasonIdForNewEventWeb(tourId) {
  ensureTourSeasonsWeb();
  let all = loadTourSeasons();
  let seasons = all.filter((s) => s.tour_id === tourId).sort((a, b) => a.sort_order - b.sort_order);
  if (seasons.length === 0) {
    const id = all.length ? Math.max(...all.map((s) => s.id), 0) + 1 : 1;
    const row = { id, tour_id: tourId, sort_order: 0, name: 'Season 1', created_at: new Date().toISOString() };
    all.push(row);
    saveTourSeasons(all);
    return id;
  }
  const evList = loadTourEvents();
  for (const s of seasons) {
    const evs = evList.filter((e) => e.season_id === s.id);
    if (evs.length === 0 || evs.some((e) => e.status !== 'complete')) {
      return s.id;
    }
  }
  const last = seasons[seasons.length - 1];
  const id = all.length ? Math.max(...all.map((s) => s.id), 0) + 1 : 1;
  all.push({
    id,
    tour_id: tourId,
    sort_order: last.sort_order + 1,
    name: `Season ${last.sort_order + 2}`,
    created_at: new Date().toISOString(),
  });
  saveTourSeasons(all);
  return id;
}

function cloneSeasonEventsFromTemplateWeb(tourId, templateEvs, targetSeasonId) {
  let evList = loadTourEvents();
  let maxEid = evList.length ? Math.max(...evList.map((e) => e.id), 0) : 0;
  for (const src of templateEvs) {
    maxEid += 1;
    evList.push({
      id: maxEid,
      tour_id: tourId,
      season_id: targetSeasonId,
      name: src.name,
      event_type: src.event_type,
      winner_points: src.winner_points,
      finalist_points: src.finalist_points,
      linked_tournament_id: null,
      status: 'scheduled',
      completed_at: null,
      sort_order: src.sort_order,
      scheduled_date: src.scheduled_date,
      calendar_color: src.calendar_color,
      draw_size: src.draw_size,
      match_mode: src.match_mode,
      created_at: new Date().toISOString(),
    });
  }
  saveTourEvents(evList);
}

function ensureTourSeasonRolloverWeb(tourId) {
  ensureTourSeasonsWeb();
  let all = loadTourSeasons();
  const seasons = all.filter((s) => s.tour_id === tourId).sort((a, b) => a.sort_order - b.sort_order);
  if (seasons.length === 0) return;

  for (let i = 0; i < seasons.length; i++) {
    const s = seasons[i];
    const evs = loadTourEvents()
      .filter((e) => e.season_id === s.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    if (evs.length === 0) continue;
    if (!evs.every((e) => e.status === 'complete')) continue;

    const nextSeason = seasons[i + 1];
    if (nextSeason) {
      const nextCnt = loadTourEvents().filter((e) => e.season_id === nextSeason.id).length;
      if (nextCnt > 0) continue;
      cloneSeasonEventsFromTemplateWeb(tourId, evs, nextSeason.id);
      return;
    }
    const id = all.length ? Math.max(...all.map((x) => x.id), 0) + 1 : 1;
    all.push({
      id,
      tour_id: tourId,
      sort_order: s.sort_order + 1,
      name: `Season ${s.sort_order + 2}`,
      created_at: new Date().toISOString(),
    });
    saveTourSeasons(all);
    cloneSeasonEventsFromTemplateWeb(tourId, evs, id);
    return;
  }
}

async function awardTourPointsIfKnockoutCompleteWeb(tournamentId) {
  const tournaments = loadTournaments();
  const t = tournaments.find((x) => x.id === tournamentId);
  if (!t || t.status !== 'complete' || t.format === 'round_robin') return;
  const events = loadTourEvents();
  const ev = events.find((e) => e.linked_tournament_id === tournamentId);
  if (!ev) return;
  const entries = loadTourPointEntries();
  if (entries.some((e) => e.tour_event_id === ev.id)) return;
  const matches = loadTournamentMatches().filter((m) => m.tournament_id === tournamentId);
  if (!matches.length) return;
  const maxR = Math.max(...matches.map((m) => m.round));
  const final = matches.find((m) => m.round === maxR && m.match_index_in_round === 0);
  const bronze = matches.find((m) => m.round === maxR && m.match_index_in_round === 1);
  if (!final?.winner_participant_id) return;
  if (bronze && !bronze.winner_participant_id) return;
  const winnerPid = final.winner_participant_id;
  const loserPid =
    final.player1_participant_id === winnerPid ? final.player2_participant_id : final.player1_participant_id;
  const parts = loadTournamentParticipants();
  const winPart = parts.find((p) => p.id === winnerPid);
  const losePart = parts.find((p) => p.id === loserPid);
  const winnerPlayerId = winPart?.player_id;
  const finalistPlayerId = losePart?.player_id;
  if (winnerPlayerId == null || finalistPlayerId == null) return;
  const earnedAt = new Date().toISOString().slice(0, 10);
  let maxEid = entries.length ? Math.max(...entries.map((e) => e.id)) : 0;
  const toPush = [
    { id: ++maxEid, tour_id: ev.tour_id, tour_event_id: ev.id, player_id: winnerPlayerId, points: ev.winner_points, role: 'winner', earned_at: earnedAt },
    { id: ++maxEid, tour_id: ev.tour_id, tour_event_id: ev.id, player_id: finalistPlayerId, points: ev.finalist_points, role: 'finalist', earned_at: earnedAt },
  ];
  if (bronze?.winner_participant_id) {
    const thirdPart = parts.find((p) => p.id === bronze.winner_participant_id);
    const thirdPlayerId = thirdPart?.player_id;
    if (thirdPlayerId != null) {
      toPush.push({
        id: ++maxEid,
        tour_id: ev.tour_id,
        tour_event_id: ev.id,
        player_id: thirdPlayerId,
        points: (ev.finalist_points ?? 0) / 2,
        role: 'third',
        earned_at: earnedAt,
      });
    }
  }
  entries.push(...toPush);
  saveTourPointEntries(entries);
  ev.status = 'complete';
  ev.completed_at = earnedAt;
  saveTourEvents(events);
}

function tryFinalizeKnockoutTournamentWeb(tournamentId) {
  const tournaments = loadTournaments();
  const t = tournaments.find((x) => x.id === tournamentId);
  if (!t || t.format === 'round_robin') return;
  const drawSize = t.draw_size ?? 8;
  const matches = loadTournamentMatches().filter((m) => m.tournament_id === tournamentId);
  if (!matches.length) return;
  const maxR = Math.max(...matches.map((m) => m.round));
  const finalM = matches.find((m) => m.round === maxR && m.match_index_in_round === 0);
  const bronzeM = matches.find((m) => m.round === maxR && m.match_index_in_round === 1);
  if (!finalM?.winner_participant_id) return;
  if (drawSize >= 4 && bronzeM && !bronzeM.winner_participant_id) return;
  t.status = 'complete';
  saveTournaments(tournaments);
  awardTourPointsIfKnockoutCompleteWeb(tournamentId);
}

export async function setTournamentMatchWinner(tournamentMatchId, winnerParticipantId, details = {}) {
  let all = loadTournamentMatches();
  const row = all.find((m) => m.id === tournamentMatchId);
  if (!row) return;
  row.winner_participant_id = winnerParticipantId;
  if (details.score != null && details.score !== '') row.score = String(details.score).trim();
  if (details.match_date != null && details.match_date !== '') row.match_date = String(details.match_date).trim();
  if (details.remarks != null && details.remarks !== '') row.remarks = String(details.remarks).trim();
  saveTournamentMatches(all);
  all = loadTournamentMatches();
  const row2 = all.find((m) => m.id === tournamentMatchId);
  if (!row2) return;
  const roundN = Number(row2.round);
  const idxN = Number(row2.match_index_in_round);
  const rSafe = Number.isFinite(roundN) ? roundN : 0;
  const iSafe = Number.isFinite(idxN) ? idxN : 0;
  const tournament = loadTournaments().find((t) => t.id === row2.tournament_id);
  if (tournament?.format === 'round_robin') return;
  const drawSize = tournament?.draw_size ?? 8;
  const tid = row2.tournament_id;
  const tourMatches = all.filter((m) => m.tournament_id === tid);
  const maxR = Math.max(0, ...tourMatches.map((m) => Number(m.round) || 0));
  const hasBronze = drawSize >= 4 && tourMatches.some((m) => Number(m.round) === maxR && Number(m.match_index_in_round) === 1);
  const semiRound = maxR >= 1 ? maxR - 1 : -1;
  if (hasBronze && semiRound >= 0 && rSafe === semiRound) {
    const loserPid =
      row2.player1_participant_id === winnerParticipantId
        ? row2.player2_participant_id
        : row2.player1_participant_id;
    const bronzeMatch = all.find(
      (m) => m.tournament_id === tid && Number(m.round) === maxR && Number(m.match_index_in_round) === 1
    );
    if (bronzeMatch && loserPid != null) {
      if (iSafe === 0) bronzeMatch.player1_participant_id = loserPid;
      else bronzeMatch.player2_participant_id = loserPid;
      saveTournamentMatches(all);
    }
  }
  all = loadTournamentMatches();
  const nextRound = rSafe + 1;
  const nextMatchIndex = Math.floor(iSafe / 2);
  const slot = iSafe % 2;
  const nextMatch = all.find(
    (m) =>
      m.tournament_id === tid &&
      Number(m.round) === nextRound &&
      Number(m.match_index_in_round) === nextMatchIndex
  );
  if (!nextMatch) {
    tryFinalizeKnockoutTournamentWeb(tid);
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

// --- Tours (same API as database.native.js) ---
export const TOUR_EVENT_TYPES = {
  '200': { winnerPoints: 200, finalistPoints: 100, label: 'Tour 200', matchSetTarget: 4 },
  grandslam: { winnerPoints: 400, finalistPoints: 200, label: 'Grand Slam', matchSetTarget: 6 },
  tourfinals: { winnerPoints: 200, finalistPoints: 0, label: 'Tour Finals', drawSize: 2, matchSetTarget: 6, matchSetsToWin: 2 },
};

function normalizeTourEventType(value) {
  return value === 'grandslam' || value === 'tourfinals' ? value : '200';
}

function getTourEventPreset(value) {
  return TOUR_EVENT_TYPES[normalizeTourEventType(value)] ?? TOUR_EVENT_TYPES['200'];
}

export async function getAllTours() {
  const evs = loadTourEvents();
  return loadTours()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map((t) => ({
      ...t,
      event_count: evs.filter((e) => e.tour_id === t.id).length,
    }));
}

export async function getTourById(tourId) {
  return loadTours().find((t) => t.id === tourId) ?? null;
}

export async function createTour(name, opts = {}) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Tour name is required');
  const sched = Array.isArray(opts.scheduledEvents) ? opts.scheduledEvents : [];
  const schedCount = sched.filter((row) => (row.name || '').trim()).length;
  const rolling_weeks = Math.max(1, schedCount > 0 ? schedCount : parseInt(opts.rollingWeeks, 10) || 4);
  const list = loadTours();
  const id = list.length ? Math.max(...list.map((t) => t.id)) + 1 : 1;
  list.push({
    id,
    name: trimmed,
    description: (opts.description || '').trim() || null,
    symbol_image: (opts.symbolImage || '').trim() || null,
    season_start_date: (opts.seasonStartDate || '').trim() || null,
    rolling_weeks,
    created_at: new Date().toISOString(),
  });
  saveTours(list);
  const allSeasons = loadTourSeasons();
  const sid = allSeasons.length ? Math.max(...allSeasons.map((s) => s.id), 0) + 1 : 1;
  allSeasons.push({
    id: sid,
    tour_id: id,
    sort_order: 0,
    name: 'Season 1',
    created_at: new Date().toISOString(),
  });
  saveTourSeasons(allSeasons);
  const anchorStr = (opts.scheduleStartDate || '').trim().slice(0, 10) || toDateStr(new Date());
  const anchorDate = parseDateStr(anchorStr) || new Date();
  const weekStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  let evList = loadTourEvents();
  let maxEid = evList.length ? Math.max(...evList.map((e) => e.id)) : 0;
  let eventIndex = 0;
  sched.forEach((row) => {
    const ename = (row.name || '').trim();
    if (!ename) return;
    const etype = normalizeTourEventType(row.eventType);
    const preset = getTourEventPreset(etype);
    const wp = preset.winnerPoints;
    maxEid += 1;
    const scheduled_date = toDateStr(addDays(weekStart, eventIndex * 7));
    const calendar_color = TOUR_CALENDAR_COLORS[eventIndex % TOUR_CALENDAR_COLORS.length];
    const draw_size = etype === 'tourfinals' ? 2 : normalizeTourEventDrawSize(row.drawSize);
    const match_mode = row.matchMode === 'random' && etype !== 'tourfinals' ? 'random' : 'seeds';
    evList.push({
      id: maxEid,
      tour_id: id,
      season_id: sid,
      name: ename,
      event_type: etype,
      winner_points: wp,
      finalist_points: preset.finalistPoints ?? wp / 2,
      linked_tournament_id: null,
      status: 'scheduled',
      completed_at: null,
      sort_order: eventIndex,
      scheduled_date,
      calendar_color,
      draw_size,
      match_mode,
      created_at: new Date().toISOString(),
    });
    eventIndex += 1;
  });
  saveTourEvents(evList);
  return id;
}

/** Add one scheduled tour event (no bracket yet). */
export async function addScheduledTourEvent(tourId, opts = {}) {
  const tour = await getTourById(tourId);
  if (!tour) throw new Error('Tour not found');
  const trimmed = (opts.name || '').trim();
  if (!trimmed) throw new Error('Event name is required');
  const etype = normalizeTourEventType(opts.eventType);
  const preset = getTourEventPreset(etype);
  const wp = preset.winnerPoints;
  const draw_size = etype === 'tourfinals' ? 2 : normalizeTourEventDrawSize(opts.drawSize);
  const match_mode = opts.matchMode === 'random' && etype !== 'tourfinals' ? 'random' : 'seeds';

  const seasonId = resolveSeasonIdForNewEventWeb(tourId);
  let evList = loadTourEvents();
  const sameSeason = evList.filter((e) => e.tour_id === tourId && e.season_id === seasonId);
  const sortOrder = sameSeason.reduce((m, e) => Math.max(m, e.sort_order ?? 0), -1) + 1;

  const rawOpt = (opts.scheduledDate || '').trim().slice(0, 10);
  let scheduled_date;
  if (rawOpt.length >= 10 && parseDateStr(rawOpt)) {
    scheduled_date = rawOpt;
  } else {
    const withDates = sameSeason
      .filter((e) => e.scheduled_date && String(e.scheduled_date).length >= 10)
      .sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
    const last = withDates[0];
    if (last?.scheduled_date) {
      const pd = parseDateStr(last.scheduled_date);
      scheduled_date = pd ? toDateStr(addDays(pd, 7)) : toDateStr(new Date());
    } else {
      const anchor = (opts.scheduleStartDate || '').trim().slice(0, 10);
      scheduled_date = parseDateStr(anchor) ? anchor : toDateStr(new Date());
    }
  }

  const calendar_color = TOUR_CALENDAR_COLORS[sortOrder % TOUR_CALENDAR_COLORS.length];
  const id = evList.length ? Math.max(...evList.map((e) => e.id)) + 1 : 1;
  evList.push({
    id,
    tour_id: tourId,
    season_id: seasonId,
    name: trimmed,
    event_type: etype,
    winner_points: wp,
    finalist_points: preset.finalistPoints ?? wp / 2,
    linked_tournament_id: null,
    status: 'scheduled',
    completed_at: null,
    sort_order: sortOrder,
    scheduled_date,
    calendar_color,
    draw_size,
    match_mode,
    created_at: new Date().toISOString(),
  });
  saveTourEvents(evList);
  return id;
}

export async function updateTour(tourId, updates = {}) {
  const list = loadTours();
  const t = list.find((x) => x.id === tourId);
  if (!t) return;
  if (updates.name !== undefined) t.name = String(updates.name).trim();
  if (updates.description !== undefined) t.description = (updates.description || '').trim() || null;
  if (updates.symbolImage !== undefined) t.symbol_image = (updates.symbolImage || '').trim() || null;
  if (updates.seasonStartDate !== undefined) t.season_start_date = (updates.seasonStartDate || '').trim() || null;
  if (updates.rollingWeeks !== undefined) t.rolling_weeks = Math.max(1, parseInt(updates.rollingWeeks, 10) || 4);
  saveTours(list);
}

export async function deleteTour(tourId) {
  const events = loadTourEvents().filter((e) => e.tour_id === tourId);
  for (const ev of events) {
    if (ev.linked_tournament_id) {
      await deleteTournament(ev.linked_tournament_id);
    }
  }
  saveTourEvents(loadTourEvents().filter((e) => e.tour_id !== tourId));
  saveTourParticipants(loadTourParticipants().filter((p) => p.tour_id !== tourId));
  saveTourPointEntries(loadTourPointEntries().filter((e) => e.tour_id !== tourId));
  saveTourSeasons(loadTourSeasons().filter((s) => s.tour_id !== tourId));
  saveTours(loadTours().filter((t) => t.id !== tourId));
}

export async function getTourParticipants(tourId) {
  const players = loadPlayers();
  return loadTourParticipants()
    .filter((p) => p.tour_id === tourId)
    .map((tp) => ({
      ...tp,
      player_name: players.find((pl) => pl.id === tp.player_id)?.name ?? 'Unknown',
    }))
    .sort((a, b) => (a.player_name || '').localeCompare(b.player_name || ''));
}

export async function addTourParticipant(tourId, playerId) {
  const all = loadTourParticipants();
  if (all.some((p) => p.tour_id === tourId && p.player_id === playerId)) return;
  const id = all.length ? Math.max(...all.map((p) => p.id)) + 1 : 1;
  all.push({ id, tour_id: tourId, player_id: playerId });
  saveTourParticipants(all);
}

export async function removeTourParticipant(tourId, playerId) {
  saveTourParticipants(loadTourParticipants().filter((p) => !(p.tour_id === tourId && p.player_id === playerId)));
}

export async function updateTourEvent(tourEventId, updates = {}) {
  const evList = loadTourEvents();
  const ev = evList.find((e) => e.id === tourEventId);
  if (!ev) return;
  if (updates.scheduledDate !== undefined) {
    const raw = (updates.scheduledDate || '').trim();
    ev.scheduled_date = raw.length >= 10 ? raw.slice(0, 10) : null;
  }
  if (updates.calendarColor !== undefined) {
    const c = (updates.calendarColor || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) ev.calendar_color = c;
  }
  saveTourEvents(evList);
}

export async function startTourEventBracket(tourEventId, { drawSize: drawSizeOverride, participantPlayerIds } = {}) {
  const evList = loadTourEvents();
  const ev = evList.find((e) => e.id === tourEventId);
  if (!ev) throw new Error('Event not found');
  if (ev.linked_tournament_id) {
    return { tourEventId: tourEventId, tournamentId: ev.linked_tournament_id, alreadyStarted: true };
  }
  const eventsInScheduleOrder = evList
    .filter((e) =>
      ev.season_id != null ? e.season_id === ev.season_id : e.tour_id === ev.tour_id
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  const idx = eventsInScheduleOrder.findIndex((e) => e.id === tourEventId);
  if (idx > 0) {
    for (let i = 0; i < idx; i++) {
      if (eventsInScheduleOrder[i].status !== 'complete') {
        throw new Error('Finish earlier tournaments in schedule order before starting this one.');
      }
    }
  }
  const tour = await getTourById(ev.tour_id);
  if (!tour) throw new Error('Tour not found');
  const etype = normalizeTourEventType(ev.event_type);
  const preset = getTourEventPreset(etype);
  const rankings = await getTourRankings(ev.tour_id);
  const rankOrder = rankings.map((r) => r.player_id);
  const tourPlayerIds = new Set(loadTourParticipants().filter((p) => p.tour_id === ev.tour_id).map((p) => p.player_id));
  let selectedPlayerIds;
  if (etype === 'tourfinals') {
    selectedPlayerIds = rankOrder.slice(0, 2);
  } else if (Array.isArray(participantPlayerIds) && participantPlayerIds.length > 0) {
    const seen = new Set();
    selectedPlayerIds = participantPlayerIds
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && tourPlayerIds.has(id) && !seen.has(id) && seen.add(id));
  } else {
    selectedPlayerIds = rankOrder.slice(0, normalizeTourEventDrawSize(drawSizeOverride ?? ev.draw_size ?? 8));
  }
  const size = etype === 'tourfinals' ? 2 : normalizeTourEventDrawSize(drawSizeOverride ?? selectedPlayerIds.length ?? ev.draw_size ?? 8);
  if (!isValidDrawSize(size)) throw new Error('Draw size must be 2, 4, 8, 16, 32, or 64');
  if (selectedPlayerIds.length !== size) {
    throw new Error(
      etype === 'tourfinals'
        ? 'Tour Finals needs the top two ranked tour players.'
        : `Select exactly ${size} players for this ${size}-player draw.`
    );
  }

  const tid = await createTournament(`${tour.name} — ${ev.name}`, size, {
    matchSetTarget: preset.matchSetTarget,
    matchSetsToWin: preset.matchSetsToWin,
  });
  ev.linked_tournament_id = tid;
  ev.status = 'ongoing';
  saveTourEvents(evList);

  const nameByPlayerId = Object.fromEntries(rankings.map((r) => [r.player_id, r.player_name]));
  const rankIndex = Object.fromEntries(rankOrder.map((id, idx) => [id, idx]));
  const selectedBySeed = selectedPlayerIds
    .slice()
    .sort((a, b) => (rankIndex[a] ?? 999999) - (rankIndex[b] ?? 999999));
  const tpIds = [];
  for (let s = 0; s < size; s++) {
    const pid = selectedBySeed[s];
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

export async function createTourEvent(tourId, { name, eventType = '200', winnerPoints, drawSize = 8 }) {
  const tour = await getTourById(tourId);
  if (!tour) throw new Error('Tour not found');
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Event name is required');
  const etype = normalizeTourEventType(eventType);
  const preset = getTourEventPreset(etype);
  let wp = parseFloat(winnerPoints);
  if (!Number.isFinite(wp) || wp <= 0) {
    wp = preset ? preset.winnerPoints : 200;
  }
  const fp = preset.finalistPoints ?? wp / 2;
  const size = etype === 'tourfinals' ? 2 : (parseInt(drawSize, 10) || 8);
  const tName = `${tour.name} — ${trimmed}`;
  const tid = await createTournament(tName, size, {
    matchSetTarget: preset.matchSetTarget,
    matchSetsToWin: preset.matchSetsToWin,
  });
  const evList = loadTourEvents();
  const seasonId = resolveSeasonIdForNewEventWeb(tourId);
  const sameSeason = evList.filter((e) => e.tour_id === tourId && e.season_id === seasonId);
  const maxOrder = sameSeason.reduce((m, e) => Math.max(m, e.sort_order ?? 0), -1);
  const sortOrder = maxOrder + 1;
  const lastScheduled = sameSeason
    .filter((e) => e.scheduled_date && String(e.scheduled_date).length >= 10)
    .sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))[0];
  let scheduled_date = toDateStr(new Date());
  if (lastScheduled?.scheduled_date) {
    const pd = parseDateStr(lastScheduled.scheduled_date);
    if (pd) scheduled_date = toDateStr(addDays(pd, 7));
  }
  const calendar_color = TOUR_CALENDAR_COLORS[sortOrder % TOUR_CALENDAR_COLORS.length];
  const id = evList.length ? Math.max(...evList.map((e) => e.id)) + 1 : 1;
  evList.push({
    id,
    tour_id: tourId,
    season_id: seasonId,
    name: trimmed,
    event_type: etype,
    winner_points: wp,
    finalist_points: fp,
    linked_tournament_id: tid,
    status: 'ongoing',
    completed_at: null,
    sort_order: sortOrder,
    scheduled_date,
    calendar_color,
    draw_size: size,
    match_mode: 'seeds',
    created_at: new Date().toISOString(),
  });
  saveTourEvents(evList);
  return { tourEventId: id, tournamentId: tid };
}

export async function getTourSeasons(tourId) {
  ensureTourSeasonsWeb();
  return loadTourSeasons().filter((s) => s.tour_id === tourId).sort((a, b) => a.sort_order - b.sort_order);
}

export async function getTourEvents(tourId) {
  ensureTourSeasonsWeb();
  const tourn = loadTournaments();
  const byId = Object.fromEntries(loadTourSeasons().map((s) => [s.id, s]));
  const list = sortTourEventsGloballyForTour(loadTourEvents(), tourId);
  return list.map((e) => {
    const t = tourn.find((x) => x.id === e.linked_tournament_id);
    const s = e.season_id != null ? byId[e.season_id] : null;
    return {
      ...e,
      bracket_name: t?.name,
      bracket_status: t?.status,
      season_sort_order: s?.sort_order,
      season_name: s?.name,
    };
  });
}

export async function getTourRollingWindowSize(tourId) {
  ensureTourSeasonsWeb();
  const tour = await getTourById(tourId);
  if (!tour) return 1;
  const seasons = loadTourSeasons().filter((s) => s.tour_id === tourId);
  if (!seasons.length) return Math.max(1, parseInt(tour.rolling_weeks, 10) || 4);
  const minSo = Math.min(...seasons.map((s) => s.sort_order));
  const first = seasons.find((s) => s.sort_order === minSo);
  if (!first) return Math.max(1, parseInt(tour.rolling_weeks, 10) || 4);
  const c = loadTourEvents().filter((e) => e.tour_id === tourId && e.season_id === first.id).length;
  if (c > 0) return c;
  return Math.max(1, parseInt(tour.rolling_weeks, 10) || 4);
}

export async function getTourEventPodiumsForTour(tourId) {
  const players = loadPlayers();
  const byId = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const map = {};
  for (const r of loadTourPointEntries().filter((e) => e.tour_id === tourId)) {
    if (r.role !== 'winner' && r.role !== 'finalist' && r.role !== 'third') continue;
    if (!map[r.tour_event_id]) map[r.tour_event_id] = {};
    map[r.tour_event_id][r.role] = byId[r.player_id] ?? 'Unknown';
  }
  return map;
}

export async function getTourRankings(tourId) {
  const tour = await getTourById(tourId);
  if (!tour) return [];
  const allEv = sortTourEventsGloballyForTour(loadTourEvents(), tourId);
  const n = await getTourRollingWindowSize(tourId);
  const completed = allEv.filter((e) => e.status === 'complete');
  const windowEvents = completed.slice(-n);
  const eventIdSet = new Set(windowEvents.map((e) => e.id));
  const pRows = await getTourParticipants(tourId);
  const entries = loadTourPointEntries().filter(
    (e) => e.tour_id === tourId && eventIdSet.has(e.tour_event_id)
  );
  const byPlayer = {};
  for (const e of entries) {
    byPlayer[e.player_id] = (byPlayer[e.player_id] || 0) + e.points;
  }
  const rows = pRows.map((p) => ({
    player_id: p.player_id,
    player_name: p.player_name,
    total_points: byPlayer[p.player_id] || 0,
  }));
  rows.sort((a, b) => b.total_points - a.total_points || (a.player_name || '').localeCompare(b.player_name || ''));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function getTourRollingPointsSparkline(tourId) {
  const allEv = sortTourEventsGloballyForTour(loadTourEvents(), tourId);
  const n = await getTourRollingWindowSize(tourId);
  const completedChrono = allEv.filter((e) => e.status === 'complete');
  const windowEv = completedChrono.slice(-n);
  if (windowEv.length === 0) {
    return { labels: [], series: [] };
  }
  const eventIds = new Set(windowEv.map((e) => e.id));
  const allEntries = loadTourPointEntries().filter((e) => e.tour_id === tourId && eventIds.has(e.tour_event_id));
  const byEventPlayer = {};
  for (const r of allEntries) {
    const k = `${r.tour_event_id}:${r.player_id}`;
    byEventPlayer[k] = (byEventPlayer[k] || 0) + r.points;
  }
  const players = await getTourParticipants(tourId);
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
  const map = {};
  for (const e of loadTourPointEntries()) {
    if (e.tour_id !== tourId || e.role !== 'winner') continue;
    map[e.player_id] = (map[e.player_id] || 0) + 1;
  }
  return Object.entries(map).map(([player_id, titles]) => ({ player_id: parseInt(player_id, 10), titles }));
}

export async function getTourWeeksAtNumberOne(tourId) {
  const events = sortTourEventsGloballyForTour(loadTourEvents(), tourId);
  const playerIds = loadTourParticipants().filter((p) => p.tour_id === tourId).map((p) => p.player_id);
  const weeksCount = Object.fromEntries(playerIds.map((id) => [id, 0]));
  if (!playerIds.length) return [];
  const totals = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const allEntries = loadTourPointEntries().filter((e) => e.tour_id === tourId);

  for (const ev of events) {
    const slice = allEntries.filter((e) => e.tour_event_id === ev.id);
    if (!slice.length) continue;
    for (const row of slice) {
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
  const tour = await getTourById(tourId);
  if (!tour) return null;
  const evs = loadTourEvents().filter((e) => e.tour_id === tourId);
  const completed = evs.filter((e) => e.status === 'complete').length;
  const eventCount = evs.length;
  return {
    createdAt: tour.created_at,
    rollingTournamentCount: Math.max(1, eventCount),
    participantCount: loadTourParticipants().filter((p) => p.tour_id === tourId).length,
    eventCount,
    completedEventCount: completed,
  };
}

export async function getTourH2HAcrossEvents(tourId, playerAId, playerBId) {
  let wins = 0;
  let losses = 0;
  for (const ev of loadTourEvents().filter((e) => e.tour_id === tourId && e.linked_tournament_id)) {
    const h = await getTournamentH2H(ev.linked_tournament_id, playerAId, playerBId);
    wins += h.wins;
    losses += h.losses;
  }
  return { wins, losses };
}

export async function getTourPairBracketDetailedStats(tourId, playerAId, playerBId) {
  const events = sortTourEventsGloballyForTour(
    loadTourEvents().filter((e) => e.tour_id === tourId && e.linked_tournament_id),
    tourId
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

export async function getTourFinalsAppearanceCounts(tourId) {
  const counts = {};
  for (const e of loadTourPointEntries()) {
    if (e.tour_id !== tourId) continue;
    if (e.role !== 'winner' && e.role !== 'finalist') continue;
    counts[e.player_id] = (counts[e.player_id] || 0) + 1;
  }
  const players = loadPlayers();
  return Object.entries(counts)
    .map(([id, finals]) => ({
      player_id: parseInt(id, 10),
      player_name: players.find((p) => p.id === parseInt(id, 10))?.name ?? 'Unknown',
      finals,
    }))
    .sort((a, b) => b.finals - a.finals || (a.player_name || '').localeCompare(b.player_name || ''));
}

export async function getTourClosestH2HPair(tourId) {
  const players = await getTourParticipants(tourId);
  if (players.length < 2) return null;
  let best = null;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const h = await getTourH2HAcrossEvents(tourId, players[i].player_id, players[j].player_id);
      const played = h.wins + h.losses;
      if (played === 0) continue;
      const diff = Math.abs(h.wins - h.losses);
      if (!best || diff < best.diff || (diff === best.diff && played > best.played)) {
        best = {
          player_a_id: players[i].player_id,
          player_b_id: players[j].player_id,
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

export async function getTourCareerOpenCompleters(tourId) {
  const events = sortTourEventsGloballyForTour(
    loadTourEvents().filter((e) => e.tour_id === tourId && e.status === 'complete' && e.linked_tournament_id),
    tourId
  );
  if (!events.length) return { totalEvents: 0, completers: [] };
  const participants = loadTourParticipants().filter((p) => p.tour_id === tourId);
  const completers = [];
  for (const p of participants) {
    let n = 0;
    for (const ev of events) {
      const parts = loadTournamentParticipants().filter((tp) => tp.tournament_id === ev.linked_tournament_id);
      if (parts.some((tp) => tp.player_id === p.player_id)) n++;
    }
    if (n === events.length) completers.push({ player_id: p.player_id, player_name: p.player_name });
  }
  return { totalEvents: events.length, completers };
}

export async function getTourWithDetails(tourId) {
  ensureTourSeasonRolloverWeb(tourId);
  const [tour, participants, events, seasons] = await Promise.all([
    getTourById(tourId),
    getTourParticipants(tourId),
    getTourEvents(tourId),
    getTourSeasons(tourId),
  ]);
  if (!tour) return null;
  return { tour, participants, events, seasons };
}
