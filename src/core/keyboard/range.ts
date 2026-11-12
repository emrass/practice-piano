export type KeyboardSize = 49 | 61 | 73 | 76 | 88;

export const KEYBOARD_SIZES: readonly KeyboardSize[] = [49, 61, 73, 76, 88];

/** Standard MIDI ranges for common digital-piano / controller sizes. */
export const KEYBOARD_RANGES: Readonly<Record<KeyboardSize, { min: number; max: number; label: string }>> = {
  49: { min: 36, max: 84, label: '49 keys (C2–C6)' },
  61: { min: 36, max: 96, label: '61 keys (C2–C7)' },
  73: { min: 28, max: 100, label: '73 keys (E1–E7)' },
  76: { min: 28, max: 103, label: '76 keys (E1–G7)' },
  88: { min: 21, max: 108, label: '88 keys (A0–C8)' },
};

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK_PCS.has(((midi % 12) + 12) % 12);
}

export function countWhiteKeys(min: number, max: number): number {
  let n = 0;
  for (let m = min; m <= max; m++) if (!isBlackKey(m)) n++;
  return n;
}

/**
 * Keyboard window that comfortably shows an exercise: padded, snapped to white keys,
 * at least `minWhiteKeys` wide (so keys never become absurdly large) and clamped to the
 * physical keyboard.
 */
export function fitKeyboardRange(
  exerciseMin: number,
  exerciseMax: number,
  size: KeyboardSize,
  minWhiteKeys = 15,
): { min: number; max: number } {
  const bounds = KEYBOARD_RANGES[size];
  let lo = Math.max(bounds.min, Math.min(exerciseMin, exerciseMax) - 2);
  let hi = Math.min(bounds.max, Math.max(exerciseMin, exerciseMax) + 2);
  if (lo > hi) [lo, hi] = [bounds.min, bounds.max];
  // Grow symmetrically until wide enough.
  let growLow = true;
  while (countWhiteKeys(lo, hi) < minWhiteKeys && (lo > bounds.min || hi < bounds.max)) {
    if ((growLow && lo > bounds.min) || hi >= bounds.max) lo--;
    else hi++;
    growLow = !growLow;
  }
  while (isBlackKey(lo) && lo > bounds.min) lo--;
  while (isBlackKey(hi) && hi < bounds.max) hi++;
  return { min: lo, max: hi };
}
