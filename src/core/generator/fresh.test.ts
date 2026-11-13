import { describe, expect, it } from 'vitest';
import { generateEarExercise } from '../ear/generator';
import { freshExercise, seedVariant } from './fresh';

describe('fresh exercises', () => {
  it('spreads seed variants and keeps the seed itself first', () => {
    const vs = Array.from({ length: 24 }, (_, k) => seedVariant(12345, k));
    expect(vs[0]).toBe(12345);
    expect(new Set(vs).size).toBe(24);
  });

  it('skips phrases the player has already met, even in a tiny space', () => {
    // Level 1 ear phrases are two notes out of C, D and E: only a handful exist.
    const settings = { level: 1, length: 'auto', reference: 'auto', keyId: 'auto' } as const;
    const seen = new Map<string, number>();
    let repeats = 0;
    for (let i = 0; i < 6; i++) {
      const ex = freshExercise((seed) => generateEarExercise(settings, seed), 1000 + i, (id) => seen.get(id) ?? 0);
      if (seen.has(ex.id)) repeats++;
      seen.set(ex.id, (seen.get(ex.id) ?? 0) + 1);
    }
    expect(repeats).toBe(0);
  });

  it('falls back to the least-met exercise when everything has been seen', () => {
    const make = (seed: number) => ({ id: String(seed % 3) });
    const counts: Record<string, number> = { '0': 5, '1': 2, '2': 9 };
    expect(freshExercise(make, 0, (id) => counts[id], 6).id).toBe('1');
  });
});
