// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { generateChordExercise } from '../../core/chords/generator';
import { generateExercise, type GeneratorSettings } from '../../core/generator/generator';
import { allEvents } from '../../core/exercise';
import { chooseScale, COVER_FADE_IN_PX, COVER_FADE_OUT_PX, COVER_TRAIL_PX, computeLayout, coverBoxes, measureX, PLAYHEAD_OFFSET_PX, tickToX } from './layout';
import { drawStepMark, fingeringRoom, renderScore } from './renderScore';

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

describe('read-ahead cover', () => {
  const ex = generateExercise({ ...base, timeSignature: '4/4', bars: 8 }, 5);
  const layout = computeLayout(ex, 1100, 80);
  const tpb = ex.timeSignature.ticksPerBar;
  const perLine = layout.measuresPerSystem;
  const [first, second] = layout.systems;

  it('runs from just behind the playhead to the edge of the span, over the whole line', () => {
    const tick = tpb + 2;
    const [box, ...rest] = coverBoxes(layout, tick, 4);
    expect(rest).toEqual([]);
    const playhead = tickToX(layout, tick).x + PLAYHEAD_OFFSET_PX;
    expect(box.left).toBeCloseTo(playhead - COVER_TRAIL_PX - COVER_FADE_OUT_PX / 2);
    expect(box).toMatchObject({ fadeLeft: COVER_FADE_OUT_PX, fadeRight: COVER_FADE_IN_PX });
    // The note on the playhead is under it (past the fading edge); the note at the far edge starts where the fade in is half done.
    expect(box.left + COVER_FADE_OUT_PX).toBeLessThan(tickToX(layout, tick).x);
    const edge = box.right - COVER_FADE_IN_PX / 2;
    expect(edge).toBeLessThan(tickToX(layout, tick + 4).x);
    expect(edge).toBeGreaterThan(tickToX(layout, tick + 4).x - 4);
    expect(box.top).toBeGreaterThan(first.top);
    expect(box.top + box.height).toBeLessThan(first.top + first.height);
    expect(box.top).toBeLessThan(first.bandTop);
    expect(box.top + box.height).toBeGreaterThan(first.bandBottom);
  });

  it('carries on at the start of the next line', () => {
    expect(layout.systems.length).toBeGreaterThan(1);
    const tick = perLine * tpb - 2;
    const boxes = coverBoxes(layout, tick, tpb);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].right).toBeCloseTo(first.measuresX + perLine * layout.measureWidth + COVER_FADE_OUT_PX / 2);
    // It runs on without a fade from the line end into the next line's start.
    expect(boxes[1].fadeLeft).toBe(0);
    expect(boxes[1].top).toBeGreaterThan(boxes[0].top);
    expect(boxes[1].left).toBe(second.measuresX);
    expect(boxes[1].right).toBeCloseTo(tickToX(layout, tick + tpb).x - 2 + COVER_FADE_IN_PX / 2);
  });

  it('stops at the end of the piece, and covers nothing without a span', () => {
    const total = ex.totalTicks;
    const boxes = coverBoxes(layout, total - 2, tpb);
    expect(boxes).toHaveLength(1);
    const last = layout.systems[layout.systems.length - 1];
    expect(boxes[0].right).toBeCloseTo(last.measuresX + last.measureCount * layout.measureWidth + COVER_FADE_OUT_PX / 2);
    expect(coverBoxes(layout, tpb, 0)).toEqual([]);
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
      expect(host.querySelectorAll('.score-label').length).toBeGreaterThan(0);
    }
  });

  it('renders a single staff for one hand', () => {
    const ex = generateExercise({ ...base, hands: 'lh', level: 12 }, 9);
    const host = document.createElement('div');
    const r = renderScore(host, ex, { width: 900, height: 0, showNoteNames: false });
    expect(host.querySelectorAll('.vf-clef').length).toBe(r.layout.systems.length);
    expect(host.querySelectorAll('.score-label').length).toBe(0);
  });

  it('tags each note for the Score component and reserves a mark under it', () => {
    const ex = generateExercise({ ...base, level: 30 }, 2);
    const host = document.createElement('div');
    const r = renderScore(host, ex, { width: 1200, height: 0, showNoteNames: true });
    for (const groups of r.stepElements.values()) for (const g of groups) expect(g.classList.contains('note')).toBe(true);
    // One mark per note group of every step, empty until the step has a state.
    expect(r.stepMarks.size).toBe(ex.steps.length);
    for (const [index, marks] of r.stepMarks) {
      expect(marks.length).toBe(r.stepElements.get(index)!.length);
      for (const mark of marks) {
        expect(mark.getAttribute('class')).toBe('score-mark');
        expect(mark.textContent).toBe('');
      }
    }
    // Each mark sits just under the name labels of its own note (same x, the row below).
    const labels = [...host.querySelectorAll<SVGTextElement>('.score-label[data-step="0"]')];
    for (const mark of r.stepMarks.get(0)!) {
      const y = Number(mark.getAttribute('y'));
      const above = labels.filter((l) => l.getAttribute('x') === mark.getAttribute('x') && Number(l.getAttribute('y')) < y);
      expect(above.length).toBeGreaterThan(0);
      expect(y - Math.max(...above.map((l) => Number(l.getAttribute('y'))))).toBeLessThanOrEqual(14);
    }
  });

  it('keeps the marks when note names are off', () => {
    const ex = generateExercise({ ...base, hands: 'rh', level: 12 }, 9);
    const host = document.createElement('div');
    const r = renderScore(host, ex, { width: 900, height: 0, showNoteNames: false });
    expect(host.querySelectorAll('.score-label').length).toBe(0);
    expect(host.querySelectorAll('.score-mark').length).toBe(ex.steps.length);
    expect(r.stepMarks.size).toBe(ex.steps.length);
  });

  it('stacks a chord\'s fingering away from the staff, with the chord symbols over it', () => {
    const ex = generateChordExercise({ task: 'sequence', chord: 'maj', key: 'C', hands: 'both', notation: true }, { bpm: 60, count: 8 }, 1);
    const plain = renderScore(document.createElement('div'), ex, { width: 1200, height: 0, showNoteNames: false });
    const host = document.createElement('div');
    const r = renderScore(host, ex, { width: 1200, height: 0, showNoteNames: false, showFingering: true });
    // Two more rows of numbers above the treble staff and below the bass staff.
    expect(fingeringRoom(ex, false)).toEqual({ top: 0, bottom: 0 });
    expect(fingeringRoom(ex, true)).toEqual({ top: 28, bottom: 24 });
    expect(r.layout.height - plain.layout.height).toBe(52 * r.layout.systems.length);
    expect(r.layout.systems[0].staveY.treble! - plain.layout.systems[0].staveY.treble!).toBe(28);
    const ys = (step: number, x: string) =>
      [...host.querySelectorAll<SVGTextElement>(`.pp-finger[data-step="${step}"]`)]
        .filter((el) => el.getAttribute('x') === x)
        .map((el) => ({ y: Number(el.getAttribute('y')), finger: el.textContent }))
        .sort((a, b) => a.y - b.y);
    const fingers = [...host.querySelectorAll<SVGTextElement>('.pp-finger[data-step="1"]')];
    expect(fingers).toHaveLength(6);
    expect(fingers.some((el) => el.classList.contains('is-thumb'))).toBe(false);
    // First inversion, read from the top of the page down: right hand 5-2-1 over the staff, left hand 1-3-5 under it.
    const stack = ys(1, fingers[0].getAttribute('x')!).map((f) => f.finger).join('');
    expect(stack).toBe('521135');
    const all = ys(1, fingers[0].getAttribute('x')!);
    const treble = r.layout.systems[0].staveY.treble! + 40;
    const bassBottom = r.layout.systems[0].staveY.bass! + 80;
    expect(all[2].y).toBeLessThan(treble);
    expect(all[3].y).toBeGreaterThan(bassBottom);
    // The symbols clear the stack, and everything stays on the sheet.
    const symbols = [...host.querySelectorAll<SVGTextElement>('.chord-symbol')];
    expect(symbols).toHaveLength(7);
    for (const symbol of symbols) {
      expect(Number(symbol.getAttribute('y'))).toBeLessThan(all[0].y - 10);
      expect(Number(symbol.getAttribute('y'))).toBeGreaterThan(14);
    }
    const marks = [...r.stepMarks.values()].flat().map((m) => Number(m.getAttribute('y')));
    expect(Math.max(...marks)).toBeLessThan(r.layout.height);
    expect(Math.max(...marks)).toBeGreaterThan(all[5].y);
  });

  it('marks a note by its state: a tilde for nearly, a cross for wrong or missed, nothing for right', () => {
    const ex = generateExercise({ ...base, hands: 'rh', level: 12 }, 9);
    const host = document.createElement('div');
    const r = renderScore(host, ex, { width: 900, height: 0, showNoteNames: false });
    const mark = r.stepMarks.get(0)![0];
    drawStepMark(mark, 'ok');
    expect(mark.textContent).toBe('~');
    expect(mark.classList.contains('is-ok')).toBe(true);
    for (const state of ['bad', 'missed'] as const) {
      drawStepMark(mark, state);
      expect(mark.textContent).toBe('×');
      expect(mark.classList.contains('is-ok')).toBe(false);
    }
    for (const state of ['good', 'call', undefined] as const) {
      drawStepMark(mark, state);
      expect(mark.textContent).toBe('');
    }
  });
});
