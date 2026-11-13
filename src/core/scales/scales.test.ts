import { describe, expect, it } from 'vitest';
import { allEvents, type Hand } from '../exercise';
import { FlowEngine } from '../eval/flowEngine';
import type { ExerciseResult, NoteResult } from '../eval/types';
import { isSupportedDuration } from '../music/rhythm';
import { pitchLabel } from '../music/pitch';
import { applyResult, emptyProgress } from '../progress/progress';
import { normalizeSettings } from '../settings';
import { summarizeScale } from './analysis';
import { itemId, itemTitle, parseItemId, SCALE_TYPE_IDS, SCALE_TYPES, type ScaleItem, type NoteValue } from './catalog';
import { crossingAt } from './fingering';
import { generateScaleExercise, initialNpm, type ScaleExercise } from './generator';
import { applyRepertoireRun, dueItems, REVIEW_DAYS } from './repertoire';

function gen(item: Partial<ScaleItem>, octaves = 1, noteValue: NoteValue = 'eighth', npm = 240): ScaleExercise {
  return generateScaleExercise({ type: 'major', tonic: 'C', hands: 'rh', ...item }, { octaves, noteValue, npm });
}

function line(ex: ScaleExercise, hand: Hand) {
  return allEvents(ex)
    .filter((e) => e.hand === hand && e.pitches.length)
    .sort((a, b) => a.startTick - b.startTick);
}

const names = (ex: ScaleExercise, hand: Hand = 'rh') => line(ex, hand).map((e) => pitchLabel(e.pitches[0], true));
const fingers = (ex: ScaleExercise, hand: Hand = 'rh') => line(ex, hand).map((e) => e.fingers?.[0]);

