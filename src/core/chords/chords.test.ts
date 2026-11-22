import { describe, expect, it } from 'vitest';
import { isSupportedDuration } from '../music/rhythm';
import { pitchLabel, spellMidiIn } from '../music/pitch';
import { KEYBOARD_RANGES, KEYBOARD_SIZES } from '../keyboard/range';
import { findWeakChords } from '../progress/chords';
import { applyResult, emptyProgress, isPass } from '../progress/progress';
import { normalizeSettings } from '../settings';
import { chordResult, summarizeChords, weakChordLabel } from './analysis';
import {
  CHORD_SET_IDS,
  type ChordItem,
  chordSpelling,
  chordItemId,
  chordItemTitle,
  chordSymbol,
  keysFor,
  parseChordItemId,
  PROGRESSIONS,
  rootPitch,
  SEQUENCE_CHORDS,
  SEQUENCE_HANDS,
  type SequenceChord,
  type SequenceHands,
  sequenceKeys,
} from './catalog';
import { bassOnlyWrong, ChordFlowEngine, ChordWaitEngine, matches, wrongBassKey, wrongKey } from './engine';
import { generateChordExercise, ledgerLines } from './generator';
import { closeVoicing, minimalMovement, movement, smoothestVoicing } from './voicing';

const drill = (over: Partial<Extract<ChordItem, { task: 'drill' }>> = {}): ChordItem => ({
  task: 'drill',
  set: 'triads',
  prompt: 'symbol',
  inversions: 'root',
  drillHands: 'rh',
  ...over,
});
const prog = (progression: string, key = 'C', hands: 'rh' | 'lh-bass' = 'rh', notation = true): ChordItem => ({ task: 'progression', progression, key, hands, notation });
const seq = (key = 'C', hands: SequenceHands = 'rh', chord: SequenceChord = 'maj', notation = true): ChordItem => ({ task: 'sequence', chord, key, hands, notation });
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
      ...(['rh', 'lh', 'lh-bass', 'both'] as const).flatMap((drillHands) => [drill({ prompt: 'notation', drillHands }), drill({ prompt: 'notation', inversions: 'inversions', drillHands })]),
      ...PROGRESSIONS.flatMap((p) => keysFor(p.mode).flatMap((k) => [prog(p.id, k, 'lh-bass'), prog(p.id, k, 'rh', false)])),
      ...SEQUENCE_CHORDS.flatMap((chord) => sequenceKeys(chord).flatMap((k) => [...SEQUENCE_HANDS.map((h) => seq(k, h, chord)), seq(k, 'rh', chord, false)])),
    ];
    for (const item of items) expect(parseChordItemId(chordItemId(item))).toEqual(item);
    expect(parseChordItemId('scales/C/major')).toBeNull();
    // From the chart: symbols only, any hand.
    expect(chordItemId(prog('canon', 'Eb', 'lh-bass', false))).toBe('chords/prog/canon/Eb/chart');
    expect(parseChordItemId('chords/prog/canon/Eb/chart')).toEqual(prog('canon', 'Eb', 'rh', false));
    // Notes show one voicing: "any voicing" is for symbols.
    expect(chordItemId(drill({ prompt: 'notation', inversions: 'any' }))).toBe('chords/drill/triads/notation/root');
    expect(parseChordItemId('chords/drill/triads/notation/any')).toBeNull();
    expect(parseChordItemId('chords/drill/triads/symbol/any')).toEqual(drill({ inversions: 'any' }));
    expect(parseChordItemId('chords/prog/andalusian/Db/rh')).toBeNull(); // not a minor key
    // Inversions in sequence: from symbols any hand plays, so the hands are not part of the item.
    expect(chordItemId(seq('Eb', 'both', 'min'))).toBe('chords/seq/min/Eb/both');
    expect(chordItemId(seq('Eb', 'both', 'min', false))).toBe('chords/seq/min/Eb/chart');
    expect(parseChordItemId('chords/seq/min/Db/rh')).toBeNull(); // C♯ minor, not D♭ minor
    expect(parseChordItemId('chords/seq/maj/C/lh-bass')).toBeNull();
    expect(parseChordItemId('chords/seq/dim/C/rh')).toBeNull();
    expect(chordItemTitle(seq('F#', 'rh'))).toBe('F♯ major inversions');
    expect(chordItemTitle(seq('C#', 'both', 'min'))).toBe('C♯ minor inversions · hands together');
    expect(chordItemTitle(seq('C', 'lh', 'maj', false))).toBe('C major inversions · from symbols');
  });

  it('keeps right-hand drill ids as they were, and gives hands only to notation drills', () => {
    // Ids saved before drills had hands still name the right-hand drill, so its progress carries on.
    expect(chordItemId(drill({ prompt: 'notation' }))).toBe('chords/drill/triads/notation/root');
    expect(parseChordItemId('chords/drill/triads/notation/root')).toEqual(drill({ prompt: 'notation' }));
    expect(chordItemId(drill({ prompt: 'notation', drillHands: 'lh' }))).toBe('chords/drill/triads/notation/root/lh');
    expect(chordItemId(drill({ prompt: 'notation', drillHands: 'lh-bass' }))).toBe('chords/drill/triads/notation/root/lh-bass');
    expect(chordItemId(drill({ prompt: 'notation', inversions: 'inversions', drillHands: 'both' }))).toBe('chords/drill/triads/notation/inversions/both');
    expect(chordItemId(drill({ drillHands: 'both' }))).toBe('chords/drill/triads/symbol/root');
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
    }
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

  it('writes LH-bass drill chords as a bass note under the whole chord in the right hand', () => {
    for (const inversions of ['root', 'inversions'] as const) {
      const ex = generateChordExercise(drill({ set: 'all-triads', prompt: 'notation', inversions, drillHands: 'lh-bass' }), { bpm: 60, count: 16 }, 9);
      expect(ex.staves).toEqual(['treble', 'bass']);
      expect(ex.hands).toBe('both');
      ex.measures.forEach((m) => {
        const t = ex.chords.targets[m.index];
        expect(m.rh[0].pitches.map((p) => p.midi)).toEqual(t.voicing);
        expect(m.lh[0].pitches.map((p) => p.midi)).toEqual([t.bassMidi]);
        // The left hand plays the bass the rule asks for (the root under root position); the right
        // hand the whole chord in close root position (C/G: G under C–E–G).
        const bassPc = t.bassMidi! % 12;
        expect(bassPc).toBe(inversions === 'inversions' ? t.bassPc : t.spec.root.midi % 12);
        expect(t.voicing).toEqual(closeVoicing(t.pcs, t.spec.root.midi % 12, 57));
        expect(t.lhChord).toBeNull();
        expect(t.bassMidi!).toBeLessThan(52);
        expect(t.bassMidi!).toBeLessThan(t.voicing[0]);
        expect(matches(t, [t.bassMidi!, ...t.voicing])).toBe(true);
      });
    }
  });

  it('writes hands-together drill chords in both hands, an octave apart', () => {
    for (const inversions of ['root', 'inversions'] as const) {
      const ex = generateChordExercise(drill({ set: 'all-sevenths', prompt: 'notation', inversions, drillHands: 'both' }), { bpm: 60, count: 16 }, 5);
      expect(ex.staves).toEqual(['treble', 'bass']);
      expect(ex.hands).toBe('both');
      ex.measures.forEach((m) => {
        const t = ex.chords.targets[m.index];
        expect(m.rh[0].pitches.map((p) => p.midi)).toEqual(t.voicing);
        expect(m.lh[0].pitches.map((p) => p.midi)).toEqual(t.lhChord);
        expect(m.rh[0].symbol).toBeUndefined();
        expect(t.bassMidi).toBeNull();
        // The same close voicing (and inversion) in each hand, the right hand an octave higher.
        expect(t.voicing).toEqual(t.lhChord!.map((k) => k + 12));
        expect(t.lhChord![0] % 12).toBe(inversions === 'inversions' ? t.bassPc : t.spec.root.midi % 12);
        expect(t.lhChord).toEqual(closeVoicing(t.pcs, t.lhChord![0] % 12, 43));
        expect(t.written).toEqual([...t.lhChord!, ...t.voicing]);
        // Left hand from G2, right hand from G3.
        expect(t.lhChord![0]).toBeGreaterThanOrEqual(43);
        expect(t.lhChord![0]).toBeLessThan(55);
        // Either hand alone is not the chord.
        expect(matches(t, t.voicing)).toBe(false);
        expect(matches(t, t.lhChord!)).toBe(false);
        expect(matches(t, [...t.lhChord!, ...t.voicing])).toBe(true);
      });
      expect(ex.range.min).toBeGreaterThanOrEqual(43);
    }
  });

  it('weak-spot focus favors the qualities asked for', () => {
    const ex = generateChordExercise(drill({ set: 'all-triads' }), { bpm: 60, count: 16, focus: { qualities: { dim: 20 } } }, 3);
    expect(ex.chords.targets.filter((t) => t.spec.quality === 'dim').length).toBeGreaterThan(8);
  });
});

