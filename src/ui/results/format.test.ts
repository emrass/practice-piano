import { describe, expect, it } from 'vitest';
import type { ExerciseResult } from '../../core/eval/types';
import { verdict, wrongNote } from './format';

const result = (pitchAccuracy: number, hints?: number) => ({ pitchAccuracy, hints }) as ExerciseResult;

describe('results wording (design/system/guides/01-writing.md)', () => {
  it('a clean run is the only verdict with an exclamation mark', () => {
    expect(verdict(result(1), true, true)).toBe('Clean!');
    expect(verdict(result(0.92), true, false)).toBe('Passed');
    expect(verdict(result(0.8), false, false)).toBe('Nearly');
    expect(verdict(result(0.5), false, false)).toBe('Slow it down');
    expect(verdict(result(0.5), false, false, 'Listen again')).toBe('Listen again');
  });

  it('the wrong-note tile note stays short enough for one line', () => {
    expect(wrongNote(result(1), 'Wrong notes')).toBe('Wrong notes');
    expect(wrongNote(result(1, 1), 'Wrong notes')).toBe('Wrong · 1 hint');
    expect(wrongNote(result(1, 2), 'Wrong keys')).toBe('Wrong · 2 hints');
  });
});
