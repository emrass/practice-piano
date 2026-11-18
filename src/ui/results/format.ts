import type { ExerciseResult } from '../../core/eval/types';

/**
 * A signed timing offset as a results tile: the size is the value, and the note names it with its
 * direction ("12 ms" over "Tendency · early"). Within ±8 ms there is no direction to give: the
 * value reads "Centered".
 */
export function offsetTile(name: string, ms: number | null, early: string, late: string): { value: string; note: string } {
  if (ms === null) return { value: '–', note: name };
  if (Math.abs(ms) < 8) return { value: 'Centered', note: name };
  return { value: `${Math.abs(ms)} ms`, note: `${name} · ${ms < 0 ? early : late}` };
}

/**
 * The note under a Wait run's wrong-note count: `name` ("Wrong notes"), or "Wrong · 2 hints" once a
 * hint was asked for, so it still fits the tile on one line.
 */
export function wrongNote(result: ExerciseResult, name: string): string {
  const n = result.hints ?? 0;
  return n ? `Wrong · ${n} hint${n === 1 ? '' : 's'}` : name;
}

/** A 0–1 share as a whole percentage, an en dash when unknown. */
export function pct(v: number | null): string {
  return v === null ? '–' : `${Math.round(v * 100)}%`;
}

/**
 * The verdict (design/system/guides/01-writing.md): a clean run earns 'Clean!', the only exclamation
 * mark in the app; any other pass is 'Passed'; a run that did not pass is 'Nearly' (≥ 75% pitch
 * accuracy) or 'Slow it down'. `clean` is the lesson's own bar for a passed run.
 */
export function verdict(result: ExerciseResult, passed: boolean, clean: boolean): string {
  if (passed) return clean ? 'Clean!' : 'Passed';
  return result.pitchAccuracy >= 0.75 ? 'Nearly' : 'Slow it down';
}

/** Sight reading and ear training: a pass with ≥ 98% pitch accuracy is clean. */
export function cleanPitch(result: ExerciseResult): boolean {
  return result.pitchAccuracy >= 0.98;
}
