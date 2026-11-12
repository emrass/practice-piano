import { describe, expect, it } from 'vitest';
import { allEvents, type Exercise, type HandsMode } from '../exercise';
import { KEYBOARD_RANGES } from '../keyboard/range';
import { scaleDegree } from '../music/keys';
import { isSupportedDuration } from '../music/rhythm';
import { pitchToStep } from '../music/pitch';
import { difficultyProfile, interpolate } from './difficulty';
import { generateExercise, type GeneratorSettings } from './generator';
import { TIERS, tierForLevel } from './tiers';

const base: GeneratorSettings = {
  level: 1,
  hands: 'rh',
  bars: 8,
  keyId: 'auto',
  timeSignature: 'auto',
  rhythmComplexity: 'auto',
  maxPolyphony: 'auto',
  bpm: null,
  keyboardSize: 88,
};

function gen(over: Partial<GeneratorSettings>, seed = 42): Exercise {
  return generateExercise({ ...base, ...over }, seed);
}

/** Top-voice pitch sequence of one hand (rests skipped). */
function topLine(ex: Exercise, hand: 'rh' | 'lh'): number[] {
  return ex.measures.flatMap((m) => m[hand]).filter((e) => e.pitches.length).map((e) => pitchToStep(e.pitches[e.pitches.length - 1]));
}

const HANDS: HandsMode[] = ['rh', 'lh', 'alternating', 'both'];
const SEEDS = Array.from({ length: 12 }, (_, i) => 1000 + i * 7919);

