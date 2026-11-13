import { describe, expect, it } from 'vitest';
import { scaleDegree } from '../music/keys';
import { pitchToStep } from '../music/pitch';
import { EAR_TIERS, earTierForLevel } from './tiers';
import { earProfile, generateEarExercise, type EarSettings } from './generator';

const base: EarSettings = { level: 1, length: 'auto', reference: 'auto', keyId: 'auto' };
const SEEDS = Array.from({ length: 15 }, (_, i) => 31 + i * 977);

describe('ear tiers & profile', () => {
  it('covers 1–100 contiguously', () => {
    expect(EAR_TIERS[0].minLevel).toBe(1);
    expect(EAR_TIERS.at(-1)!.maxLevel).toBe(100);
    for (let i = 1; i < EAR_TIERS.length; i++) expect(EAR_TIERS[i].minLevel).toBe(EAR_TIERS[i - 1].maxLevel + 1);
    expect(earTierForLevel(72).id).toBe('e09');
  });

  it('progresses from short echoes to long phrases and chords', () => {
    expect(earProfile(1).length).toBe(2);
    expect(earProfile(1).firstNoteGiven).toBe(true);
    expect(earProfile(1).cadence).toBe(false);
    expect(earProfile(45).cadence).toBe(true);
    expect(earProfile(65).content).toBe('dyads');
    expect(earProfile(75).content).toBe('triads');
    expect(earProfile(85).firstNoteGiven).toBe(false);
    expect(earProfile(100).length).toBeGreaterThan(earProfile(30).length);
  });
});

describe('generateEarExercise', () => {
  it('is deterministic and uses its own tier ids', () => {
    const a = generateEarExercise({ ...base, level: 40 }, 5);
    expect(generateEarExercise({ ...base, level: 40 }, 5)).toEqual(a);
    expect(a.meta.tierId).toBe('e05');
    expect(a.id.startsWith('ear-')).toBe(true);
  });

  it('level 1 is a two-note echo on C, D and E, by step', () => {
    for (const seed of SEEDS) {
      const ex = generateEarExercise(base, seed);
      expect(ex.steps).toHaveLength(2);
      const [a, b] = ex.steps.map((s) => s.midis[0]);
      expect([60, 62, 64]).toContain(a);
      expect([60, 62, 64]).toContain(b);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
      expect(ex.key.id).toBe('C');
    }
  });

  it('the first tiers have enough different phrases to keep them fresh', () => {
    const distinct = (level: number) => new Set(Array.from({ length: 300 }, (_, i) => generateEarExercise({ ...base, level }, 7919 * (i + 1)).id)).size;
    expect(distinct(1)).toBeGreaterThanOrEqual(6);
    expect(distinct(8)).toBeGreaterThanOrEqual(20);
    expect(distinct(15)).toBeGreaterThanOrEqual(30);
  });

  it('melodies end on the tonic and respect the leap limit', () => {
    for (const level of [13, 25, 38, 55, 85]) {
      const p = earProfile(level);
      for (const seed of SEEDS) {
        const ex = generateEarExercise({ ...base, level }, seed);
        const tops = ex.steps.map((s) => s.notes[s.notes.length - 1].pitch);
        expect(scaleDegree(ex.key, pitchToStep(tops.at(-1)!))).toBe(0);
        for (let i = 1; i < tops.length - 1; i++) expect(Math.abs(pitchToStep(tops[i]) - pitchToStep(tops[i - 1]))).toBeLessThanOrEqual(p.maxLeap);
      }
    }
  });

  it('fills whole 4/4 bars and stays on the treble staff', () => {
    for (const level of [1, 30, 65, 75, 95, 100]) {
      for (const seed of SEEDS.slice(0, 6)) {
        const ex = generateEarExercise({ ...base, level }, seed);
        for (const m of ex.measures) expect(m.rh.reduce((a, e) => a + e.durationTicks, 0)).toBe(16);
        expect(ex.range.min).toBeGreaterThanOrEqual(52);
        expect(ex.range.max).toBeLessThanOrEqual(86);
      }
    }
  });

  it('plays a cadence first when the key must be inferred', () => {
    const keyOnly = generateEarExercise({ ...base, level: 10, reference: 'key-only' }, 3);
    expect(keyOnly.ear.firstNoteGiven).toBe(false);
    expect(keyOnly.ear.cadence).toHaveLength(4);
    expect(keyOnly.ear.playback[4].at).toBe(keyOnly.ear.phraseStartMs);
    const given = generateEarExercise({ ...base, level: 10 }, 3);
    expect(given.ear.cadence).toHaveLength(0);
    expect(given.ear.playback).toHaveLength(given.steps.length);
  });

  it('builds chords at the harmonic levels', () => {
    const dyads = generateEarExercise({ ...base, level: 65 }, 9);
    expect(dyads.steps.every((s) => s.midis.length === 2)).toBe(true);
    const triads = generateEarExercise({ ...base, level: 75 }, 9);
    expect(triads.steps.every((s) => s.midis.length === 3)).toBe(true);
  });

  it('honours length override and interval focus', () => {
    expect(generateEarExercise({ ...base, level: 30, length: 7 }, 1).steps).toHaveLength(7);
    const count = (focus?: number[]) => {
      let n = 0;
      for (const seed of SEEDS) {
        const ex = generateEarExercise({ ...base, level: 38, length: 8, keyId: 'C', focusIntervals: focus }, seed);
        for (let i = 1; i < ex.steps.length; i++) if (Math.abs(ex.steps[i].midis[0] - ex.steps[i - 1].midis[0]) === 7) n++;
      }
      return n;
    };
    expect(count([7])).toBeGreaterThan(count() * 1.3);
  });
});
