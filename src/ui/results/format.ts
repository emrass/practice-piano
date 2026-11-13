import type { ExerciseResult } from '../../core/eval/types';

/** Signed timing offset: 'Centred' within ±8 ms, otherwise the size with `early` (negative) or `late` (positive). */
export function signedMs(ms: number | null, early: string, late: string): string {
  if (ms === null) return '—';
  if (Math.abs(ms) < 8) return 'Centred';
  return `${Math.abs(ms)} ms ${ms < 0 ? early : late}`;
}

/** A 0–1 share as a whole percentage, '—' when unknown. */
export function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

/**
 * Headline shared by the lessons: `perfect` when passed with ≥ 98% pitch accuracy (and `perfectExtra`),
 * otherwise 'Passed!' / 'Nearly there' (≥ 75%) / 'Keep practising'. Without `perfect`, a pass is just 'Passed!'.
 */
export function gradeHeadline(result: ExerciseResult, passed: boolean, perfect?: string, perfectExtra = true): string {
  if (passed && perfect !== undefined && result.pitchAccuracy >= 0.98 && perfectExtra) return perfect;
  if (passed) return 'Passed!';
  return result.pitchAccuracy >= 0.75 ? 'Nearly there' : 'Keep practising';
}
