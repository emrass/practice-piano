import type { ExerciseResult } from '../../core/eval/types';

/** Signed timing offset: 'Centered' within ±8 ms, otherwise the size with `early` (negative) or `late` (positive). */
export function signedMs(ms: number | null, early: string, late: string): string {
  if (ms === null) return '—';
  if (Math.abs(ms) < 8) return 'Centered';
  return `${Math.abs(ms)} ms ${ms < 0 ? early : late}`;
}

/**
 * A signed timing offset as a results tile: the size is the value, and the note names it with its
 * direction ("12 ms" over "Tendency · early"). Within ±8 ms there is no direction to give: the
 * value reads "Centered".
 */
export function offsetTile(name: string, ms: number | null, early: string, late: string): { value: string; note: string } {
  if (ms === null) return { value: '—', note: name };
  if (Math.abs(ms) < 8) return { value: 'Centered', note: name };
  return { value: `${Math.abs(ms)} ms`, note: `${name} · ${ms < 0 ? early : late}` };
}

/** ' · 2 hints' after a Wait run's wrong-note count, nothing when no hint was asked for. */
export function hintNote(result: ExerciseResult): string {
  const n = result.hints ?? 0;
  return n ? ` · ${n} hint${n === 1 ? '' : 's'}` : '';
}

/** A 0–1 share as a whole percentage, '—' when unknown. */
export function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

/**
 * Headline shared by the lessons: `perfect` when passed with ≥ 98% pitch accuracy (and `perfectExtra`),
 * otherwise 'Passed!' / 'Nearly there' (≥ 75%) / 'Keep practicing'. Without `perfect`, a pass is just 'Passed!'.
 */
export function gradeHeadline(result: ExerciseResult, passed: boolean, perfect?: string, perfectExtra = true): string {
  if (passed && perfect !== undefined && result.pitchAccuracy >= 0.98 && perfectExtra) return perfect;
  if (passed) return 'Passed!';
  return result.pitchAccuracy >= 0.75 ? 'Nearly there' : 'Keep practicing';
}