describe('chord engines', () => {
  const target = (pcs: number[], bassPc: number | null) => ({ pcs, bassPc });

  it('from the staff: exactly the written keys, whichever hand plays them', () => {
    // C written as C3 under C4 E4 G4.
    const c = { pcs: [0, 4, 7], bassPc: 0, written: [48, 60, 64, 67] };
    expect(matches(c, [48, 60, 64, 67])).toBe(true);
    expect(matches(c, [60, 64, 67])).toBe(false); // the right hand alone: not complete yet
    expect(bassOnlyWrong(c, [60, 64, 67])).toBe(false);
    expect(matches(c, [36, 48, 60, 64, 67])).toBe(false); // an extra octave is not written
    expect(matches(c, [48, 72, 76, 79])).toBe(false); // an octave off
    // A chord tone below the written bass is a wrong bass; elsewhere an unwritten key is just wrong.
    expect(wrongBassKey(c, 43)).toBe(true);
    expect(wrongBassKey(c, 45)).toBe(false);
    expect(wrongBassKey(c, 55)).toBe(false);
    expect(wrongKey(c, 55)).toBe(true);
    expect(wrongKey(c, 48)).toBe(false);
    expect(bassOnlyWrong(c, [43, 60, 64, 67])).toBe(true);
  });

  it('Wait, RH + LH bass: the right hand landing first does not count against a right chord (#74)', () => {
    const ts = generateChordExercise(prog('I-V-vi-IV', 'C', 'lh-bass'), opts, 1).chords.targets;
    expect(ts).toHaveLength(8);
    for (const gap of [15, 100, 2000, -15]) {
      const w = new ChordWaitEngine(ts);
      w.start(0);
      const types: string[] = [];
      ts.forEach((t, i) => {
        const at = 10000 * (i + 1);
        // gap > 0: the right hand lands first; < 0: the left hand does.
        const rh = gap > 0 ? at : at - gap;
        const lh = gap > 0 ? at + gap : at;
        const presses = [...t.voicing.map((k) => [k, rh] as const), [t.bassMidi!, lh] as const].sort((a, b) => a[1] - b[1]);
        for (const [k, time] of presses) types.push(w.noteOn(k, time).type);
        for (const k of [t.bassMidi!, ...t.voicing]) w.noteOff(k, at + 5000);
      });
      expect(w.finished).toBe(true);
      expect(w.results.filter((j) => j.correct)).toHaveLength(8);
      expect(w.wrongPresses).toBe(0);
      expect(types.filter((t) => t === 'bass' || t === 'wrong')).toEqual([]);
    }
  });

  it('Wait, hands together: the chord counts once both hands are down, in either order', () => {
    const ts = generateChordExercise(drill({ set: 'all-triads', prompt: 'notation', inversions: 'inversions', drillHands: 'both' }), opts, 2).chords.targets;
    for (const gap of [15, 400, -15, -400]) {
      const w = new ChordWaitEngine(ts);
      w.start(0);
      const types: string[] = [];
      ts.forEach((t, i) => {
        const at = 10000 * (i + 1);
        // gap > 0: the right hand lands first; < 0: the left hand does.
        const [first, second] = gap > 0 ? [t.voicing, t.lhChord!] : [t.lhChord!, t.voicing];
        for (const k of first) types.push(w.noteOn(k, at).type);
        expect(w.index).toBe(i); // one hand alone is not complete yet
        for (const k of second) types.push(w.noteOn(k, at + Math.abs(gap)).type);
        expect(w.index).toBe(i + 1);
        for (const k of t.written!) w.noteOff(k, at + 5000);
      });
      expect(w.finished).toBe(true);
      expect(w.results.filter((j) => j.correct)).toHaveLength(8);
      expect(types.filter((t) => t === 'bass' || t === 'wrong')).toEqual([]);
    }
  });

  it('Wait, RH + LH bass drill: the full right-hand chord landing first is still right first time', () => {
    const ts = generateChordExercise(drill({ set: 'triads', prompt: 'notation', inversions: 'root', drillHands: 'lh-bass' }), opts, 3).chords.targets;
    const w = new ChordWaitEngine(ts);
    w.start(0);
    ts.forEach((t, i) => {
      const at = 10000 * (i + 1);
      // The right hand doubles the bass note's name: it must not complete the chord alone.
      t.voicing.forEach((k) => w.noteOn(k, at));
      expect(w.index).toBe(i);
      expect(w.noteOn(t.bassMidi!, at + 100).type).toBe('match');
      [t.bassMidi!, ...t.voicing].forEach((k) => w.noteOff(k, at + 5000));
    });
    expect(w.results.filter((j) => j.correct)).toHaveLength(8);
    expect(w.wrongPresses).toBe(0);
  });

  it('Wait, from the staff: a chord tone under the written bass is a wrong bass, other keys are wrong', () => {
    const ts = generateChordExercise(prog('I-V-vi-IV', 'C', 'lh-bass'), opts, 1).chords.targets;
    const w = new ChordWaitEngine(ts);
    w.start(0);
    ts[0].voicing.forEach((k) => w.noteOn(k, 100));
    expect(w.noteOn(ts[0].bassMidi! - 5, 120).type).toBe('bass'); // G2 under C3's place
    expect(w.noteOn(ts[0].bassMidi! - 12, 130).type).toBe('bass'); // C2: an octave below what is written
    expect(w.noteOn(ts[0].voicing[0] + 12, 140).type).toBe('wrong'); // a chord tone in the wrong octave
    [ts[0].bassMidi! - 5, ts[0].bassMidi! - 12, ts[0].voicing[0] + 12].forEach((k) => w.noteOff(k, 200));
    expect(w.index).toBe(0);
    expect(w.noteOn(ts[0].bassMidi!, 300).type).toBe('match');
    expect(w.results[0]).toMatchObject({ correct: false, wrongBass: true, wrongPresses: 1 });
  });

  it('from the chart: any voicing, any hand, no bass rule, and voice leading is measured', () => {
    const ex = generateChordExercise(prog('I-V-vi-IV', 'C', 'lh-bass', false), opts, 1);
    expect(ex.chords.item).toMatchObject({ hands: 'lh-bass', notation: false });
    for (const t of ex.chords.targets) expect(t).toMatchObject({ written: null, bassPc: null, bassMidi: null });
    const t = ex.chords.targets[1]; // G
    expect(matches(t, [55, 59, 62])).toBe(true);
    expect(matches(t, [43, 71, 74, 79])).toBe(true);
    // From the staff, the same item judges the written keys, and voice leading is not measured.
    const staff = generateChordExercise(prog('I-V-vi-IV', 'C', 'rh'), opts, 1);
    expect(staff.chords.targets[1].written).toEqual(staff.chords.targets[1].voicing);
    const judgments = staff.chords.targets.map((x, i) => ({ index: i, correct: true, played: x.voicing, wrongPresses: 0, wrongBass: false, reactionMs: 500 }));
    expect(summarizeChords(staff, judgments, 'wait', 80).voiceLeading).toBeNull();
  });

  it('matches pitch classes in any octave, with the bass rule', () => {
    expect(matches(target([0, 4, 7], null), [52, 60, 67, 72])).toBe(true);
    expect(matches(target([0, 4, 7], 0), [52, 60, 67])).toBe(false);
    expect(bassOnlyWrong(target([0, 4, 7], 0), [52, 60, 67])).toBe(true);
    expect(matches(target([0, 4, 7], null), [60, 64])).toBe(false);
    expect(matches(target([0, 4, 7], null), [60, 64, 67, 69])).toBe(false);
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

    const inv = new ChordWaitEngine([{ ...ts[0], bassPc: 5, written: null }]); // ask for Dm7/F by symbol
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
    const f = new ChordFlowEngine(ts, { tickMs: 250, endTick: ex.totalTicks, latencyMs: 0 });
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
    const f = new ChordFlowEngine(ts, { tickMs: 250, endTick: ex.totalTicks, latencyMs: 0 });
    f.setStartTime(1000);
    const lastBar = 1000 + (ts.length - 1) * 4000;
    f.update(lastBar + 1000);
    expect(f.isFinished(lastBar + 1000)).toBe(false);
    expect(f.isFinished(lastBar + 4000)).toBe(true);
  });
});

