/**
 * Fresh material: generators draw from a large but finite space, and at low levels (a few
 * notes, a five-finger range) two seeds can produce the same passage. When a new exercise is
 * asked for, try a few seeds and take the first one the player has not met yet.
 */
export const FRESH_TRIES = 24;

/** The k-th alternative to a seed (a fixed, well-spread sequence). */
export function seedVariant(seed: number, k: number): number {
  return k === 0 ? seed : (Math.imul(seed ^ (k * 0x9e3779b9), 0x85ebca6b) >>> 0) || 1;
}

/**
 * The first exercise, over `seed` and its variants, whose id `seen` does not know; if every
 * try has been seen, the one met least is used (by `seen` returning a count).
 */
export function freshExercise<E extends { id: string }>(make: (seed: number) => E, seed: number, seen: (id: string) => number, tries = FRESH_TRIES): E {
  let best: E | null = null;
  let bestCount = Infinity;
  for (let k = 0; k < tries; k++) {
    const ex = make(seedVariant(seed, k));
    const count = seen(ex.id);
    if (count === 0) return ex;
    if (count < bestCount) {
      best = ex;
      bestCount = count;
    }
  }
  return best!;
}
