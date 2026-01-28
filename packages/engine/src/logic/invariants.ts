import type { Table } from '../core/types';

export function validateCardInvariants(table: Table): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  // Collect all dealt cards: community + burns + holeCards
  const used: number[] = [];
  if (Array.isArray(table.communityCards)) used.push(...table.communityCards);

  const burns = table.burns || { flop: [], turn: [], river: [] };
  if (Array.isArray(burns.flop)) used.push(...burns.flop);
  if (Array.isArray(burns.turn)) used.push(...burns.turn);
  if (Array.isArray(burns.river)) used.push(...burns.river);

  table.seats.forEach((seat) => {
    if (seat?.holeCards && Array.isArray(seat.holeCards)) used.push(...seat.holeCards);
  });

  // Check numeric bounds
  const outOfBounds = used.filter((c) => c < 0 || c > 51);
  if (outOfBounds.length > 0) {
    errors.push(`Out-of-bounds card codes: ${Array.from(new Set(outOfBounds)).join(', ')}`);
  }

  // Check duplicates
  const seen = new Set<number>();
  const dupes: number[] = [];
  for (const c of used) {
    if (seen.has(c)) dupes.push(c);
    else seen.add(c);
  }
  if (dupes.length > 0) {
    errors.push(`Duplicate card codes detected: ${Array.from(new Set(dupes)).join(', ')}`);
  }

  // Check deckIndex bounds
  const idx = table.deckIndex || 0;
  const deckLen = table.deckCodes?.length ?? 0;
  if (deckLen > 0 && (idx < 0 || idx > deckLen)) {
    errors.push(`deckIndex out of bounds: ${idx} (deck length: ${deckLen})`);
  }

  // Burns per street (if any recorded) should be exactly one card each
  if (burns.flop && burns.flop.length > 1) errors.push(`Too many burns on flop: ${burns.flop.length}`);
  if (burns.turn && burns.turn.length > 1) errors.push(`Too many burns on turn: ${burns.turn.length}`);
  if (burns.river && burns.river.length > 1) errors.push(`Too many burns on river: ${burns.river.length}`);

  // Community street progression (append-only): 0 -> 3 -> 4 -> 5
  const cc = table.communityCards || [];
  if (cc.length !== 0 && cc.length !== 3 && cc.length !== 4 && cc.length !== 5) {
    errors.push(`Invalid community length: ${cc.length} (expected 0,3,4,5)`);
  }

  return { ok: errors.length === 0, errors };
}

