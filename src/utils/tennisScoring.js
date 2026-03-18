/**
 * Tennis set scoring: games 0–7; 7-6/6-7 require tiebreak.
 * Completed set = valid score with clear winner (and tiebreak if 7-6/6-7).
 * Incomplete set = not a finished set (e.g. 3-2), not counted in W/L.
 */

/** Games in a set must be 0–7. */
export function gamesInValidRange(g1, g2) {
  const a = Number(g1);
  const b = Number(g2);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  return a >= 0 && a <= 7 && b >= 0 && b <= 7;
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

/** Set score 7-6 or 6-7 requires a tiebreak to be complete. */
export function setNeedsTiebreak(g1, g2) {
  const a = Number(g1);
  const b = Number(g2);
  return (a === 7 && b === 6) || (a === 6 && b === 7);
}

/** Valid completed set scores (without tiebreak): 6-0,6-1,6-2,6-3,6-4,7-5 (and reversed). */
const VALID_COMPLETED_NO_TB = [
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5],
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 7],
];

function isCompletedSetNoTiebreak(g1, g2) {
  const a = Number(g1);
  const b = Number(g2);
  return VALID_COMPLETED_NO_TB.some(([x, y]) => x === a && y === b);
}

/**
 * True if this set is a complete, valid tennis set (counts for W/L).
 * If 7-6 or 6-7, tiebreak must be provided and valid.
 */
export function isSetComplete(games1, games2, tiebreak1, tiebreak2) {
  const g1 = Number(games1);
  const g2 = Number(games2);
  if (!gamesInValidRange(g1, g2)) return false;
  if (setNeedsTiebreak(g1, g2)) {
    const tb1 = tiebreak1 != null && tiebreak1 !== '' ? Number(tiebreak1) : null;
    const tb2 = tiebreak2 != null && tiebreak2 !== '' ? Number(tiebreak2) : null;
    if (tb1 == null || tb2 == null) return false;
    return isTiebreakValid(tb1, tb2);
  }
  return isCompletedSetNoTiebreak(g1, g2);
}

/** For UI: can we save this set? Games 0-7 only; if 7-6 or 6-7 need valid tiebreak. Incomplete sets (e.g. 3-2) are allowed. */
export function isSetValidForSave(games1, games2, tiebreak1, tiebreak2) {
  const g1 = games1 === '' ? null : parseInt(games1, 10);
  const g2 = games2 === '' ? null : parseInt(games2, 10);
  if (g1 == null || g2 == null || !Number.isInteger(g1) || !Number.isInteger(g2)) return false;
  if (!gamesInValidRange(g1, g2)) return false;
  if (setNeedsTiebreak(g1, g2)) {
    const tb1 = tiebreak1 === '' ? null : parseInt(tiebreak1, 10);
    const tb2 = tiebreak2 === '' ? null : parseInt(tiebreak2, 10);
    return isTiebreakValid(tb1 ?? 0, tb2 ?? 0);
  }
  return true;
}
