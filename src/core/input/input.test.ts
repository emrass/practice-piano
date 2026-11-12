import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from '../midi/parse';
import { fitKeyboardRange, isBlackKey, KEYBOARD_RANGES, countWhiteKeys } from '../keyboard/range';
import { HeldNotesTracker } from './events';
import { midiToQwertyLabel, qwertyBaseFor, qwertyToMidi } from './qwerty';

describe('parseMidiMessage', () => {
  it('parses note on/off on any channel', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'noteOn', note: 60, velocity: 100, channel: 0 });
    expect(parseMidiMessage([0x83, 61, 40])).toEqual({ type: 'noteOff', note: 61, velocity: 40, channel: 3 });
  });

  it('treats note-on with velocity 0 as note-off', () => {
    expect(parseMidiMessage([0x91, 64, 0])).toEqual({ type: 'noteOff', note: 64, velocity: 0, channel: 1 });
  });

  it('parses the sustain pedal (CC 64) with the 64 threshold', () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toMatchObject({ type: 'sustain', down: true });
    expect(parseMidiMessage([0xb0, 64, 63])).toMatchObject({ type: 'sustain', down: false });
    expect(parseMidiMessage([0xb0, 123, 0])).toMatchObject({ type: 'allNotesOff' });
  });

  it('ignores system / unrelated / truncated messages', () => {
    expect(parseMidiMessage([0xf8])).toBeNull(); // clock
    expect(parseMidiMessage([0xfe])).toBeNull(); // active sensing
    expect(parseMidiMessage([0xb0, 7, 100])).toBeNull(); // volume
    expect(parseMidiMessage([0x90, 60])).toBeNull();
    expect(parseMidiMessage([])).toBeNull();
    expect(parseMidiMessage(new Uint8Array([0xe0, 0, 64]))).toBeNull(); // pitch bend
  });
});

describe('HeldNotesTracker', () => {
  it('tracks held and sustained keys across sources', () => {
    const t = new HeldNotesTracker();
    t.apply({ kind: 'noteOn', midi: 60, velocity: 90, time: 0, source: 'midi' });
    t.apply({ kind: 'noteOn', midi: 60, velocity: 90, time: 0, source: 'screen' });
    t.apply({ kind: 'noteOff', midi: 60, time: 1, source: 'midi' });
    expect(t.snapshot().held).toEqual([60]);
    t.apply({ kind: 'sustain', down: true, time: 2, source: 'midi' });
    t.apply({ kind: 'noteOff', midi: 60, time: 3, source: 'screen' });
    expect(t.snapshot()).toEqual({ held: [], sustained: [60], sustain: true });
    t.apply({ kind: 'sustain', down: false, time: 4, source: 'midi' });
    expect(t.snapshot().sustained).toEqual([]);
  });
});

describe('qwerty mapping', () => {
  it('maps home-row keys to a chromatic octave', () => {
    expect(qwertyToMidi('KeyA', 60)).toBe(60);
    expect(qwertyToMidi('KeyW', 60)).toBe(61);
    expect(qwertyToMidi('KeyK', 60)).toBe(72);
    expect(qwertyToMidi('Space', 60)).toBeNull();
    expect(midiToQwertyLabel(62, 60)).toBe('S');
  });

  it('chooses a base octave around an exercise', () => {
    expect(qwertyBaseFor(48, 55)).toBe(48);
    expect(qwertyBaseFor(60, 67) % 12).toBe(0);
  });
});

describe('keyboard range', () => {
  it('knows the standard sizes', () => {
    expect(KEYBOARD_RANGES[88].max - KEYBOARD_RANGES[88].min + 1).toBe(88);
    expect(KEYBOARD_RANGES[61].max - KEYBOARD_RANGES[61].min + 1).toBe(61);
    expect(KEYBOARD_RANGES[49].max - KEYBOARD_RANGES[49].min + 1).toBe(49);
    expect(KEYBOARD_RANGES[76].max - KEYBOARD_RANGES[76].min + 1).toBe(76);
    expect(KEYBOARD_RANGES[73].max - KEYBOARD_RANGES[73].min + 1).toBe(73);
  });

  it('fits a padded, white-key-aligned window inside the keyboard', () => {
    const r = fitKeyboardRange(60, 62, 88);
    expect(isBlackKey(r.min)).toBe(false);
    expect(isBlackKey(r.max)).toBe(false);
    expect(r.min).toBeLessThanOrEqual(58);
    expect(r.max).toBeGreaterThanOrEqual(64);
    expect(countWhiteKeys(r.min, r.max)).toBeGreaterThanOrEqual(15);
    const edge = fitKeyboardRange(21, 30, 49);
    expect(edge.min).toBe(36);
  });
});