describe('scale spelling', () => {
  it('C major, one octave up and down, with standard fingering', () => {
    const ex = gen({});
    expect(names(ex)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4']);
    expect(fingers(ex)).toEqual([1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]);
    const lh = gen({ hands: 'lh' });
    expect(fingers(lh, 'lh')).toEqual([5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5]);
    expect(ex.key.id).toBe('C');
  });

  it('spells minor forms and the blues scale by direction', () => {
    expect(names(gen({ type: 'harmonic-minor', tonic: 'G#' })).slice(0, 8)).toEqual(['G♯4', 'A♯4', 'B4', 'C♯5', 'D♯5', 'E5', 'F𝄪5', 'G♯5']);
    const mel = names(gen({ type: 'melodic-minor', tonic: 'A' }));
    expect(mel.slice(5, 7)).toEqual(['F♯5', 'G♯5']); // raised going up
    expect(mel.slice(8, 10)).toEqual(['G5', 'F5']); // natural coming down
    const blues = names(gen({ type: 'blues', tonic: 'A' }));
    expect(blues).toContain('D♯5');
    expect(blues).toContain('E♭5');
    const chrom = names(gen({ type: 'chromatic', tonic: 'C' }));
    expect(chrom[1]).toBe('C♯4');
    expect(chrom[chrom.length - 2]).toBe('D♭4');
  });

  it('arpeggios: dominant 7th starts on the 5th, diminished 7th on the leading note', () => {
    expect(names(gen({ type: 'arp-dom7', tonic: 'C' })).slice(0, 5)).toEqual(['G4', 'B4', 'D5', 'F5', 'G5']);
    expect(names(gen({ type: 'arp-dim7', tonic: 'C' })).slice(0, 4)).toEqual(['B4', 'D5', 'F5', 'A♭5']);
    const triad = gen({ type: 'arp-major', tonic: 'Ab' }, 1, 'eighth');
    expect(triad.timeSignature.id).toBe('6/8');
    expect(triad.scale.notesPerBeat).toBe(3);
    expect(gen({ type: 'arp-minor', tonic: 'A' }, 1, 'quarter').timeSignature.id).toBe('3/4');
  });

  it('every type, key, hands, range and note value fills its bars exactly', () => {
    for (const type of SCALE_TYPE_IDS) {
      for (const tonic of SCALE_TYPES[type].tonics) {
        for (const hands of ['rh', 'lh', 'together', ...(SCALE_TYPES[type].contrary ? ['contrary' as const] : [])] as const) {
          for (const octaves of [1, 2]) {
            for (const nv of ['quarter', 'eighth', 'sixteenth'] as const) {
              const ex = gen({ type, tonic, hands }, octaves, nv);
              for (const m of ex.measures) {
                for (const h of ['rh', 'lh'] as const) {
                  if (!m[h].length) continue;
                  expect(m[h].reduce((a, e) => a + e.durationTicks, 0)).toBe(ex.timeSignature.ticksPerBar);
                  for (const e of m[h]) expect(isSupportedDuration(e.durationTicks)).toBe(true);
                }
              }
              const rh = line(ex, hands === 'lh' ? 'lh' : 'rh').map((e) => e.pitches[0].midi);
              const top = rh.indexOf(Math.max(...rh));
              // Up to the top, then back down, ending where it started.
              for (let i = 1; i < rh.length; i++) expect(Math.sign(rh[i] - rh[i - 1])).toBe(i <= top ? 1 : -1);
              expect(rh[rh.length - 1]).toBe(rh[0]);
              expect(Math.max(...rh) - Math.min(...rh)).toBe(12 * octaves);
              expect(ex.range.min).toBeGreaterThanOrEqual(24);
              expect(ex.range.max).toBeLessThanOrEqual(96);
            }
          }
        }
      }
    }
  });

  it('has standard fingering for major and minor scales in every key', () => {
    for (const type of ['major', 'harmonic-minor'] as const) {
      for (const tonic of SCALE_TYPES[type].tonics) {
        const ex = gen({ type, tonic, hands: 'together' }, 2);
        expect(fingers(ex, 'rh').every((f) => f !== undefined)).toBe(true);
        expect(fingers(ex, 'lh').every((f) => f !== undefined)).toBe(true);
        // Fingering is the same going up and coming down.
        const f = fingers(ex, 'rh');
        expect(f).toEqual([...f].reverse());
      }
    }
    expect(gen({ type: 'blues', tonic: 'A' }).scale.hasFingering).toBe(false);
  });

  it('contrary motion: both hands start on the same key and move apart', () => {
    const ex = gen({ hands: 'contrary' }, 1);
    expect(names(ex, 'rh')[0]).toBe(names(ex, 'lh')[0]);
    expect(names(ex, 'lh')[7]).toBe('C3');
    expect(fingers(ex, 'lh')[0]).toBe(1);
    // The shared first note is one expected key in Flow mode.
    const flow = new FlowEngine(ex.steps, { msPerTick: 100, latencyMs: 0, sustainCountsAsHeld: false });
    flow.setStartTime(0);
    flow.noteOn(60, 0);
    expect(flow.liveStats().correct).toBe(1);
    expect(flow.liveStats().wrong).toBe(0);
  });

  it('item ids round-trip', () => {
    const item: ScaleItem = { type: 'harmonic-minor', tonic: 'F#', hands: 'together' };
    expect(parseItemId(itemId(item))).toEqual(item);
    expect(parseItemId('nope/C/rh')).toBeNull();
  });

  it('tempo follows the ladder in notes per minute', () => {
    expect(gen({}, 1, 'eighth', 240).bpm).toBe(120);
    expect(gen({}, 1, 'sixteenth', 240).bpm).toBe(60);
    expect(initialNpm({ type: 'major' }, 'eighth')).toBe(120);
  });
});

describe('crossings', () => {
  it('recognises thumb-under and finger-over in both hands', () => {
    expect(crossingAt('rh', 3, 1, true)).toBe('thumb-under');
    expect(crossingAt('rh', 1, 3, false)).toBe('finger-over');
    expect(crossingAt('rh', 1, 2, true)).toBeNull();
    expect(crossingAt('lh', 1, 3, true)).toBe('finger-over');
    expect(crossingAt('lh', 3, 1, false)).toBe('thumb-under');
  });
});

function fakeRun(ex: ScaleExercise, delta: (hand: Hand, i: number, finger?: number) => number | null, velocity: (finger?: number) => number = () => 64): ExerciseResult {
  const notes: NoteResult[] = [];
  for (const hand of ['rh', 'lh'] as const) {
    line(ex, hand).forEach((e, i) => {
      const step = ex.steps.find((s) => s.tick === e.startTick)!;
      if (notes.some((n) => n.step === step.index && n.midi === e.pitches[0].midi)) return;
      const d = delta(hand, i, e.fingers?.[0]);
      notes.push({
        midi: e.pitches[0].midi,
        hand,
        clef: hand === 'rh' ? 'treble' : 'bass',
        correct: d !== null,
        deltaMs: d ?? undefined,
        timingScore: d === null ? undefined : 1,
        velocity: d === null ? undefined : velocity(e.fingers?.[0]),
        step: step.index,
      });
    });
  }
  const hits = notes.filter((n) => n.correct).length;
  return {
    lesson: 'scales',
    mode: 'flow',
    exerciseId: ex.id,
    level: 1,
    tierId: 'sc',
    totalNotes: notes.length,
    correctNotes: hits,
    wrongNotes: 0,
    missedNotes: notes.length - hits,
    pitchAccuracy: hits / notes.length,
    timingAccuracy: 1,
    medianReactionMs: null,
    meanAbsTimingMs: 5,
    cleanSteps: 0,
    totalSteps: ex.steps.length,
    durationMs: 5000,
    notes,
    completedAt: 0,
  };
}

describe('scale analysis', () => {
  it('finds a recurring timing bump at the thumb crossing, thumb accents and hand sync', () => {
    const ex = gen({ hands: 'together' }, 2);
    // RH: late every time the thumb passes under going up.
    const rhLine = line(ex, 'rh');
    const raw = fakeRun(
      ex,
      (hand, i) => {
        if (hand === 'lh') return 12;
        const e = rhLine[i];
        const prev = rhLine[i - 1];
        const up = prev ? e.pitches[0].midi > prev.pitches[0].midi : true;
        return up && e.fingers?.[0] === 1 && prev?.fingers?.[0] === 3 ? 60 : 0;
      },
      (finger) => (finger === 1 ? 90 : 60),
    );
    const sum = summarizeScale(ex, raw, 240);
    expect(sum.clean).toBe(true);
    expect(sum.bumps[0]).toMatchObject({ hand: 'rh', crossing: 'thumb-under', finger: 1 });
    expect(sum.bumps[0].label).toBe('F ↑');
    expect(itemTitle('arp-dom7', 'F')).toBe('Dominant 7th in F (C7)');
    expect(itemTitle('arp-dim7', 'G#')).toBe('Diminished 7th in G♯ minor (on F𝄪)');
    expect(sum.thumbAccent).toBe(true);
    expect(sum.velocitySpread).toBeGreaterThan(0.1);
    expect(sum.syncMs).toBeGreaterThan(0);
  });
});

describe('repertoire ladder and review', () => {
  const summary = (clean: boolean, npm = 240) => ({
    itemId: 'major/C/rh',
    npm,
    notesPerBeat: 2,
    goalNpm: 240,
    clean,
    steadinessMs: 10,
    velocitySpread: 0.1,
    thumbAccent: false,
    syncMs: null,
    bumps: [],
  });

  it('moves up after clean runs, down after messy ones, and masters at the goal tempo', () => {
    const now = Date.UTC(2026, 0, 1);
    let r = applyRepertoireRun(undefined, { mode: 'flow', accuracy: 1, ladder: summary(true, 200) }, now);
    expect(r.change.toNpm).toBe(208); // +4 bpm in eighths
    expect(r.item.box).toBe(1);
    expect(r.change.dueInDays).toBe(REVIEW_DAYS[1]);
    r = applyRepertoireRun(r.item, { mode: 'flow', accuracy: 0.7, ladder: summary(false, 208) }, now);
    expect(r.item.ladderNpm).toBe(200);
    expect(r.item.box).toBe(0);
    r = applyRepertoireRun(r.item, { mode: 'flow', accuracy: 1, ladder: summary(true, 240) }, now);
    expect(r.change.newlyMastered).toBe(true);
    // Learning runs don't move the ladder.
    const w = applyRepertoireRun(r.item, { mode: 'wait', accuracy: 1, ladder: summary(false, 240) }, now);
    expect(w.item.ladderNpm).toBe(r.item.ladderNpm);
  });

  it('lists due items, most overdue first', () => {
    const base = { attempts: 1, cleanRuns: 0, ladderNpm: 120, bestCleanNpm: 0, box: 0, lastAt: 0, accuracy: 0.8, mastered: false };
    const items = { a: { ...base, dueAt: 50 }, b: { ...base, dueAt: 10 }, c: { ...base, dueAt: 500 } };
    expect(dueItems(items, 100)).toEqual(['b', 'a']);
  });

  it('records runs in progress without touching level tiers', () => {
    const ex = gen({}, 1, 'eighth', 120);
    const raw = fakeRun(ex, () => 0);
    const result = { ...raw, scale: summarizeScale(ex, raw, 240) };
    const { progress, award } = applyResult(emptyProgress(), result, new Date(2026, 0, 1));
    expect(progress.repertoire['major/C/rh'].ladderNpm).toBe(128);
    expect(award.repertoire?.toNpm).toBe(128);
    expect(award.xp).toBeGreaterThan(0);
    expect(Object.keys(progress.tiers)).toEqual([]);
    expect(progress.stats.scaleKey?.C).toBeDefined();
  });
});

describe('scale settings', () => {
  it('keeps type, key and hands consistent', () => {
    expect(normalizeSettings({ scaleType: 'harmonic-minor', scaleTonic: 'Db' }).scaleTonic).toBe('A');
    expect(normalizeSettings({ scaleType: 'blues', scaleHands: 'contrary' }).scaleHands).toBe('together');
    expect(normalizeSettings({ scaleTonic: 'shuffle' }).scaleTonic).toBe('shuffle');
  });
});
