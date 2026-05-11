/**
 * Tennis set scoring: games 0–7; 7-6/6-7 require tiebreak.
 * Completed set = valid score with clear winner (and tiebreak if 7-6/6-7).
 * Incomplete set = not a finished set (e.g. 3-2), not counted in W/L.
 */

function normalizeSetGameTarget(options = {}) {
  const raw = typeof options === 'number' ? options : options.setGameTarget;
  const target = parseInt(raw, 10);
  return target === 4 ? 4 : 6;
}

function normalizeSetsToWin(options = {}) {
  const raw = typeof options === 'object' ? options.setsToWin : null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Games in a set must fit the selected set format. */
export function gamesInValidRange(g1, g2, options = {}) {
  const a = Number(g1);
  const b = Number(g2);
  const target = normalizeSetGameTarget(options);
  const maxGames = target === 4 ? 4 : 7;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  return a >= 0 && a <= maxGames && b >= 0 && b <= maxGames;
}

/** Tiebreak: one player >= 7 and leading by at least 2. (internal) */
function isTiebreakValid(tb1, tb2) {
  const a = Number(tb1);
  const b = Number(tb2);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  return max >= 7 && max - min >= 2;
}

/** Deciding-game set scores require a tiebreak to be complete. */
export function setNeedsTiebreak(g1, g2, options = {}) {
  const a = Number(g1);
  const b = Number(g2);
  const target = normalizeSetGameTarget(options);
  if (target === 4) return (a === 4 && b === 3) || (a === 3 && b === 4);
  return (a === target + 1 && b === target) || (a === target && b === target + 1);
}

/** Valid completed set scores (without tiebreak): 6-0,6-1,6-2,6-3,6-4,7-5 (and reversed). */
function isCompletedSetNoTiebreak(g1, g2, options = {}) {
  const a = Number(g1);
  const b = Number(g2);
  const target = normalizeSetGameTarget(options);
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  if (target === 4) return max === 4 && min <= 2;
  if (max === target && min <= target - 2) return true;
  if (max === target + 1 && min === target - 1) return true;
  return false;
}

/**
 * True if this set is a complete, valid tennis set (counts for W/L).
 * If 7-6 or 6-7, tiebreak must be provided and valid.
 */
export function isSetComplete(games1, games2, tiebreak1, tiebreak2, options = {}) {
  const g1 = Number(games1);
  const g2 = Number(games2);
  if (!gamesInValidRange(g1, g2, options)) return false;
  if (setNeedsTiebreak(g1, g2, options)) {
    const tb1 = tiebreak1 != null && tiebreak1 !== '' ? Number(tiebreak1) : null;
    const tb2 = tiebreak2 != null && tiebreak2 !== '' ? Number(tiebreak2) : null;
    if (tb1 == null || tb2 == null) return false;
    return isTiebreakValid(tb1, tb2);
  }
  return isCompletedSetNoTiebreak(g1, g2, options);
}

/**
 * Display string for a completed set in matchup order (p1 vs p2), including tiebreak when 7–6 / 6–7.
 */
export function formatSetScoreDisplay(p1Games, p2Games, tiebreakP1, tiebreakP2, options = {}) {
  const a = Number(p1Games);
  const b = Number(p2Games);
  if (setNeedsTiebreak(a, b, options)) {
    const tb1 = tiebreakP1 != null && tiebreakP1 !== '' ? Number(tiebreakP1) : NaN;
    const tb2 = tiebreakP2 != null && tiebreakP2 !== '' ? Number(tiebreakP2) : NaN;
    if (Number.isFinite(tb1) && Number.isFinite(tb2)) {
      return `${a}-${b}(${tb1}-${tb2})`;
    }
  }
  return `${a}-${b}`;
}

/** For UI: can we save this set? Games 0-7 only; if 7-6 or 6-7 need valid tiebreak. Incomplete sets (e.g. 3-2) are allowed. */
export function isSetValidForSave(games1, games2, tiebreak1, tiebreak2, options = {}) {
  const g1 = games1 === '' ? null : parseInt(games1, 10);
  const g2 = games2 === '' ? null : parseInt(games2, 10);
  if (g1 == null || g2 == null || !Number.isInteger(g1) || !Number.isInteger(g2)) return false;
  if (!gamesInValidRange(g1, g2, options)) return false;
  if (setNeedsTiebreak(g1, g2, options)) {
    const tb1 = tiebreak1 === '' ? null : parseInt(tiebreak1, 10);
    const tb2 = tiebreak2 === '' ? null : parseInt(tiebreak2, 10);
    return isTiebreakValid(tb1 ?? 0, tb2 ?? 0);
  }
  return true;
}

/**
 * From set-score form rows, infer winning participant id using only completed tennis sets.
 * Best-of-3 (first to 2 sets) by default; if either side reaches 3 sets won, treated as best-of-5.
 */
/**
 * Parse a bracket score string (sets joined by " - ") into totals. Left = player1 column in the form.
 * Handles "WO", tiebreak notation, and optional trailing " (ret.)".
 */
export function parseTournamentScoreAggregateFromBracketString(scoreStr) {
  if (!scoreStr || typeof scoreStr !== 'string') {
    return { setsLeft: 0, setsRight: 0, gamesLeft: 0, gamesRight: 0 };
  }
  const clean = scoreStr.replace(/\s*\(ret\.?\)\s*$/i, '').trim();
  if (/^wo$/i.test(clean) || /^walkover$/i.test(clean)) {
    return { setsLeft: 0, setsRight: 0, gamesLeft: 0, gamesRight: 0 };
  }
  const parts = clean.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  let setsLeft = 0;
  let setsRight = 0;
  let gamesLeft = 0;
  let gamesRight = 0;
  for (const part of parts) {
    const tiebreakMatch = part.match(/^(\d+)-(\d+)\s*\((\d+)-(\d+)\)\s*$/);
    const gamesMatch = part.match(/^(\d+)-(\d+)\s*$/);
    let g1;
    let g2;
    let tb1;
    let tb2;
    if (tiebreakMatch) {
      g1 = Number(tiebreakMatch[1]);
      g2 = Number(tiebreakMatch[2]);
      tb1 = tiebreakMatch[3];
      tb2 = tiebreakMatch[4];
    } else if (gamesMatch) {
      g1 = Number(gamesMatch[1]);
      g2 = Number(gamesMatch[2]);
      tb1 = '';
      tb2 = '';
    } else {
      continue;
    }
    gamesLeft += g1;
    gamesRight += g2;
    if (isSetComplete(g1, g2, tb1, tb2) || isSetComplete(g1, g2, tb1, tb2, { setGameTarget: 4 })) {
      if (g1 > g2) setsLeft++;
      else if (g2 > g1) setsRight++;
    }
  }
  return { setsLeft, setsRight, gamesLeft, gamesRight };
}

/**
 * Parsed bracket score segments (left column = player1 in the bracket form).
 * @returns {Array<{ g1: number, g2: number, tb1: string, tb2: string, complete: boolean }>}
 */
export function parseBracketScoreSegments(scoreStr) {
  if (!scoreStr || typeof scoreStr !== 'string') return [];
  const clean = scoreStr.replace(/\s*\(ret\.?\)\s*$/i, '').trim();
  if (/^wo$/i.test(clean) || /^walkover$/i.test(clean)) return [];
  if (/^retired$/i.test(clean)) return [];
  const parts = clean.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const tiebreakMatch = part.match(/^(\d+)-(\d+)\s*\((\d+)-(\d+)\)\s*$/);
    const gamesMatch = part.match(/^(\d+)-(\d+)\s*$/);
    let g1;
    let g2;
    let tb1;
    let tb2;
    if (tiebreakMatch) {
      g1 = Number(tiebreakMatch[1]);
      g2 = Number(tiebreakMatch[2]);
      tb1 = tiebreakMatch[3];
      tb2 = tiebreakMatch[4];
    } else if (gamesMatch) {
      g1 = Number(gamesMatch[1]);
      g2 = Number(gamesMatch[2]);
      tb1 = '';
      tb2 = '';
    } else {
      continue;
    }
    const complete = isSetComplete(g1, g2, tb1, tb2) || isSetComplete(g1, g2, tb1, tb2, { setGameTarget: 4 });
    out.push({ g1, g2, tb1, tb2, complete });
  }
  return out;
}

