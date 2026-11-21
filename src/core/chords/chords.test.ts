import { describe, expect, it } from 'vitest';
import { isSupportedDuration } from '../music/rhythm';
import { pitchLabel, spellMidiIn } from '../music/pitch';
import { findWeakChords } from '../progress/chords';
import { applyResult, emptyProgress, isPass } from '../progress/progress';
import { normalizeSettings } from '../settings';
import { chordResult, summarizeChords, weakChordLabel } from './analysis';
import {
  CHORD_SET_IDS,
  type ChordItem,
  chordSpelling,
  chordItemId,
  chordSymbol,
  keysFor,
  parseChordItemId,
  PROGRESSIONS,
  rootPitch,
} from './catalog';
import { bassOnlyWrong, ChordFlowEngine, ChordWaitEngine, matches } from './engine';
import { generateChordExercise } from './generator';
import { closeVoicing, minimalMovement, movement, smoothestVoicing } from './voicing';

const drill = (over: Partial<Extract<ChordItem, { task: 'drill' }>> = {}): ChordItem => ({
  task: 'drill',
  set: 'triads',
  prompt: 'symbol',
  inversions: 'root',
  drillHands: 'rh',
  ...over,
});
const prog = (progression: string, key = 'C', hands: 'rh' | 'lh-bass' = 'rh'): ChordItem => ({ task: 'progression', progression, key, hands });
const opts = { bpm: 60, count: 8 };

describe('chord catalog', () => {
  it('spells symbols, slash chords and qualities', () => {
    expect(chordSymbol({ root: rootPitch('C'), quality: 'maj', inversion: 0 })).toBe('C');
    expect(chordSymbol({ root: rootPitch('C'), quality: 'maj', inversion: 1 })).toBe('C/E');
    expect(chordSymbol({ root: rootPitch('F#'), quality: 'dim', inversion: 0 })).toBe('F♯°');
    expect(chordSymbol({ root: rootPitch('Bb'), quality: 'm7b5', inversion: 3 })).toBe('B♭ø7/A♭');
    expect(chordSymbol({ root: rootPitch('Eb'), quality: 'maj7', inversion: 2 })).toBe('E♭maj7/B♭');
  });

  it('item ids round-trip', () => {
    const items: ChordItem[] = [
      ...CHORD_SET_IDS.map((set) => drill({ set, prompt: 'notation', inversions: 'inversions' })),
      ...(['rh', 'lh', 'lh-bass'] as const).map((drillHands) => drill({ prompt: 'notation', drillHands })),
      ...PROGRESSIONS.flatMap((p) => keysFor(p.mode).map((k) => prog(p.id, k, 'lh-bass'))),
    ];
    for (const item of items) expect(parseChordItemId(chordItemId(item))).toEqual(item);
    expect(parseChordItemId('scales/C/major')).toBeNull();
    expect(parseChordItemId('chords/prog/andalusian/Db/rh')).toBeNull(); // not a minor key
  });

  it('keeps right-hand drill ids as they were, and gives hands only to notation drills', () => {
    // Ids saved before drills had hands still name the right-hand drill, so its progress carries on.
    expect(chordItemId(drill({ prompt: 'notation' }))).toBe('chords/drill/triads/notation/root');
    expect(parseChordItemId('chords/drill/triads/notation/root')).toEqual(drill({ prompt: 'notation' }));
    expect(chordItemId(drill({ prompt: 'notation', drillHands: 'lh' }))).toBe('chords/drill/triads/notation/root/lh');
    expect(chordItemId(drill({ prompt: 'notation', drillHands: 'lh-bass' }))).toBe('chords/drill/triads/notation/root/lh-bass');
    // Symbols are played with any hand: one item, whatever the setting says.
    expect(chordItemId(drill({ drillHands: 'lh' }))).toBe('chords/drill/triads/symbol/root');
    expect(parseChordItemId('chords/drill/triads/symbol/root/lh')).toBeNull();
    expect(parseChordItemId('chords/drill/triads/notation/root/rh')).toBeNull();
    expect(parseChordItemId('chords/drill/triads/notation/root/lh-bass/x')).toBeNull();
  });
});

