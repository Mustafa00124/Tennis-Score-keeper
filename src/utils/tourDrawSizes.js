/** Power-of-two knockout draws supported by the app (matches DB validation). */
export const KNOCKOUT_DRAW_SIZES = [2, 4, 8, 16, 32, 64];

/** Sizes that fit a tour roster (need at least as many players as the draw). */
export function knockoutDrawSizesAllowed(participantCount) {
  const c = parseInt(participantCount, 10);
  if (!Number.isFinite(c) || c < 2) return [];
  return KNOCKOUT_DRAW_SIZES.filter((n) => n <= c);
}

/** Pick a valid draw size at or below the roster (prefers saved event size if it still fits). */
export function clampDrawSizeToParticipants(preferred, participantCount) {
  const allowed = knockoutDrawSizesAllowed(participantCount);
  if (allowed.length === 0) return null;
  const p = parseInt(preferred, 10) || allowed[allowed.length - 1];
  if (allowed.includes(p)) return p;
  return allowed.filter((n) => n <= p).pop() ?? allowed[allowed.length - 1];
}
