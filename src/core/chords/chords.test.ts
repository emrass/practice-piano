import { describe, expect, it } from 'vitest';
import { isSupportedDuration } from '../music/rhythm';
import { pitchLabel } from '../music/pitch';
import { applyResult, emptyProgress, findWeakChords, isPass } from '../progress/progress';
import { normalizeSettings } from '../settings';
import { chordResult, summarizeChords } from './analysis';
import {
  CHORD_SET_IDS,
  type ChordItem,
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
      ...PROGRESSIONS.flatMap((p) => keysFor(p.mode).map((k) => prog(p.id, k, 'lh-bass'))),
    ];
    for (const item of items) expect(parseChordItemId(chordItemId(item))).toEqual(item);
    expect(parseChordItemId('scales/C/major')).toBeNull();
    expect(parseChordItemId('chords/prog/andalusian/Db/rh')).toBeNull(); // not a minor key
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
    expect(ex.chords.targets).toHaveLength(8); // short progressions go round twice
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

  it('weak-spot focus favours the qualities asked for', () => {
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
});

describe('chord analysis and progress', () => {
  it('summarises a Flow run, measures voice leading and moves the ladder', () => {
    const ex = generateChordExercise(prog('I-V-vi-IV', 'C'), opts, 1);
    const ts = ex.chords.targets;
    const judgements = ts.map((t, i) => ({
      index: i,
      correct: true,
      deltaMs: 10,
      spreadMs: 20,
      timingScore: 1,
      played: i === 3 ? t.voicing.map((m) => m + 12) : t.voicing, // one big jump
      wrongPresses: 0,
      wrongBass: false,
    }));
    const s = summarizeChords(ex, judgements, 'flow', 80);
    expect(s.clean).toBe(true);
    expect(s.voiceLeading).toBeLessThan(1);
    expect(s.movement!.played).toBeGreaterThan(s.movement!.minimal);
    expect(s.spreadMs).toBe(20);
    const result = chordResult(ex, judgements, { mode: 'flow', goalBpm: 80, durationMs: 32000, wrongPresses: 0, completedAt: 0 });
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
    const judgements = ts.map((t, i) => ({
      index: i,
      correct: i !== 2,
      reactionMs: i === 5 ? 9000 : 1000,
      played: t.voicing,
      wrongPresses: i === 2 ? 1 : 0,
      wrongBass: i === 2,
    }));
    const s = summarizeChords(ex, judgements, 'wait', 80);
    expect(s.trouble[0]).toMatchObject({ symbol: ts[2].symbol, reason: 'bass' });
    expect(s.medianReactionMs).toBe(1000);
    expect(s.trouble).toContainEqual({ symbol: ts[5].symbol, reason: 'slow', ms: 9000 });
    const weakRun = judgements.map((j, i) => ({ ...j, correct: ts[i].spec.quality !== ts[0].spec.quality }));
    let p = emptyProgress();
    for (let k = 0; k < 4; k++) {
      p = applyResult(p, chordResult(ex, weakRun, { mode: 'wait', goalBpm: 80, durationMs: 1000, wrongPresses: 1, completedAt: 0 }), new Date(2026, 10, 13)).progress;
    }
    expect(findWeakChords(p, 4).some((w) => w.dimension === "chordQuality" && w.key === ts[0].spec.quality)).toBe(true);
  });

  it('keeps progression and key consistent in settings', () => {
    expect(normalizeSettings({ chordsProgression: 'andalusian', chordsKey: 'Db' }).chordsKey).toBe('A');
    expect(normalizeSettings({ chordsProgression: 'nope' }).chordsProgression).toBe('I-IV-V-I');
    expect(normalizeSettings({ chordsKey: 'shuffle' }).chordsKey).toBe('shuffle');
  });
});