describe('voicings', () => {
  it('builds close voicings and measures moves', () => {
    expect(closeVoicing([0, 4, 7], 4, 60)).toEqual([64, 67, 72]); // C/E
    expect(movement([60, 64, 67], [60, 65, 69])).toBe(3); // C → F/C
    expect(minimalMovement([60, 64, 67], [5, 9, 0])).toBe(3);
    expect(smoothestVoicing([60, 64, 67], [7, 11, 2], 55, 79)).toEqual([59, 62, 67]); // G/B
  });
});

describe('chord exercises', () => {
  it('drills fill one whole-note bar per chord without immediate repeats', () => {
    for (const set of CHORD_SET_IDS) {
      for (const inversions of ['any', 'root', 'inversions'] as const) {
        const ex = generateChordExercise(drill({ set, inversions }), { bpm: 60, count: 12 }, 7);
        expect(ex.chords.targets).toHaveLength(12);
        expect(ex.bars).toBe(12);
        ex.measures.forEach((m) => {
          expect(m.rh).toHaveLength(1);
          expect(isSupportedDuration(m.rh[0].durationTicks)).toBe(true);
          expect(m.rh[0].pitches.map((p) => p.midi)).toEqual(ex.chords.targets[m.index].voicing);
        });
        for (let i = 1; i < 12; i++) expect(ex.chords.targets[i].symbol).not.toBe(ex.chords.targets[i - 1].symbol);
        for (const t of ex.chords.targets) {
          expect(matches(t, t.voicing)).toBe(true);
          if (inversions === 'any') expect(t.bassPc).toBeNull();
          if (inversions === 'root') expect(t.spec.inversion).toBe(0);
        }
      }
    }
  });

  it('hides the symbol when reading the notation is the task', () => {
    expect(generateChordExercise(drill({ prompt: 'notation' }), opts, 1).measures[0].rh[0].symbol).toBeUndefined();
    expect(generateChordExercise(drill(), opts, 1).measures[0].rh[0].symbol).toBeTruthy();
  });

  it('spells progressions in the key with numerals and smooth voicings', () => {
    const ex = generateChordExercise(prog('ii-V-I', 'Bb'), opts, 1);
    expect(ex.chords.targets.slice(0, 4).map((t) => t.symbol)).toEqual(['Cm7', 'F7', 'B♭maj7', 'B♭maj7']);
    expect(ex.chords.targets).toHaveLength(8); // short progressions go around twice
    expect(ex.key.id).toBe('Bb');
    expect(ex.measures[0].rh[0].symbol).toBe('Cm7  ii7');
    // Every change moves the hand as little as possible.
    for (let i = 1; i < ex.chords.targets.length; i++) {
      const a = ex.chords.targets[i - 1];
      const b = ex.chords.targets[i];
      expect(movement(a.voicing, b.voicing)).toBe(minimalMovement(a.voicing, b.pcs));
    }
    const minor = generateChordExercise(prog('i-iv-V-i', 'A'), opts, 1);
    expect(minor.chords.targets.slice(0, 4).map((t) => t.symbol)).toEqual(['Am', 'Dm', 'E', 'Am']);
    expect(minor.measures[0].rh[0].pitches.map((p) => pitchLabel(p, true))).toEqual(['A3', 'C4', 'E4']);
  });

  it('adds a left-hand root on the bass staff', () => {
    const ex = generateChordExercise(prog('I-V-vi-IV', 'G', 'lh-bass'), opts, 1);
    expect(ex.staves).toEqual(['treble', 'bass']);
    for (const t of ex.chords.targets) {
      expect(t.bassMidi! % 12).toBe(t.spec.root.midi % 12);
      expect(t.bassMidi!).toBeLessThan(52);
      expect(t.bassPc).toBe(t.spec.root.midi % 12);
      expect(matches(t, [t.bassMidi!, ...t.voicing])).toBe(true);
      // Each hand is judged on its part, split between the bass and the right hand.
      expect(t.hands).toEqual({ lh: { pcs: [t.bassPc], bassPc: t.bassPc }, rh: { pcs: t.pcs, bassPc: null }, split: expect.any(Number) });
      expect(t.bassMidi!).toBeLessThan(t.hands!.split);
      expect(Math.min(...t.voicing)).toBeGreaterThanOrEqual(t.hands!.split);
    }
    // Right hand alone: judged as a whole, as before.
    expect(generateChordExercise(prog('I-V-vi-IV', 'G'), opts, 1).chords.targets.every((t) => t.hands === undefined)).toBe(true);
  });

  it('writes left-hand drill chords on the bass staff', () => {
    for (const inversions of ['any', 'root', 'inversions'] as const) {
      const ex = generateChordExercise(drill({ set: 'all-sevenths', prompt: 'notation', inversions, drillHands: 'lh' }), { bpm: 60, count: 16 }, 4);
      expect(ex.staves).toEqual(['bass']);
      expect(ex.hands).toBe('lh');
      ex.measures.forEach((m) => {
        const t = ex.chords.targets[m.index];
        expect(m.rh).toEqual([]);
        expect(m.lh).toHaveLength(1);
        expect(m.lh[0].hand).toBe('lh');
        expect(m.lh[0].symbol).toBeUndefined();
        expect(m.lh[0].pitches.map((p) => p.midi)).toEqual(t.voicing);
        expect(t.bassMidi).toBeNull();
        expect(matches(t, t.voicing)).toBe(true);
        // Within a ledger line or two of the bass staff: F2 up to E♭4.
        expect(Math.min(...t.voicing)).toBeGreaterThanOrEqual(41);
        expect(Math.max(...t.voicing)).toBeLessThanOrEqual(63);
      });
    }
  });

  it('writes LH-bass drill chords as a bass note under the other chord tones', () => {
    for (const inversions of ['any', 'root', 'inversions'] as const) {
      const ex = generateChordExercise(drill({ set: 'all-triads', prompt: 'notation', inversions, drillHands: 'lh-bass' }), { bpm: 60, count: 16 }, 9);
      expect(ex.staves).toEqual(['treble', 'bass']);
      expect(ex.hands).toBe('both');
      ex.measures.forEach((m) => {
        const t = ex.chords.targets[m.index];
        expect(m.rh[0].pitches.map((p) => p.midi)).toEqual(t.voicing);
        expect(m.lh[0].pitches.map((p) => p.midi)).toEqual([t.bassMidi]);
        // The left hand plays the bass the rule asks for (the root under root position and any
        // voicing); the right hand the other tones, none doubled, so the chord is only complete
        // with its last note.
        const bassPc = t.bassMidi! % 12;
        expect(bassPc).toBe(inversions === 'inversions' ? t.bassPc : t.spec.root.midi % 12);
        expect(t.voicing).toHaveLength(t.pcs.length - 1);
        expect(t.voicing.map((k) => k % 12)).not.toContain(bassPc);
        expect(new Set(t.voicing.map((k) => k % 12)).size).toBe(t.voicing.length);
        expect(t.bassMidi!).toBeLessThan(52);
        expect(t.bassMidi!).toBeLessThan(t.voicing[0]);
        expect(matches(t, [t.bassMidi!, ...t.voicing])).toBe(true);
        if (inversions === 'any') expect(t.bassPc).toBeNull();
      });
    }
  });

  it('weak-spot focus favors the qualities asked for', () => {
    const ex = generateChordExercise(drill({ set: 'all-triads' }), { bpm: 60, count: 16, focus: { qualities: { dim: 20 } } }, 3);
    expect(ex.chords.targets.filter((t) => t.spec.quality === 'dim').length).toBeGreaterThan(8);
  });
});