describe('inversions in sequence', () => {
  const midis = (ex: ReturnType<typeof generateChordExercise>, hand: 'rh' | 'lh') => ex.measures.flatMap((m) => m[hand].map((e) => e.pitches.map((p) => p.midi)));

  it('walks one chord up an octave and back in half notes, fingered, with slash symbols', () => {
    const ex = generateChordExercise(seq('C', 'rh'), opts, 1);
    const ts = ex.chords.targets;
    expect(ts.map((t) => t.symbol)).toEqual(['C', 'C/E', 'C/G', 'C', 'C/G', 'C/E', 'C']);
    expect(ts.map((t) => t.leg)).toEqual(['up', 'up', 'up', 'top', 'down', 'down', 'down']);
    expect(ts.map((t) => t.tick)).toEqual([0, 8, 16, 24, 32, 40, 48]);
    expect(ts.map((t) => t.voicing)).toEqual([
      [60, 64, 67],
      [64, 67, 72],
      [67, 72, 76],
      [72, 76, 79],
      [67, 72, 76],
      [64, 67, 72],
      [60, 64, 67],
    ]);
    // From the staff: exactly the written keys; the bass is the inversion's.
    expect(ts[1].written).toEqual([64, 67, 72]);
    expect(ts[1].bassPc).toBe(4);
    expect(ex).toMatchObject({ bars: 4, totalTicks: 64, hands: 'rh', staves: ['treble'], bpm: 60 });
    expect(ex.chords.beatsPerChord).toBe(2);
    expect(ex.steps).toHaveLength(7);
    const events = ex.measures.flatMap((m) => m.rh);
    expect(events.map((e) => e.durationTicks)).toEqual([8, 8, 8, 8, 8, 8, 16]);
    expect(events.every((e) => isSupportedDuration(e.durationTicks))).toBe(true);
    expect(events.map((e) => e.fingers!.join(''))).toEqual(['135', '125', '135', '135', '135', '125', '135']);
    expect(events.map((e) => e.symbol)).toEqual(ts.map((t) => t.symbol));
    // The left hand changes the middle finger in the second inversion.
    const lh = generateChordExercise(seq('C', 'lh'), opts, 1);
    expect(lh.staves).toEqual(['bass']);
    expect(lh.measures.flatMap((m) => m.lh).map((e) => e.fingers!.join(''))).toEqual(['531', '531', '521', '531', '521', '531', '531']);
  });

  it('is written in the chord\'s own key and spelled by it', () => {
    const ex = generateChordExercise(seq('Eb', 'rh', 'min'), opts, 1);
    expect(ex.key.label).toBe('E♭ minor');
    expect(ex.chords.targets.map((t) => t.symbol).slice(0, 3)).toEqual(['E♭m', 'E♭m/G♭', 'E♭m/B♭']);
    expect(ex.measures[0].rh[0].pitches.map((p) => pitchLabel(p))).toEqual(['E♭', 'G♭', 'B♭']);
    expect(generateChordExercise(seq('F#', 'rh'), opts, 1).key.label).toBe('F♯ major');
  });

  it('hands together: the same shape in each hand, the left hand below the right', () => {
    for (const chord of SEQUENCE_CHORDS) {
      for (const key of sequenceKeys(chord)) {
        const ex = generateChordExercise(seq(key, 'both', chord), opts, 1);
        expect(ex.staves).toEqual(['treble', 'bass']);
        for (const t of ex.chords.targets) {
          expect((t.voicing[0] - t.lhChord![0]) % 12).toBe(0);
          expect(t.voicing.map((k) => k - t.voicing[0])).toEqual(t.lhChord!.map((k) => k - t.lhChord![0]));
          expect(Math.max(...t.lhChord!)).toBeLessThan(Math.min(...t.voicing));
          expect(t.written).toEqual([...t.lhChord!, ...t.voicing]);
        }
      }
    }
    // C major sits where a first triad is learned: left hand from C3, right hand from middle C.
    const c = generateChordExercise(seq('C', 'both'), opts, 1).chords.targets[0];
    expect([c.lhChord![0], c.voicing[0]]).toEqual([48, 60]);
  });

  it('fits every keyboard size within three ledger lines', () => {
    for (const size of KEYBOARD_SIZES) {
      const keyboard = KEYBOARD_RANGES[size];
      for (const chord of SEQUENCE_CHORDS) {
        for (const key of sequenceKeys(chord)) {
          const ex = generateChordExercise(seq(key, 'both', chord), { ...opts, keyboard }, 1);
          const where = `${key} ${chord} on ${size} keys`;
          expect(ex.range.min, where).toBeGreaterThanOrEqual(keyboard.min);
          expect(ex.range.max, where).toBeLessThanOrEqual(keyboard.max);
          for (const [hand, clef] of [['rh', 'treble'], ['lh', 'bass']] as const) {
            const worst = Math.max(...ex.measures.flatMap((m) => m[hand].flatMap((e) => e.pitches.map((p) => ledgerLines(p, clef)))));
            expect(worst, `${where}, ${hand}`).toBeLessThanOrEqual(3);
          }
          // Each hand alone plays what it plays hands together.
          for (const hand of ['rh', 'lh'] as const) {
            expect(midis(generateChordExercise(seq(key, hand, chord), { ...opts, keyboard }, 1), hand), where).toEqual(midis(ex, hand));
          }
        }
      }
    }
    // 49 keys end at C6: the one sequence that would go past it starts an octave lower.
    expect(generateChordExercise(seq('F#', 'rh'), { ...opts, keyboard: KEYBOARD_RANGES[61] }, 1).range).toEqual({ min: 66, max: 85 });
    expect(generateChordExercise(seq('F#', 'rh'), { ...opts, keyboard: KEYBOARD_RANGES[49] }, 1).range).toEqual({ min: 54, max: 73 });
  });

  it('from symbols: any octave and any hand, with the inversion\'s note in the bass', () => {
    const ex = generateChordExercise(seq('C', 'both', 'maj', false), opts, 1);
    expect(ex.staves).toEqual(['treble']);
    const ts = ex.chords.targets;
    expect(ts.every((t) => t.written === null && t.lhChord === null)).toBe(true);
    expect(matches(ts[1], [40, 55, 60])).toBe(true); // E in the bass, two octaves down
    expect(matches(ts[1], [48, 52, 55])).toBe(false); // C in the bass
    expect(bassOnlyWrong(ts[1], [48, 52, 55])).toBe(true);
    // From the staff an octave off does not count.
    const written = generateChordExercise(seq('C', 'rh'), opts, 1).chords.targets;
    expect(matches(written[1], [64, 67, 72])).toBe(true);
    expect(matches(written[1], [52, 55, 60])).toBe(false);
  });

  it('Flow: a chord on beats 1 and 3, each judged against its own beat', () => {
    const ex = generateChordExercise(seq('C', 'rh'), { ...opts, bpm: 120 }, 1);
    const ts = ex.chords.targets;
    // 120 bpm: a tick is 125 ms, so a chord every 1000 ms and the last one held for 2000 ms.
    const f = new ChordFlowEngine(ts, { tickMs: 125, endTick: ex.totalTicks, latencyMs: 0 });
    f.setStartTime(1000);
    expect([f.preMs, f.postMs, f.perfectMs]).toEqual([300, 400, 80]);
    expect(ts.map((_, i) => f.expectedTime(i))).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000]);
    ts.forEach((t, i) => {
      const at = f.expectedTime(i) + (i === 2 ? 200 : 0); // the third chord 200 ms late
      if (i === 4) return; // one chord left out
      t.voicing.forEach((k) => f.noteOn(k, at));
      t.voicing.forEach((k) => f.noteOff(k, at + 500));
    });
    const out = f.update(7000 + 400);
    expect(out.map((j) => j.correct)).toEqual([true, true, true, true, false, true, true]);
    expect(out[2].deltaMs).toBe(200);
    expect(out[2].timingScore).toBeLessThan(1);
    expect(f.extraPresses()).toBe(0);
    // The chord asked for changes a little before its beat; the run ends after the last whole note.
    expect([f.askedAt(1000), f.askedAt(1650), f.askedAt(1700), f.askedAt(6700), f.askedAt(8690), f.askedAt(8700)]).toEqual([0, 0, 1, 6, 6, 7]);
    expect(f.isFinished(8900)).toBe(false);
    expect(f.isFinished(9000)).toBe(true);
  });

  const flowRun = (missed: readonly number[], timingScore = 1) => {
    const ex = generateChordExercise(seq('C', 'both'), opts, 1);
    const judgments = ex.chords.targets.map((t, i) => ({
      index: i,
      correct: !missed.includes(i),
      deltaMs: 10,
      spreadMs: 20,
      timingScore: missed.includes(i) ? undefined : timingScore,
      played: missed.includes(i) ? [] : t.written!,
      wrongPresses: 0,
      wrongBass: false,
    }));
    return chordResult(ex, judgments, { mode: 'flow', goalBpm: 80, durationMs: 16000, wrongPresses: 0, completedAt: 0 });
  };

  it('a clean run has every chord; one miss keeps the tempo, two take it down', () => {
    const id = 'chords/seq/maj/C/both';
    const day = new Date(2026, 10, 21);
    const clean = flowRun([]);
    expect(clean.chords).toMatchObject({ task: 'sequence', clean: true, messy: false, chords: 7, correct: 7 });
    expect(isPass(clean)).toBe(true);
    const up = applyResult(emptyProgress(), clean, day);
    expect(up.award.repertoire).toMatchObject({ itemId: id, fromTempo: 60, toTempo: 64, clean: true });
    // Off the beat is not clean either, but it is not messy.
    expect(flowRun([], 0.5).chords).toMatchObject({ clean: false, messy: false });
    // 6 of 7 is 86%: under the 90% of other chord runs, but one slip in seven does not move the ladder.
    const one = flowRun([4]);
    expect(one.chords).toMatchObject({ clean: false, messy: false, correct: 6 });
    expect(isPass(one)).toBe(false);
    expect(applyResult(up.progress, one, day).progress.repertoire[id].ladderTempo).toBe(64);
    const two = flowRun([1, 4]);
    expect(two.chords).toMatchObject({ clean: false, messy: true });
    expect(applyResult(up.progress, two, day).progress.repertoire[id].ladderTempo).toBe(56);
    // A progression keeps its 90% rule: 7 of 8 moves the ladder down.
    const ex = generateChordExercise(prog('I-IV-V-I', 'C'), opts, 1);
    const judgments = ex.chords.targets.map((t, i) => ({ index: i, correct: i !== 3, deltaMs: 0, timingScore: 1, played: t.voicing, wrongPresses: 0, wrongBass: false }));
    expect(summarizeChords(ex, judgments, 'flow', 80)).toMatchObject({ clean: false, messy: true });
  });

  it('says where a chord went wrong, and stays out of the weak-chord statistics', () => {
    const result = flowRun([1, 5]);
    // C/E comes twice: on the way up and on the way down.
    expect(result.chords.trouble).toEqual([
      { symbol: 'C/E', leg: 'up', reason: 'missed' },
      { symbol: 'C/E', leg: 'down', reason: 'missed' },
    ]);
    const { progress } = applyResult(emptyProgress(), result, new Date(2026, 10, 21));
    expect(progress.stats.chordQuality).toBeUndefined();
    expect(progress.stats.chordInversion).toBeUndefined();
    expect(progress.repertoire['chords/seq/maj/C/both'].attempts).toBe(1);
  });

  it('keeps chord and key consistent in settings', () => {
    const chords = (raw: Record<string, unknown>) => normalizeSettings({ chords: raw }).chords;
    expect(chords({})).toMatchObject({ sequenceChord: 'maj', sequenceKey: 'C', sequenceHands: 'rh', sequenceNotation: true, showFingering: true });
    expect(chords({ task: 'sequence' }).task).toBe('sequence');
    // A key keeps its place on the keyboard when the chord changes: D♭ major, C♯ minor.
    expect(chords({ sequenceChord: 'min', sequenceKey: 'Db' }).sequenceKey).toBe('C#');
    expect(chords({ sequenceChord: 'maj', sequenceKey: 'G#' }).sequenceKey).toBe('Ab');
    expect(chords({ sequenceChord: 'min', sequenceKey: 'Eb' }).sequenceKey).toBe('Eb');
    expect(chords({ sequenceKey: 'shuffle' }).sequenceKey).toBe('shuffle');
    expect(chords({ sequenceChord: 'dim7', sequenceKey: 'H', sequenceHands: 'lh-bass' })).toMatchObject({ sequenceChord: 'maj', sequenceKey: 'C', sequenceHands: 'rh' });
    expect(chords({ sequenceHands: 'both', sequenceNotation: false, showFingering: false })).toMatchObject({ sequenceHands: 'both', sequenceNotation: false, showFingering: false });
  });
});

describe('chord analysis and progress', () => {
  it('summarizes a Flow run, measures voice leading and moves the ladder', () => {
    // Voice leading is measured when you choose the voicing: from the chart.
    const ex = generateChordExercise(prog('I-V-vi-IV', 'C', 'rh', false), opts, 1);
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
    expect(award.repertoire).toMatchObject({ itemId: 'chords/prog/I-V-vi-IV/C/chart', fromTempo: 60, toTempo: 64, clean: true });
    expect(progress.repertoire['chords/prog/I-V-vi-IV/C/chart'].ladderTempo).toBe(64);
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
    expect(normalizeSettings({ chords: { drillHands: 'all' } }).chords.drillHands).toBe('rh');
    expect(normalizeSettings({ chords: { drillHands: 'both' } }).chords.drillHands).toBe('both');
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
