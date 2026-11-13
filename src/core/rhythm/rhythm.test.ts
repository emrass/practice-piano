import { describe, expect, it } from 'vitest';
import { allEvents } from '../exercise';
import type { ExerciseResult, NoteResult } from '../eval/types';
import { generateExercise } from '../generator/generator';
import { isSupportedDuration, TIME_SIGNATURES } from '../music/rhythm';
import { applyResult, emptyProgress, findWeakFigures, isPass } from '../progress/progress';
import { annotateRhythm, summarizeRhythm } from './analysis';
import {
  beatPosition,
  generateRhythmExercise,
  restSlots,
  type RhythmExercise,
  type RhythmSettings,
} from './generator';
import { rhythmTierForLevel } from './tiers';

const BASE: RhythmSettings = {
  level: 1,
  task: 'read',
  hands: 'rh',
  texture: 'auto',
  bars: 8,
  timeSignature: 'auto',
  bpm: null,
  rhKey: 72,
  lhKey: 48,
};

function gen(over: Partial<RhythmSettings>, seed: number): RhythmExercise {
  return generateRhythmExercise({ ...BASE, ...over }, seed);
}

function figures(ex: RhythmExercise): Set<string> {
  return new Set(allEvents(ex).map((e) => e.figure ?? ''));
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);

describe('rhythm generator', () => {
  it('is deterministic for a seed', () => {
    expect(gen({ level: 40 }, 5).id).toBe(gen({ level: 40 }, 5).id);
    expect(gen({ level: 40 }, 5).id).not.toBe(gen({ level: 40 }, 6).id);
  });

  it('fills every bar exactly with notatable values on the designated keys', () => {
    for (const level of [1, 12, 30, 50, 70, 85, 95]) {
      for (const hands of ['rh', 'lh', 'both'] as const) {
        for (const seed of SEEDS.slice(0, 10)) {
          const ex = gen({ level, hands }, seed);
          const ts = ex.timeSignature;
          for (const m of ex.measures) {
            for (const hand of ['rh', 'lh'] as const) {
              const evs = m[hand];
              if (!evs.length) continue;
              expect(evs.reduce((a, e) => a + e.durationTicks, 0)).toBe(ts.ticksPerBar);
              let pos = m.startTick;
              for (const e of evs) {
                expect(e.startTick).toBe(pos);
                expect(isSupportedDuration(e.durationTicks)).toBe(true);
                pos += e.durationTicks;
                for (const p of e.pitches) expect(p.midi).toBe(hand === 'rh' ? 72 : 48);
              }
            }
          }
          if (hands === 'rh') expect(ex.staves).toEqual(['treble']);
          if (hands === 'lh') expect(ex.staves).toEqual(['bass']);
          if (hands === 'both') expect(ex.staves).toEqual(['treble', 'bass']);
        }
      }
    }
  });

  it('follows the curriculum: beginners get quarters, halves and wholes in 4/4', () => {
    for (const seed of SEEDS) {
      const ex = gen({ level: 6 }, seed);
      expect(ex.timeSignature.id).toBe('4/4');
      for (const e of allEvents(ex)) {
        expect(e.pitches.length).toBe(1); // no rests yet
        expect([4, 8, 12, 16]).toContain(e.durationTicks);
      }
    }
  });

  it('introduces eighths at 17, dotted rhythms at 37 and 6/8 at 67', () => {
    const at = (level: number) => SEEDS.map((s) => gen({ level }, s));
    const has = (exs: RhythmExercise[], fig: string) => exs.some((ex) => figures(ex).has(fig));
    expect(has(at(16), '2,2')).toBe(false);
    expect(has(at(18), '2,2')).toBe(true);
    expect(has(at(36), '6,2')).toBe(false);
    expect(has(at(38), '6,2')).toBe(true);
    expect(at(60).some((ex) => ex.timeSignature.id === '6/8')).toBe(false);
    const compound = at(70).filter((ex) => ex.timeSignature.id === '6/8').length;
    expect(compound).toBeGreaterThan(SEEDS.length / 2);
  });

  it('features the newest figure of a band', () => {
    // Syncopation band: the eighth–quarter–eighth figure should be common.
    const exs = SEEDS.map((s) => gen({ level: 50 }, s));
    const share = exs.filter((ex) => figures(ex).has('2,4,2')).length / exs.length;
    expect(share).toBeGreaterThan(0.5);
  });

  it('respects overrides (meter, tempo, length)', () => {
    const ex = gen({ level: 30, timeSignature: '2/4', bpm: 101, bars: 4 }, 3);
    expect(ex.timeSignature.id).toBe('2/4');
    expect(ex.bpm).toBe(101);
    expect(ex.bars).toBe(4);
  });

  it('maps levels to the rhythm tiers', () => {
    expect(rhythmTierForLevel(1).id).toBe('r01');
    expect(rhythmTierForLevel(50).id).toBe('r06');
    expect(rhythmTierForLevel(100).id).toBe('r11');
    expect(gen({ level: 95 }, 1).meta.tierId).toBe('r11');
  });
});