describe('chord engines', () => {
  const target = (pcs: number[], bassPc: number | null) => ({ pcs, bassPc });

  it('matches pitch classes in any octave, with the bass rule', () => {
    expect(matches(target([0, 4, 7], null), [52, 60, 67, 72])).toBe(true);
    expect(matches(target([0, 4, 7], 0), [52, 60, 67])).toBe(false);
    expect(bassOnlyWrong(target([0, 4, 7], 0), [52, 60, 67])).toBe(true);
    expect(matches(target([0, 4, 7], null), [60, 64])).toBe(false);
    expect(matches(target([0, 4, 7], null), [60, 64, 67, 69])).toBe(false);
  });

  it('judges each hand on its part when the target has hands', () => {
    // G with the LH root: G below the split, the whole chord above it.
    const g = { pcs: [7, 11, 2], bassPc: 7, hands: { lh: { pcs: [7], bassPc: 7 }, rh: { pcs: [7, 11, 2], bassPc: null }, split: 53 } };
    // Right hand alone: not complete, and not a wrong bass, whatever its lowest note.
    expect(matches(g, [59, 62, 67])).toBe(false);
    expect(bassOnlyWrong(g, [59, 62, 67])).toBe(false);
    expect(matches(g, [55, 59, 62])).toBe(false);
    // Both hands: complete, in any right-hand voicing, with the root doubled or not.
    expect(matches(g, [43, 59, 62, 67])).toBe(true);
    expect(matches(g, [31, 43, 59, 62, 67])).toBe(true);
    // Left hand first: not complete until the right hand has the whole chord.
    expect(matches(g, [43])).toBe(false);
    expect(matches(g, [43, 59, 62])).toBe(false);
    expect(bassOnlyWrong(g, [43, 59, 62])).toBe(false);
    // A chord tone other than the root in the left hand: wrong bass.
    expect(matches(g, [47, 59, 62, 67])).toBe(false);
    expect(bassOnlyWrong(g, [47, 59, 62, 67])).toBe(true);
    expect(bassOnlyWrong(g, [43, 50, 59, 62, 67])).toBe(true);
    // A key that is not in the chord is a wrong key, not a wrong bass.
    expect(bassOnlyWrong(g, [45, 59, 62, 67])).toBe(false);
    // Keys either side of the split: G3 below a split at 56 is the left hand's, at 55 the right hand's.
    expect(matches({ ...g, hands: { ...g.hands, split: 56 } }, [55, 59, 62, 67])).toBe(true);
    expect(matches({ ...g, hands: { ...g.hands, split: 55 } }, [55, 59, 62, 67])).toBe(false);
    // The right hand must have every chord tone itself: the left-hand root does not complete it.
    expect(matches(g, [43, 59, 62])).toBe(false);
  });

  it('Wait, + LH root: the right hand landing first does not count against a right chord (#74)', () => {
    const ts = generateChordExercise(prog('I-V-vi-IV', 'C', 'lh-bass'), opts, 1).chords.targets;
    expect(ts).toHaveLength(8);
    const run = (gapMs: number) => {
      const w = new ChordWaitEngine(ts);
      w.start(0);
      const types: string[] = [];
      ts.forEach((t, i) => {
        const at = 1000 * (i + 1);
        // gapMs > 0: the right hand lands first; < 0: the left hand does.
        const rh = gapMs > 0 ? at : at - gapMs;
        const lh = gapMs > 0 ? at + gapMs : at;
        const presses = [...t.voicing.map((k) => [k, rh] as const), [t.bassMidi!, lh] as const].sort((a, b) => a[1] - b[1]);
        for (const [k, time] of presses) types.push(w.noteOn(k, time).type);
        for (const k of [t.bassMidi!, ...t.voicing]) w.noteOff(k, at + 500);
      });
      return { w, types };
    };
    for (const gap of [15, 100, -15]) {
      const { w, types } = run(gap);
      expect(w.finished).toBe(true);
      expect(w.results.filter((j) => j.correct)).toHaveLength(8);
      expect(w.wrongPresses).toBe(0);
      expect(types.filter((t) => t === 'bass' || t === 'wrong')).toEqual([]);
      // Each chord is complete with both hands' keys, and the left hand's root is in its answer.
      w.results.forEach((j, i) => expect(j.played).toEqual([ts[i].bassMidi!, ...ts[i].voicing].sort((a, b) => a - b)));
    }
    // Voice leading reads the right hand from the split: the smooth voicings score full marks.
    const ex = generateChordExercise(prog('I-V-vi-IV', 'C', 'lh-bass'), opts, 1);
    expect(summarizeChords(ex, run(15).w.results, 'wait', 80).voiceLeading).toBe(1);
  });

  it('Wait, + LH root: a wrong left-hand note under a right right hand is a wrong bass', () => {
    const ts = generateChordExercise(prog('I-V-vi-IV', 'C', 'lh-bass'), opts, 1).chords.targets;
    const w = new ChordWaitEngine(ts);
    w.start(0);
    ts[0].voicing.forEach((k) => w.noteOn(k, 100)); // C E G in the right hand: not complete yet
    expect(w.index).toBe(0);
    expect(w.noteOn(43, 120)).toMatchObject({ type: 'bass', extraInLeftHand: false }); // G in the left hand
    w.noteOff(43, 200);
    expect(w.noteOn(ts[0].bassMidi!, 300).type).toBe('match');
    expect(w.results[0]).toMatchObject({ correct: false, wrongBass: true });
  });

  it('Wait, + LH root: only the root counts in the left hand; extra notes there say so', () => {
    const ts = generateChordExercise(prog('I-V-vi-IV', 'C', 'lh-bass'), opts, 1).chords.targets;
    const w = new ChordWaitEngine(ts);
    w.start(0);
    ts[0].voicing.forEach((k) => w.noteOn(k, 100));
    w.noteOn(ts[0].bassMidi!, 120);
    expect(w.index).toBe(1); // C under C E G
    [ts[0].bassMidi!, ...ts[0].voicing].forEach((k) => w.noteOff(k, 300));
    // G: a fifth above the root in the left hand is not what is written.
    expect(ts[1].bassMidi! + 7).toBeLessThan(ts[1].hands!.split);
    w.noteOn(ts[1].bassMidi!, 400);
    w.noteOn(ts[1].bassMidi! + 7, 400);
    const r = ts[1].voicing.map((k) => w.noteOn(k, 420)).pop();
    expect(r).toMatchObject({ type: 'bass', extraInLeftHand: true });
    expect(w.index).toBe(1);
    w.noteOff(ts[1].bassMidi! + 7, 500);
    expect(w.index).toBe(2); // letting go of the fifth leaves the chord as written
    expect(w.results[1]).toMatchObject({ correct: false, wrongBass: true });
  });

  it('Wait: advances on the chord, counts wrong keys and wrong bass, needs a re-strike for repeats', () => {
    const ex = generateChordExercise(prog('ii-V-I', 'C'), opts, 1);
    const ts = ex.chords.targets;
    const w = new ChordWaitEngine(ts);
    w.start(0);
    const play = (keys: number[], t: number) => keys.map((k) => w.noteOn(k, t));
    const release = (keys: number[], t: number) => keys.forEach((k) => w.noteOff(k, t));
    play(ts[0].voicing, 500);
    expect(w.index).toBe(1);
    release(ts[0].voicing, 600);
    expect(w.noteOn(61, 700).type).toBe('wrong');
    w.noteOff(61, 750);
    play(ts[1].voicing, 900);
    expect(w.results[1]).toMatchObject({ correct: false, wrongPresses: 1 });
    release(ts[1].voicing, 1000);
    play(ts[2].voicing, 1500);
    expect(w.index).toBe(3);
    // Same chord again: still held, so nothing happens until it is played again.
    expect(w.index).toBe(3);
    release(ts[2].voicing, 1600);
    expect(w.index).toBe(3);
    play(ts[3].voicing, 2000);
    expect(w.index).toBe(4);
    expect(w.results[0].reactionMs).toBe(500);

    const inv = new ChordWaitEngine([{ ...ts[0], bassPc: 5 }]); // ask for Dm7/F
    inv.start(0);
    const r = [62, 65, 69].map((k) => inv.noteOn(k, 10)).pop();
    expect(r?.type).toBe('none');
    expect(inv.noteOn(72, 20).type).toBe('bass'); // D F A C: right notes, D in the bass
  });

  it('Wait: a hint costs the chord its first-time credit and is reported', () => {
    const ex = generateChordExercise(drill(), opts, 3);
    const ts = ex.chords.targets;
    const w = new ChordWaitEngine(ts);
    w.start(0);
    w.assist();
    w.assist(); // once per chord
    ts.forEach((t, i) => {
      t.voicing.forEach((k) => w.noteOn(k, 500 * (i + 1)));
      t.voicing.forEach((k) => w.noteOff(k, 500 * (i + 1) + 100));
    });
    expect(w.finished).toBe(true);
    expect(w.results[0]).toMatchObject({ correct: false, hinted: true, wrongPresses: 0 });
    expect(w.results[1]).toMatchObject({ correct: true, hinted: false });
    expect(w.hintCount).toBe(1);
    const result = chordResult(ex, w.results, { mode: 'wait', goalBpm: 80, durationMs: 1000, wrongPresses: 0, completedAt: 0 });
    expect(result.hints).toBe(1);
    expect(result.chords!.trouble).toContainEqual({ symbol: ts[0].symbol, reason: 'hint' });
    expect(result.chords!.trouble.some((t) => t.reason === 'retry')).toBe(false);
  });

  it('Flow: judges each bar, allows held common tones, measures timing and spread', () => {
    const ex = generateChordExercise(prog('I-IV-V-I', 'C'), opts, 1);
    const ts = ex.chords.targets;
    const f = new ChordFlowEngine(ts, { barMs: 4000, latencyMs: 0 });
    f.setStartTime(1000);
    // Chord 0 on time, rolled by 60 ms.
    ts[0].voicing.forEach((k, i) => f.noteOn(k, 1000 + i * 30));
    // Chord 1: keep the common tone, move the others 50 ms late.
    const common = ts[0].voicing.filter((k) => ts[1].voicing.includes(k));
    ts[0].voicing.filter((k) => !common.includes(k)).forEach((k) => f.noteOff(k, 4900));
    ts[1].voicing.filter((k) => !common.includes(k)).forEach((k) => f.noteOn(k, 5050));
    // Chord 2 missed entirely (nothing new played, old keys released).
    ts[1].voicing.forEach((k) => f.noteOff(k, 8500));
    const out = f.update(1000 + 2 * 4000 + 500);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ correct: true, spreadMs: 60, deltaMs: 30 });
    expect(out[1]).toMatchObject({ correct: true, deltaMs: 50 });
    expect(out[2].correct).toBe(false);
  });

  it('keeps running until the last chord has sounded for its whole bar', () => {
    const ex = generateChordExercise(prog('I-IV-V-I', 'C'), opts, 1);
    const ts = ex.chords.targets;
    const f = new ChordFlowEngine(ts, { barMs: 4000, latencyMs: 0 });
    f.setStartTime(1000);
    const lastBar = 1000 + (ts.length - 1) * 4000;
    f.update(lastBar + 1000);
    expect(f.isFinished(lastBar + 1000)).toBe(false);
    expect(f.isFinished(lastBar + 4000)).toBe(true);
  });
});