describe('generateExercise', () => {
  it('is deterministic for a given seed and settings', () => {
    expect(gen({ level: 50 }, 7)).toEqual(gen({ level: 50 }, 7));
    expect(gen({ level: 50 }, 7).id).not.toBe(gen({ level: 50 }, 8).id);
  });

  it('fills every bar exactly for every active hand', () => {
    for (const level of [1, 8, 18, 33, 52, 77, 100]) {
      for (const hands of HANDS) {
        for (const seed of SEEDS.slice(0, 4)) {
          const ex = gen({ level, hands, bars: 8 }, seed);
          for (const m of ex.measures) {
            for (const hand of ['rh', 'lh'] as const) {
              const evs = m[hand];
              if (evs.length === 0) continue;
              const total = evs.reduce((a, e) => a + e.durationTicks, 0);
              expect(total).toBe(ex.timeSignature.ticksPerBar);
              let pos = m.startTick;
              for (const e of evs) {
                expect(e.startTick).toBe(pos);
                expect(isSupportedDuration(e.durationTicks)).toBe(true);
                pos += e.durationTicks;
              }
            }
          }
        }
      }
    }
  });

  it('level 1 is a single repeated pitch in simple rhythms, C major, 4/4', () => {
    for (const seed of SEEDS) {
      const rh = gen({ level: 1, hands: 'rh' }, seed);
      const lh = gen({ level: 1, hands: 'lh' }, seed);
      expect(new Set(allEvents(rh).flatMap((e) => e.pitches.map((p) => p.midi)))).toEqual(new Set([60]));
      expect(new Set(allEvents(lh).flatMap((e) => e.pitches.map((p) => p.midi)))).toEqual(new Set([48]));
      expect(rh.key.id).toBe('C');
      expect(rh.timeSignature.id).toBe('4/4');
      for (const e of allEvents(rh)) {
        expect([4, 8, 16]).toContain(e.durationTicks);
        expect(e.pitches.length).toBe(1); // no rests, no chords
      }
    }
  });

  it('grows the note vocabulary gradually through the beginner levels', () => {
    const vocab = (level: number) => {
      const s = new Set<number>();
      for (const seed of SEEDS) allEvents(gen({ level, bars: 16 }, seed)).forEach((e) => e.pitches.forEach((p) => s.add(p.midi)));
      return s.size;
    };
    expect(vocab(1)).toBe(1);
    expect(vocab(4)).toBe(2);
    expect(vocab(6)).toBe(3);
    expect(vocab(8)).toBe(4);
    expect(vocab(12)).toBe(5);
    expect(vocab(30)).toBeGreaterThan(5);
    expect(vocab(80)).toBeGreaterThan(vocab(30));
  });

  it('never changes the chosen hands, whatever the level', () => {
    for (let level = 1; level <= 100; level += 9) {
      expect(gen({ level, hands: 'lh' }).measures.every((m) => m.rh.length === 0)).toBe(true);
      expect(gen({ level, hands: 'rh' }).measures.every((m) => m.lh.length === 0)).toBe(true);
      expect(gen({ level, hands: 'both' }).staves).toEqual(['treble', 'bass']);
    }
  });

  it('keeps melodic motion mostly stepwise and within the leap limit', () => {
    for (const level of [10, 25, 45, 70]) {
      const profile = difficultyProfile(level);
      let small = 0;
      let total = 0;
      for (const seed of SEEDS) {
        const line = topLine(gen({ level, hands: 'rh', maxPolyphony: 1, bars: 16 }, seed), 'rh');
        for (let i = 1; i < line.length; i++) {
          const a = Math.abs(line[i] - line[i - 1]);
          // Cadential tonic may be reached by a slightly larger move; allow +2 slack.
          expect(a).toBeLessThanOrEqual(profile.maxLeap + 2);
          if (a <= 1) small++;
          total++;
        }
      }
      expect(small / total).toBeGreaterThan(0.45);
    }
  });

  it('ends on the tonic', () => {
    for (const level of [5, 20, 40, 60, 90]) {
      for (const seed of SEEDS.slice(0, 6)) {
        const ex = gen({ level, hands: 'rh' }, seed);
        const last = [...allEvents(ex)].filter((e) => e.pitches.length).pop()!;
        const top = last.pitches[last.pitches.length - 1];
        expect(scaleDegree(ex.key, pitchToStep(top))).toBe(0);
      }
    }
  });

  it('respects explicit overrides', () => {
    const ex = gen({ level: 80, keyId: 'Eb', timeSignature: '3/4', bars: 4, rhythmComplexity: 0, maxPolyphony: 1, bpm: 77 });
    expect(ex.key.id).toBe('Eb');
    expect(ex.timeSignature.id).toBe('3/4');
    expect(ex.bars).toBe(4);
    expect(ex.bpm).toBe(77);
    for (const e of allEvents(ex)) {
      expect(e.durationTicks).toBeGreaterThanOrEqual(4);
      expect(e.pitches.length).toBeLessThanOrEqual(1);
    }
    const chordy = gen({ level: 20, maxPolyphony: 3, bars: 16 });
    expect(allEvents(chordy).some((e) => e.pitches.length > 1)).toBe(true);
  });

  it('auto BPM follows difficulty unless overridden', () => {
    expect(gen({ level: 1 }).bpm).toBeLessThan(gen({ level: 100, timeSignature: '4/4' }).bpm);
    expect(gen({ level: 100, bpm: 64 }).bpm).toBe(64);
  });

  it('stays inside a small keyboard', () => {
    for (const seed of SEEDS) {
      const ex = gen({ level: 100, hands: 'both', keyboardSize: 49 }, seed);
      expect(ex.range.min).toBeGreaterThanOrEqual(KEYBOARD_RANGES[49].min);
      expect(ex.range.max).toBeLessThanOrEqual(KEYBOARD_RANGES[49].max);
    }
  });

  it('keeps the hands apart in Both mode and chords within an octave', () => {
    for (const level of [20, 50, 80, 100]) {
      for (const seed of SEEDS.slice(0, 6)) {
        const ex = gen({ level, hands: 'both', bars: 8 }, seed);
        for (const step of ex.steps) {
          const rh = step.notes.filter((n) => n.hand === 'rh').map((n) => n.midi);
          const lh = step.notes.filter((n) => n.hand === 'lh').map((n) => n.midi);
          if (rh.length && lh.length) expect(Math.max(...lh)).toBeLessThan(Math.min(...rh));
        }
        for (const e of allEvents(ex)) {
          if (e.pitches.length > 1) expect(e.pitches[e.pitches.length - 1].midi - e.pitches[0].midi).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it('alternates hands in blocks with full-bar rests in the idle hand', () => {
    const ex = gen({ level: 30, hands: 'alternating', bars: 4 });
    ex.measures.forEach((m, i) => {
      const active = i % 2 === 0 ? m.rh : m.lh;
      const idle = i % 2 === 0 ? m.lh : m.rh;
      expect(active.some((e) => e.pitches.length > 0)).toBe(true);
      expect(idle).toHaveLength(1);
      expect(idle[0].pitches).toHaveLength(0);
    });
  });

  it('biases toward weak-spot focus notes', () => {
    const count = (focus: boolean) => {
      let hits = 0;
      for (const seed of SEEDS) {
        const ex = gen({ level: 30, bars: 16, keyId: 'C', focus: focus ? [{ midi: 65, clef: 'treble' }] : undefined }, seed);
        hits += allEvents(ex).filter((e) => e.pitches.some((p) => p.midi === 65)).length;
      }
      return hits;
    };
    expect(count(true)).toBeGreaterThan(count(false) * 1.4);
  });

  it('builds wait-mode steps that merge simultaneous notes of both hands', () => {
    const ex = gen({ level: 20, hands: 'both' });
    expect(ex.steps[0].tick).toBe(0);
    expect(ex.steps[0].notes.some((n) => n.hand === 'rh')).toBe(true);
    expect(ex.steps[0].notes.some((n) => n.hand === 'lh')).toBe(true);
    for (let i = 1; i < ex.steps.length; i++) expect(ex.steps[i].tick).toBeGreaterThan(ex.steps[i - 1].tick);
  });
});

describe('difficulty', () => {
  it('covers 1–100 with contiguous tiers', () => {
    expect(TIERS[0].minLevel).toBe(1);
    expect(TIERS[TIERS.length - 1].maxLevel).toBe(100);
    for (let i = 1; i < TIERS.length; i++) expect(TIERS[i].minLevel).toBe(TIERS[i - 1].maxLevel + 1);
    expect(tierForLevel(0).id).toBe('t01');
    expect(tierForLevel(250).id).toBe(TIERS[TIERS.length - 1].id);
  });

  it('widens range and introduces features monotonically', () => {
    let prevSpan = 0;
    let prevKeys = 0;
    for (let level = 1; level <= 100; level++) {
      const p = difficultyProfile(level);
      const span = p.rhRange[1] - p.rhRange[0];
      expect(span).toBeGreaterThanOrEqual(prevSpan);
      expect(p.keyPool.length).toBeGreaterThanOrEqual(prevKeys);
      prevSpan = span;
      prevKeys = p.keyPool.length;
    }
  });

  it('interpolates anchors', () => {
    expect(interpolate(5, [[0, 0], [10, 100]])).toBe(50);
    expect(interpolate(-1, [[0, 3], [10, 100]])).toBe(3);
    expect(interpolate(99, [[0, 3], [10, 100]])).toBe(100);
  });
});