describe('hand textures', () => {
  const onsets = (ex: RhythmExercise, hand: 'rh' | 'lh') =>
    ex.measures.flatMap((m) => m[hand].filter((e) => e.pitches.length).map((e) => e.startTick));

  it('unison: both hands play the same rhythm', () => {
    const ex = gen({ level: 5, hands: 'both' }, 9);
    expect(ex.rhythm.texture).toBe('unison');
    expect(onsets(ex, 'rh')).toEqual(onsets(ex, 'lh'));
  });

  it('pulse textures keep the beat in one hand', () => {
    const ex = gen({ level: 30, hands: 'both', texture: 'lh-pulse', bars: 4 }, 9);
    const beat = ex.timeSignature.beatTicks;
    for (const m of ex.measures.slice(0, -1)) {
      expect(m.lh.map((e) => e.startTick - m.startTick)).toEqual(
        Array.from({ length: ex.timeSignature.beatsPerBar }, (_, i) => i * beat),
      );
    }
  });

  it('interlocking hands never play together (except the final note) and both take part', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const ex = gen({ level: 85, hands: 'both', texture: 'interlock' }, seed);
      const rh = new Set(onsets(ex, 'rh'));
      const last = ex.measures[ex.bars - 1].startTick;
      for (const t of onsets(ex, 'lh')) if (t < last) expect(rh.has(t)).toBe(false);
      for (const m of ex.measures) {
        const notesIn = (h: 'rh' | 'lh') => m[h].filter((e) => e.pitches.length).length;
        if (notesIn('rh') + notesIn('lh') >= 3) {
          expect(notesIn('rh')).toBeGreaterThan(0);
          expect(notesIn('lh')).toBeGreaterThan(0);
        }
      }
    }
  });

  it('polyrhythms are written in 3/4 with 3 against 2 per bar', () => {
    const ex = gen({ level: 95, hands: 'both', texture: 'poly3:2', timeSignature: '4/4' }, 4);
    expect(ex.timeSignature.id).toBe('3/4');
    for (const m of ex.measures.slice(0, -1)) {
      const counts = [m.rh.length, m.lh.length].sort();
      expect(counts).toEqual([2, 3]);
    }
    const four = gen({ level: 98, hands: 'both', texture: 'poly4:3' }, 4);
    const counts = [four.measures[0].rh.length, four.measures[0].lh.length].sort();
    expect(counts).toEqual([3, 4]);
  });

  it('chooses textures by level when auto', () => {
    const textures = (level: number) => new Set(SEEDS.map((s) => gen({ level, hands: 'both' }, s).rhythm.texture));
    expect([...textures(5)]).toEqual(['unison']);
    expect(textures(50).has('interlock')).toBe(true);
    expect(textures(97).has('poly4:3') || textures(97).has('poly3:2')).toBe(true);
    expect(gen({ level: 50, hands: 'rh' }, 1).rhythm.texture).toBeNull();
  });
});