describe('chord analysis and progress', () => {
  it('summarizes a Flow run, measures voice leading and moves the ladder', () => {
    const ex = generateChordExercise(prog('I-V-vi-IV', 'C'), opts, 1);
    const ts = ex.chords.targets;
    const judgments = ts.map((t, i) => ({
      index: i,
      correct: true,
      deltaMs: 10,
      spreadMs: 20,
      timingScore: 1,
      played: i === 3 ? t.voicing.map((m) => m + 12) : t.voicing, // one big jump
      wrongPresses: 0,
      wrongBass: false,
    }));
    const s = summarizeChords(ex, judgments, 'flow', 80);
    expect(s.clean).toBe(true);
    expect(s.voiceLeading).toBeLessThan(1);
    expect(s.movement!.played).toBeGreaterThan(s.movement!.minimal);
    expect(s.spreadMs).toBe(20);
    const result = chordResult(ex, judgments, { mode: 'flow', goalBpm: 80, durationMs: 32000, wrongPresses: 0, completedAt: 0 });
    expect(isPass(result)).toBe(true);
    const { progress, award } = applyResult(emptyProgress(), result, new Date(2026, 10, 13));
    expect(award.repertoire).toMatchObject({ itemId: 'chords/prog/I-V-vi-IV/C/rh', fromTempo: 60, toTempo: 64, clean: true });
    expect(progress.repertoire['chords/prog/I-V-vi-IV/C/rh'].ladderTempo).toBe(64);
    expect(progress.stats.chordQuality.maj.attempts).toBe(6);
    expect(progress.tiers).toEqual({});
  });

  it('flags missed chords, wrong bass and slow chords, and finds weak qualities', () => {
    const ex = generateChordExercise(drill({ set: 'all-triads', inversions: 'inversions' }), { bpm: 60, count: 8 }, 5);
    const ts = ex.chords.targets;
    const judgments = ts.map((t, i) => ({
      index: i,
      correct: i !== 2,
      reactionMs: i === 5 ? 9000 : 1000,
      played: t.voicing,
      wrongPresses: i === 2 ? 1 : 0,
      wrongBass: i === 2,
    }));
    const s = summarizeChords(ex, judgments, 'wait', 80);
    expect(s.trouble[0]).toMatchObject({ symbol: ts[2].symbol, reason: 'bass' });
    expect(s.medianReactionMs).toBe(1000);
    expect(s.trouble).toContainEqual({ symbol: ts[5].symbol, reason: 'slow', ms: 9000 });
    const weakRun = judgments.map((j, i) => ({ ...j, correct: ts[i].spec.quality !== ts[0].spec.quality }));
    let p = emptyProgress();
    for (let k = 0; k < 4; k++) {
      p = applyResult(p, chordResult(ex, weakRun, { mode: 'wait', goalBpm: 80, durationMs: 1000, wrongPresses: 1, completedAt: 0 }), new Date(2026, 10, 13)).progress;
    }
    expect(findWeakChords(p, 4).some((w) => w.dimension === 'chordQuality' && w.key === ts[0].spec.quality)).toBe(true);
    // Symbol drills say nothing about reading in a clef.
    expect(p.stats.chordHands).toBeUndefined();
  });

  it('records the reading hand for notation drills and finds a weak left hand', () => {
    const run = (drillHands: 'rh' | 'lh', correct: boolean) => {
      const ex = generateChordExercise(drill({ prompt: 'notation', drillHands }), { bpm: 60, count: 8 }, 2);
      const judgments = ex.chords.targets.map((t, i) => ({ index: i, correct, reactionMs: 1000, played: t.voicing, wrongPresses: correct ? 0 : 1, wrongBass: false }));
      return chordResult(ex, judgments, { mode: 'wait', goalBpm: 80, durationMs: 1000, wrongPresses: 0, completedAt: 0 });
    };
    let p = emptyProgress();
    for (const result of [run('rh', true), run('lh', false)]) p = applyResult(p, result, new Date(2026, 10, 13)).progress;
    expect(p.stats.chordHands.rh).toMatchObject({ attempts: 8, correct: 8 });
    expect(p.stats.chordHands.lh).toMatchObject({ attempts: 8, correct: 0 });
    const weak = findWeakChords(p, 4).filter((w) => w.dimension === 'chordHands');
    expect(weak.map((w) => w.key)).toEqual(['lh']);
    expect(weakChordLabel(weak[0])).toBe('Left-hand chords');
    // Progressions don't record it either.
    const prog1 = generateChordExercise(prog('I-IV-V-I'), opts, 1);
    const judged = prog1.chords.targets.map((t, i) => ({ index: i, correct: true, reactionMs: 1000, played: t.voicing, wrongPresses: 0, wrongBass: false }));
    expect(summarizeChords(prog1, judged, 'wait', 80).outcomes.every((o) => o.readHands === undefined)).toBe(true);
  });

  it('keeps progression and key consistent in settings', () => {
    expect(normalizeSettings({ chords: { progression: 'andalusian', key: 'Db' } }).chords.key).toBe('A');
    expect(normalizeSettings({ chords: { progression: 'nope' } }).chords.progression).toBe('I-IV-V-I');
    expect(normalizeSettings({ chords: { key: 'shuffle' } }).chords.key).toBe('shuffle');
  });

  it('defaults drill hands to the right hand', () => {
    expect(normalizeSettings({}).chords.drillHands).toBe('rh');
    expect(normalizeSettings({ chords: { drillHands: 'lh' } }).chords.drillHands).toBe('lh');
    expect(normalizeSettings({ chords: { drillHands: 'lh-bass' } }).chords.drillHands).toBe('lh-bass');
    expect(normalizeSettings({ chords: { drillHands: 'both' } }).chords.drillHands).toBe('rh');
  });
});

describe('chord spelling on the keys', () => {
  it('spells each key as the chord asked for spells it, octave from the letter', () => {
    const db7 = chordSpelling({ root: rootPitch('Db'), quality: '7' });
    const label = (midi: number) => pitchLabel(spellMidiIn(midi, false, db7), true);
    expect([61, 65, 68, 71].map(label)).toEqual(['D♭4', 'F4', 'A♭4', 'C♭5']);
    expect(label(59)).toBe('C♭4'); // the B below middle C
    // Keys outside the chord keep the usual spelling.
    expect(label(62)).toBe('D4');
    expect(label(63)).toBe('D♯4');
    expect(pitchLabel(spellMidiIn(63, true, db7), true)).toBe('E♭4');
    const fs = chordSpelling({ root: rootPitch('F#'), quality: 'maj' });
    expect(pitchLabel(spellMidiIn(70, true, fs), true)).toBe('A♯4');
  });
});
