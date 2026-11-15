import { PIANO_ACTIONS } from '../../core/input/pianoShortcuts';
import type { Continuation } from './types';

/** Generated material (sight reading, ear, rhythm, chord drills): try this one again, or move on to a new one. */
export function generatedContinuation(nextLabel: string): Continuation {
  return { repeat: { label: 'Restart' }, next: { label: nextLabel }, primary: 'next' };
}

/**
 * Fixed repertoire (scales, progressions): an item is repeated until it sits, so "Again" leads,
 * except in review, where each due item gets one pass. A specific key has nothing to move on to.
 */
export function repertoireContinuation(opts: { review: boolean; shuffle: boolean; movedToBpm?: number }): Continuation {
  const repeat = { label: opts.movedToBpm ? `Again at ${opts.movedToBpm} bpm` : 'Again' };
  if (opts.review) return { repeat, next: { label: 'Next due item' }, primary: 'next' };
  if (opts.shuffle) return { repeat, next: { label: 'Next key' }, primary: 'repeat' };
  return { repeat, next: null, primary: 'repeat' };
}

/** The piano shortcuts after a run, C and D named as the lesson names them (no D when there is no next). */
export function pianoLegend(continuation: Continuation): { key: string; label: string }[] {
  return PIANO_ACTIONS.flatMap((a) => {
    if (a.action === 'retry') return [{ key: a.key, label: continuation.repeat.label }];
    if (a.action === 'next') return continuation.next ? [{ key: a.key, label: continuation.next.label }] : [];
    return [{ key: a.key, label: a.label }];
  });
}