describe('echo and pulse tasks', () => {
  it('echo alternates calls and identical responses', () => {
    const ex = gen({ level: 20, task: 'echo', bars: 8 }, 2);
    expect(ex.rhythm.echoBars).toBe(1);
    expect(ex.rhythm.callBars).toEqual([0, 2, 4, 6]);
    for (const call of ex.rhythm.callBars) {
      const shift = ex.timeSignature.ticksPerBar;
      const a = ex.measures[call].rh.map((e) => [e.startTick + shift, e.durationTicks, e.pitches.length]);
      const b = ex.measures[call + 1].rh.map((e) => [e.startTick, e.durationTicks, e.pitches.length]);
      expect(b).toEqual(a);
      expect(ex.measures[call].rh[0].pitches.length).toBe(1); // a call never starts with a rest
    }
    const longer = gen({ level: 50, task: 'echo', bars: 8 }, 2);
    expect(longer.rhythm.echoBars).toBe(2);
    expect(longer.rhythm.callBars).toEqual([0, 1, 4, 5]);
  });

  it('pulse silences whole bars, more of them at higher levels', () => {
    expect(gen({ level: 10, task: 'pulse', bars: 8 }, 1).rhythm.mutedBars).toEqual([2, 3, 6, 7]);
    expect(gen({ level: 40, task: 'pulse', bars: 8 }, 1).rhythm.mutedBars).toEqual([1, 2, 3, 5, 6, 7]);
    expect(gen({ level: 80, task: 'pulse', bars: 8 }, 1).rhythm.mutedBars).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(gen({ level: 80, task: 'pulse', bars: 4 }, 1).rhythm.mutedBars).toEqual([1, 2]);
    // Pulse keeps the rhythms simple: no sixteenths even at high levels.
    for (const seed of SEEDS.slice(0, 10)) {
      for (const e of allEvents(gen({ level: 90, task: 'pulse' }, seed))) expect(e.durationTicks).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('rhythm helpers', () => {
  it('splits silences into readable rests', () => {
    const ts = TIME_SIGNATURES['4/4'];
    expect(restSlots(0, 16, ts, 'x').map((s) => s.dur)).toEqual([16]);
    expect(restSlots(2, 16, ts, 'x').map((s) => s.dur)).toEqual([2, 4, 8]);
    expect(restSlots(4, 12, ts, 'x').map((s) => s.dur)).toEqual([4, 4]);
    expect(restSlots(1, 4, ts, 'x').map((s) => s.dur)).toEqual([1, 2]);
    expect(restSlots(2, 12, TIME_SIGNATURES['6/8'], 'x').map((s) => s.dur)).toEqual([2, 2, 6]);
  });

  it('classifies metric positions', () => {
    const ts = TIME_SIGNATURES['4/4'];
    expect([0, 4, 2, 3, 16].map((t) => beatPosition(t, ts))).toEqual(['downbeat', 'beat', 'offbeat', 'sixteenth', 'downbeat']);
    expect(beatPosition(6, TIME_SIGNATURES['6/8'])).toBe('beat');
    expect(beatPosition(2, TIME_SIGNATURES['6/8'])).toBe('offbeat');
  });
});

function fakeResult(ex: RhythmExercise, offsets: (step: number) => number | null): ExerciseResult {
  const notes: NoteResult[] = ex.steps.flatMap((s) =>
    s.notes.map((n) => {
      const d = offsets(s.index);
      return {
        midi: n.midi,
        hand: n.hand,
        clef: n.hand === 'rh' ? 'treble' : 'bass',
        correct: d !== null,
        deltaMs: d ?? undefined,
        timingScore: d === null ? undefined : Math.abs(d) < 40 ? 1 : 0.5,
        step: s.index,
      } satisfies NoteResult;
    }),
  );
  const hits = notes.filter((n) => n.correct);
  return {
    lesson: 'rhythm',
    mode: 'flow',
    exerciseId: ex.id,
    level: ex.meta.level,
    tierId: ex.meta.tierId,
    totalNotes: notes.length,
    correctNotes: hits.length,
    wrongNotes: 0,
    missedNotes: notes.length - hits.length,
    pitchAccuracy: hits.length / notes.length,
    timingAccuracy: hits.reduce((a, n) => a + (n.timingScore ?? 0), 0) / Math.max(1, hits.length),
    medianReactionMs: null,
    meanAbsTimingMs: null,
    cleanSteps: 0,
    totalSteps: ex.steps.length,
    durationMs: 10000,
    notes,
    completedAt: 0,
  };
}

describe('rhythm analysis and progress', () => {
  it('measures tendency, steadiness and pulse drift', () => {
    const ex = gen({ level: 10, task: 'pulse', bars: 8 }, 3);
    const muted = new Set(ex.rhythm.mutedBars);
    const raw = fakeResult(ex, (i) => (muted.has(ex.steps[i].measureIndex) ? -30 : 10));
    const notes = annotateRhythm(ex, raw.notes);
    expect(notes.every((n) => n.figure && n.beat)).toBe(true);
    expect(notes.some((n) => n.muted)).toBe(true);
    const sum = summarizeRhythm(ex, notes);
    expect(sum.driftMs).toBe(-40); // rushing when alone
    expect(sum.tendencyMs).toBeLessThan(0);
    expect(sum.steadinessMs).toBeGreaterThan(0);
    expect(sum.hands.rh?.hitRate).toBe(1);
  });

  it('needs timing to pass and records figure weak spots', () => {
    const ex = gen({ level: 20, task: 'read' }, 3);
    const sloppy = fakeResult(ex, () => 90);
    expect(sloppy.pitchAccuracy).toBe(1);
    expect(isPass(sloppy)).toBe(false); // all hits, but loose timing
    const tight = fakeResult(ex, () => 5);
    expect(isPass(tight)).toBe(true);

    let progress = emptyProgress();
    // Miss every eighth pair, nail everything else.
    for (let i = 0; i < 6; i++) {
      const e = gen({ level: 20 }, 100 + i);
      const eighthSteps = new Set(
        e.steps.filter((s) => s.notes.some((n) => allEvents(e).find((x) => x.id === n.eventId)?.figure === '2,2')).map((s) => s.index),
      );
      const raw = fakeResult(e, (step) => (eighthSteps.has(step) ? null : 0));
      const result = { ...raw, notes: annotateRhythm(e, raw.notes), rhythm: summarizeRhythm(e, annotateRhythm(e, raw.notes)) };
      progress = applyResult(progress, result, new Date(2026, 0, 1)).progress;
    }
    expect(progress.stats.rhythmFigure?.['2,2']).toBeDefined();
    expect(progress.stats.beatPosition?.downbeat).toBeDefined();
    expect(progress.stats.rhythmHand?.rh).toBeDefined();
    const weak = findWeakFigures(progress);
    expect(weak[0]?.key).toBe('2,2');
  });
});

describe('shared figure library with sight reading', () => {
  it('tags sight-reading events with figures and honours focus figures', () => {
    const settings = {
      level: 40,
      hands: 'rh' as const,
      bars: 8,
      keyId: 'auto',
      timeSignature: '4/4' as const,
      rhythmComplexity: 'auto' as const,
      maxPolyphony: 'auto' as const,
      bpm: null,
      keyboardSize: 88,
    };
    const count = (focus?: string[]) =>
      SEEDS.reduce(
        (n, seed) => n + allEvents(generateExercise({ ...settings, focusFigures: focus } as never, seed)).filter((e) => e.figure === '2,2,2,2').length,
        0,
      );
    const ex = generateExercise(settings as never, 1);
    expect(allEvents(ex).every((e) => typeof e.figure === 'string')).toBe(true);
    expect(count(['2,2,2,2'])).toBeGreaterThan(count() * 1.5);
  });
});
