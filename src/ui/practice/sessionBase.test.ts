import { describe, expect, it } from 'vitest';
import { StepMarks } from './sessionBase';

describe('StepMarks', () => {
  it('marks a chord step when all its notes are in, by how they were hit', () => {
    const m = new StepMarks();
    expect(m.hit(0, 2, false)).toBeNull(); // one of two notes: not decided yet
    expect(m.hit(0, 2, false)).toBe('good');
    expect(m.hit(1, 1, true)).toBe('ok'); // early or late
    expect(m.miss(2)).toBe('missed');
    m.hit(3, 2, false);
    expect(m.miss(3)).toBe('bad'); // some hit, some missed
    expect(m.hit(4, 2, false)).toBeNull();
    m.reset();
    expect(m.hit(0, 1, false)).toBe('good');
  });
});
