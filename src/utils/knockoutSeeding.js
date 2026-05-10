/**
 * Knockout bracket slot order for single elimination (power-of-2 draws).
 * `seedBracketSlots(n)[slot]` = 0-based seed index (0 = #1 seed) placed at that bracket slot,
 * reading first-round pairs left to right.
 */
export function seedBracketSlots(n) {
  if (n <= 1) return [0];
  if (n === 2) return [0, 1];
  if (n % 2 !== 0) throw new Error('Draw size must be a power of 2');
  const half = n / 2;
  const prev = seedBracketSlots(half);
  const out = [];
  for (let i = 0; i < half; i++) {
    out.push(prev[i]);
    out.push(n - 1 - prev[i]);
  }
  return out;
}

/** `tournamentParticipantIdsBySeed[0]` = #1 seed’s tournament_participants.id, length === drawSize */
export function tournamentDrawFromSeeds(tournamentParticipantIdsBySeed, drawSize) {
  const n = drawSize;
  if (tournamentParticipantIdsBySeed.length !== n) return null;
  const perm = seedBracketSlots(n);
  return perm.map((seedIdx) => tournamentParticipantIdsBySeed[seedIdx]);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
