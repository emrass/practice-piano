// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { generateExercise, type GeneratorSettings } from '../../core/generator/generator';
import { allEvents } from '../../core/exercise';
import { chooseScale, computeLayout, measureX, tickToX } from './layout';
import { renderScore } from './renderScore';

const base: GeneratorSettings = {
  level: 40,
  hands: 'both',
  bars: 8,
  keyId: 'auto',
  timeSignature: 'auto',
  rhythmComplexity: 'auto',
  maxPolyphony: 'auto',
  bpm: null,
  keyboardSize: 88,
};

describe('score layout', () => {
  it('uses uniform measure widths and a linear time axis inside each system', () => {
    const ex = generateExercise({ ...base, timeSignature: '3/4' }, 11);
    const layout = computeLayout(ex, 1100, 80);
    const xs = Array.from({ length: layout.measuresPerSystem + 1 }, (_, i) => measureX(layout, i).x);
    for (let i = 1; i < layout.measuresPerSystem; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(layout.measureWidth);
    // Equal tick steps → equal x steps, across the barline too.
    const tpb = ex.timeSignature.ticksPerBar;
    const a = tickToX(layout, tpb - 2).x;
    const b = tickToX(layout, tpb).x;
    const c = tickToX(layout, tpb + 2).x;
    expect(b - a).toBeCloseTo(c - b);
    // Every note fits inside its measure.
    for (const e of allEvents(ex)) {
      const { x } = tickToX(layout, e.startTick);
      const m = measureX(layout, e.measureIndex).x;
      expect(x).toBeGreaterThan(m);
      expect(x + 10).toBeLessThan(m + layout.measureWidth);
    }
  });

  it('gives more room to dense rhythms and zooms short pieces', () => {
    const easy = generateExercise({ ...base, level: 5, hands: 'rh', bars: 4 }, 3);
    const dense = generateExercise({ ...base, level: 95, hands: 'rh', bars: 4, rhythmComplexity: 4 }, 3);
    expect(computeLayout(dense, 1000, 80).measuresPerSystem).toBeLessThan(computeLayout(easy, 1000, 80).measuresPerSystem);
    expect(chooseScale(easy, 1000, 600, 80)).toBeGreaterThan(1);
    expect(chooseScale(generateExercise({ ...base, bars: 16 }, 3), 1000, 400, 80)).toBe(1);
  });
});

describe('renderScore (VexFlow)', () => {
  it('engraves both hands with simultaneous notes vertically aligned', () => {
    for (const seed of [1, 2, 3, 4]) {
      const ex = generateExercise({ ...base, level: 30 + seed * 15 }, seed);
      const host = document.createElement('div');
      const r = renderScore(host, ex, { width: 1200, height: 0, showNoteNames: true });
      expect(host.querySelector('svg')).not.toBeNull();
      expect(r.stepElements.size).toBe(ex.steps.length);
      for (const step of ex.steps) {
        const ids = [...new Set(step.notes.map((n) => n.eventId))];
        const xs = ids.map((id) => r.noteX.get(id)!);
        // RH and LH noteheads at the same beat share one x (within a pixel).
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
        expect(xs[0]).toBeCloseTo(tickToX(r.layout, step.tick).x, 0);
      }
      expect(host.querySelectorAll('.pp-label').length).toBeGreaterThan(0);
    }
  });

  it('renders a single staff for one hand', () => {
    const ex = generateExercise({ ...base, hands: 'lh', level: 12 }, 9);
    const host = document.createElement('div');
    const r = renderScore(host, ex, { width: 900, height: 0, showNoteNames: false });
    expect(host.querySelectorAll('.vf-clef').length).toBe(r.layout.systems.length);
    expect(host.querySelectorAll('.pp-label').length).toBe(0);
  });
});
