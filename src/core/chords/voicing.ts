/**
 * Voicings and voice leading. A voicing is a sorted list of MIDI notes. Chords are judged by
 * pitch classes (any voicing), but the app shows one smooth voicing and measures how far the
 * hand moved between chords compared with the smallest move possible.
 */
const pc = (m: number) => ((m % 12) + 12) % 12;

/** Close position starting with `bassPc` at or above `low`. */
export function closeVoicing(pcs: readonly number[], bassPc: number, low: number): number[] {
  const order = [...pcs.slice(pcs.indexOf(bassPc)), ...pcs.slice(0, pcs.indexOf(bassPc))];
  const out: number[] = [];
  let next = low + ((bassPc - pc(low) + 12) % 12);
  for (const p of order) {
    while (pc(next) !== p) next++;
    out.push(next);
    next++;
  }
  return out;
}

/** Every close-position voicing (each chord tone in the bass) with its lowest note in [low, high]. */
export function closeVoicings(pcs: readonly number[], low: number, high: number): number[][] {
  const out: number[][] = [];
  for (const bass of pcs) {
    for (let start = low; start <= high; start += 12) {
      const v = closeVoicing(pcs, bass, start);
      if (v[0] <= high) out.push(v);
    }
  }
  return out;
}

/**
 * How far the hand moves from one voicing to the next, in semitones. Same size: notes are
 * paired in order (voices move to voices); different sizes: each note to its nearest note.
 */
export function movement(from: readonly number[], to: readonly number[]): number {
  if (!from.length || !to.length) return 0;
  const a = [...from].sort((x, y) => x - y);
  const b = [...to].sort((x, y) => x - y);
  if (a.length === b.length) return a.reduce((s, n, i) => s + Math.abs(n - b[i]), 0);
  const near = (n: number, set: number[]) => Math.min(...set.map((m) => Math.abs(m - n)));
  return Math.round((a.reduce((s, n) => s + near(n, b), 0) + b.reduce((s, n) => s + near(n, a), 0)) / 2);
}

/** The smallest move from `from` to any close voicing of `pcs` near it (optionally fixing the bass). */
export function minimalMovement(from: readonly number[], pcs: readonly number[], bassPc: number | null = null): number {
  if (!from.length) return 0;
  const lowest = Math.min(...from);
  const candidates = closeVoicings(pcs, lowest - 12, lowest + 12).filter((v) => bassPc === null || pc(v[0]) === bassPc);
  return Math.min(...candidates.map((v) => movement(from, v)));
}

/** The close voicing of `pcs` nearest to `from` that stays inside [low, high]. */
export function smoothestVoicing(from: readonly number[], pcs: readonly number[], low: number, high: number, bassPc: number | null = null): number[] {
  const candidates = closeVoicings(pcs, low, high).filter((v) => v[v.length - 1] <= high && (bassPc === null || pc(v[0]) === bassPc));
  let best = candidates[0];
  let bestCost = Infinity;
  for (const v of candidates) {
    const cost = movement(from, v);
    if (cost < bestCost) {
      best = v;
      bestCost = cost;
    }
  }
  return best;
}

/** Voice-leading quality of one change: 1 = as smooth as possible. */
export function voiceLeadingScore(from: readonly number[], to: readonly number[], pcs: readonly number[], bassPc: number | null = null): number {
  const actual = movement(from, to);
  const minimal = minimalMovement(from, pcs, bassPc);
  if (actual <= minimal) return 1;
  return minimal / actual;
}
