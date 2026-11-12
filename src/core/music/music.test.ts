import { describe, expect, it } from 'vitest';
import { getKey, keyAlters, MeasureAccidentals, scaleDegree, stepToMidi, stepToPitch } from './keys';
import {
  makePitch,
  midiLabel,
  midiToStepFloor,
  MIDDLE_C_STEP,
  pitchLabel,
  spellMidi,
  spelledToMidi,
  stepToNaturalMidi,
  vexKey,
} from './pitch';
import { durationCode, isDotted, msPerTick, TIME_SIGNATURES } from './rhythm';

describe('pitch', () => {
  it('converts spelled pitches to MIDI', () => {
    expect(spelledToMidi('C', 0, 4)).toBe(60);
    expect(spelledToMidi('A', 0, 0)).toBe(21);
    expect(spelledToMidi('B', 1, 3)).toBe(60); // B#3 == C4
    expect(spelledToMidi('C', -1, 4)).toBe(59); // Cb4 == B3
  });

  it('maps diatonic steps around middle C', () => {
    expect(stepToNaturalMidi(MIDDLE_C_STEP)).toBe(60);
    expect(stepToNaturalMidi(MIDDLE_C_STEP + 7)).toBe(72);
    expect(midiToStepFloor(61)).toBe(MIDDLE_C_STEP); // C#4 sits on the C4 line
    expect(midiToStepFloor(59)).toBe(MIDDLE_C_STEP - 1);
  });

  it('formats labels and VexFlow keys', () => {
    expect(pitchLabel(makePitch('F', 1, 4), true)).toBe('F♯4');
    expect(vexKey(makePitch('B', -1, 3))).toBe('bb/3');
    expect(midiLabel(61)).toBe('C♯4');
    expect(midiLabel(61, true)).toBe('D♭4');
    expect(spellMidi(70, true).letter).toBe('B');
  });
});

describe('keys', () => {
  it('derives key-signature alterations', () => {
    expect(keyAlters(2)).toMatchObject({ F: 1, C: 1, G: 0 });
    expect(keyAlters(-3)).toMatchObject({ B: -1, E: -1, A: -1, D: 0 });
  });

  it('spells scale steps in the key', () => {
    const d = getKey('D');
    expect(stepToPitch(d, MIDDLE_C_STEP + 3).midi).toBe(66); // F#4
    expect(scaleDegree(d, MIDDLE_C_STEP + 1)).toBe(0); // D is the tonic
    const bb = getKey('Bb');
    expect(stepToMidi(bb, MIDDLE_C_STEP + 6)).toBe(70); // Bb4
  });

  it('prints accidentals only when they differ from key/measure state', () => {
    const acc = new MeasureAccidentals(1); // G major
    expect(acc.accidentalFor(makePitch('F', 1, 4))).toBeNull();
    expect(acc.accidentalFor(makePitch('F', 0, 4))).toBe('n');
    expect(acc.accidentalFor(makePitch('F', 0, 4))).toBeNull(); // carries through the bar
    expect(acc.accidentalFor(makePitch('F', 1, 4))).toBe('#');
    expect(acc.accidentalFor(makePitch('C', 1, 5))).toBe('#');
    expect(acc.accidentalFor(makePitch('C', 1, 4))).toBe('#'); // different octave
  });
});

describe('rhythm', () => {
  it('maps tick durations to VexFlow codes', () => {
    expect(durationCode(16)).toBe('w');
    expect(durationCode(6)).toBe('qd');
    expect(durationCode(1)).toBe('16');
    expect(isDotted(3)).toBe(true);
    expect(() => durationCode(5)).toThrow();
  });

  it('computes tick length from bpm (beat = dotted quarter in 6/8)', () => {
    expect(msPerTick(60, TIME_SIGNATURES['4/4'])).toBeCloseTo(250);
    expect(msPerTick(60, TIME_SIGNATURES['6/8'])).toBeCloseTo(1000 / 6);
  });
});