/**
 * Tour-only bracket H2H between two players (first player = "player 1" in returned stats).
 * @param {Array<{ score: string, aIsPlayer1: boolean, winnerIsA: boolean, isFinalMeeting: boolean }>} meetings chronological
 */
export function computeTourBracketPairDetailedStats(meetings) {
  const base = {
    wins: 0,
    losses: 0,
    bracketMeetings: 0,
    metInFinalsCount: 0,
    totalSetsPlayed: 0,
    incompleteSets: 0,
    setsPlayer1: 0,
    setsPlayer2: 0,
    totalGamesPlayed: 0,
    gamesPlayer1: 0,
    gamesPlayer2: 0,
    tieBreaksPlayed: 0,
    closestSet: null,
    easiestSet: null,
    averageSetScore: null,
    setWinPctPlayer1: 0,
    setWinPctPlayer2: 0,
    avgWinMarginPlayer1: null,
    avgWinMarginPlayer2: null,
    currentWinStreakPlayer1: 0,
    currentWinStreakPlayer2: 0,
    bestWinStreakPlayer1: 0,
    bestWinStreakPlayer2: 0,
    bagelsServedPlayer1: 0,
    bagelsServedPlayer2: 0,
    breadsticksServedPlayer1: 0,
    breadsticksServedPlayer2: 0,
  };

  if (!meetings?.length) return base;

  let wins = 0;
  let losses = 0;
  let metInFinalsCount = 0;
  let totalSetsPlayed = 0;
  let incompleteSets = 0;
  let setsPlayer1 = 0;
  let setsPlayer2 = 0;
  let gamesPlayer1 = 0;
  let gamesPlayer2 = 0;
  let tieBreaksPlayed = 0;
  let closestSet = null;
  let easiestSet = null;
  let marginSumP1 = 0;
  let marginSumP2 = 0;
  let setsWonCountP1 = 0;
  let setsWonCountP2 = 0;
  let bagelsServedPlayer1 = 0;
  let bagelsServedPlayer2 = 0;
  let breadsticksServedPlayer1 = 0;
  let breadsticksServedPlayer2 = 0;
  const chronological = [];

  for (const mt of meetings) {
    if (mt.winnerIsA) wins++;
    else losses++;
    if (mt.isFinalMeeting) metInFinalsCount++;

    const segments = parseBracketScoreSegments(mt.score);
    for (const seg of segments) {
      const g1 = seg.g1;
      const g2 = seg.g2;
      const p1Games = mt.aIsPlayer1 ? g1 : g2;
      const p2Games = mt.aIsPlayer1 ? g2 : g1;
      const tbP1 = mt.aIsPlayer1 ? seg.tb1 : seg.tb2;
      const tbP2 = mt.aIsPlayer1 ? seg.tb2 : seg.tb1;

      if (!seg.complete) {
        if (g1 > 0 || g2 > 0) incompleteSets++;
        continue;
      }

      totalSetsPlayed++;
      gamesPlayer1 += p1Games;
      gamesPlayer2 += p2Games;
      const margin = Math.abs(p1Games - p2Games);
      const scoreStr = formatSetScoreDisplay(p1Games, p2Games, tbP1, tbP2, { setGameTarget: seg.g1 <= 4 && seg.g2 <= 4 ? 4 : 6 });
      if ((g1 === 7 && g2 === 6) || (g1 === 6 && g2 === 7)) tieBreaksPlayed++;
      if (p1Games === 6 && p2Games === 0) bagelsServedPlayer1++;
      if (p2Games === 6 && p1Games === 0) bagelsServedPlayer2++;
      if (p1Games === 6 && p2Games === 1) breadsticksServedPlayer1++;
      if (p2Games === 6 && p1Games === 1) breadsticksServedPlayer2++;
      if (!closestSet || margin < closestSet.margin) closestSet = { score: scoreStr, margin };
      if (!easiestSet || margin > easiestSet.margin) easiestSet = { score: scoreStr, margin };

      if (p1Games > p2Games) {
        setsPlayer1++;
        marginSumP1 += p1Games - p2Games;
        setsWonCountP1++;
        chronological.push('p1');
      } else if (p2Games > p1Games) {
        setsPlayer2++;
        marginSumP2 += p2Games - p1Games;
        setsWonCountP2++;
        chronological.push('p2');
      }
    }
  }

  const setWinners = chronological.slice().reverse();
  let currentWinStreakPlayer1 = 0;
  let currentWinStreakPlayer2 = 0;
  for (let i = 0; i < setWinners.length && setWinners[i] === 'p1'; i++) currentWinStreakPlayer1++;
  for (let i = 0; i < setWinners.length && setWinners[i] === 'p2'; i++) currentWinStreakPlayer2++;
  let bestWinStreakPlayer1 = 0;
  let bestWinStreakPlayer2 = 0;
  let run1 = 0;
  let run2 = 0;
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

  const totalGamesPlayed = gamesPlayer1 + gamesPlayer2;
  const avgGamesP1 = totalSetsPlayed ? gamesPlayer1 / totalSetsPlayed : 0;
  const avgGamesP2 = totalSetsPlayed ? gamesPlayer2 / totalSetsPlayed : 0;
  const averageSetScore = totalSetsPlayed ? `${avgGamesP1.toFixed(1)} – ${avgGamesP2.toFixed(1)}` : null;
  const setWinPctPlayer1 = totalSetsPlayed ? (setsPlayer1 / totalSetsPlayed) * 100 : 0;
  const setWinPctPlayer2 = totalSetsPlayed ? (setsPlayer2 / totalSetsPlayed) * 100 : 0;
  const avgWinMarginPlayer1 = setsWonCountP1 ? marginSumP1 / setsWonCountP1 : null;
  const avgWinMarginPlayer2 = setsWonCountP2 ? marginSumP2 / setsWonCountP2 : null;

  return {
    wins,
    losses,
    bracketMeetings: wins + losses,
    metInFinalsCount,
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
    averageSetScore,
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

/**
 * Match winner from completed sets only: single-set match (one complete set decides),
 * best-of-3 (first to 2), best-of-5 (first to 3).
 * Participant ids are normalized with Number() so SQLite/web string vs number never blocks inference.
 */
export function inferMatchWinnerParticipantFromSetRows(resultSets, participantId1, participantId2, options = {}) {
  if (participantId1 == null || participantId2 == null) return null;
  const id1 = Number(participantId1);
  const id2 = Number(participantId2);
  if (!Number.isFinite(id1) || !Number.isFinite(id2)) return null;
  let setsWon1 = 0;
  let setsWon2 = 0;
  for (const row of resultSets) {
    const g1 = row.gamesPlayer1 === '' ? null : parseInt(row.gamesPlayer1, 10);
    const g2 = row.gamesPlayer2 === '' ? null : parseInt(row.gamesPlayer2, 10);
    if (g1 == null || g2 == null || !Number.isInteger(g1) || !Number.isInteger(g2)) continue;
    const tb1 = row.tiebreakPlayer1 === '' ? undefined : row.tiebreakPlayer1;
    const tb2 = row.tiebreakPlayer2 === '' ? undefined : row.tiebreakPlayer2;
    if (!isSetComplete(g1, g2, tb1, tb2, options)) continue;
    if (g1 > g2) setsWon1++;
    else if (g2 > g1) setsWon2++;
  }
  const total = setsWon1 + setsWon2;
  if (total === 0) return null;
  const requiredSets = normalizeSetsToWin(options);
  if (requiredSets != null) {
    if (setsWon1 >= requiredSets) return id1;
    if (setsWon2 >= requiredSets) return id2;
    return null;
  }
  if (total === 1) {
    if (setsWon1 === 1) return id1;
    if (setsWon2 === 1) return id2;
    return null;
  }
  if (setsWon1 >= 3) return id1;
  if (setsWon2 >= 3) return id2;
  if (setsWon1 >= 2 && setsWon1 > setsWon2) return id1;
  if (setsWon2 >= 2 && setsWon2 > setsWon1) return id2;
  return null;
}
