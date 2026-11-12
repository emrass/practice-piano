import { describe, expect, it } from 'vitest';
import type { NoteInput } from './events';
import { pianoActionFor, PianoShortcutGate, SHORTCUT_ARM_MS } from './pianoShortcuts';

const on = (midi: number, time: number): NoteInput => ({ kind: 'noteOn', midi, velocity: 80, time, source: 'midi' });
const off = (midi: number, time: number): NoteInput => ({ kind: 'noteOff', midi, time, source: 'midi' });
const pedal = (down: boolean, time: number): NoteInput => ({ kind: 'sustain', down, time, source: 'midi' });

describe('pianoActionFor', () => {
  it('maps white keys C–G in any octave', () => {
    expect(pianoActionFor(60)).toBe('retry');
    expect(pianoActionFor(36)).toBe('retry');
    expect(pianoActionFor(62)).toBe('next');
    expect(pianoActionFor(76)).toBe('close');
    expect(pianoActionFor(65)).toBe('easier');
    expect(pianoActionFor(55)).toBe('harder');
    expect(pianoActionFor(61)).toBeNull();
    expect(pianoActionFor(69)).toBeNull();
  });
});

describe('PianoShortcutGate', () => {
  it('does nothing while an exercise is running', () => {
    const g = new PianoShortcutGate();
    expect(g.handle(on(60, 1000))).toBeNull();
  });

  it('ignores the final notes and anything inside the arming delay', () => {
    const g = new PianoShortcutGate();
    g.handle(on(48, 0));
    g.finish(100); // final chord completes the exercise
    expect(g.handle(on(60, 150))).toBeNull(); // straggler of the chord
    g.handle(off(48, 400));
    g.handle(off(60, 400));
    expect(g.handle(on(62, 100 + SHORTCUT_ARM_MS - 10))).toBeNull(); // too soon
    g.handle(off(62, 100 + SHORTCUT_ARM_MS));
    expect(g.handle(on(62, 100 + SHORTCUT_ARM_MS + 50))).toBe('next');
  });

  it('requires the press to start from silence', () => {
    const g = new PianoShortcutGate();
    g.finish(0);
    g.handle(on(50, 1000)); // still holding a key…
    expect(g.handle(on(60, 1100))).toBeNull(); // …so this C is music, not a command
    g.handle(off(50, 1200));
    g.handle(off(60, 1200));
    expect(g.handle(on(60, 1300))).toBe('retry');
  });

  it('re-arms only after the next finish', () => {
    const g = new PianoShortcutGate();
    g.finish(0);
    expect(g.handle(on(60, 1000))).toBe('retry');
    g.handle(off(60, 1100));
    g.reset();
    expect(g.handle(on(60, 2000))).toBeNull();
  });

  it('detects a quick sustain-pedal tap but not a held pedal', () => {
    const g = new PianoShortcutGate();
    g.pedalTap(pedal(true, 0));
    expect(g.pedalTap(pedal(false, 200))).toBe(true);
    g.pedalTap(pedal(true, 1000));
    expect(g.pedalTap(pedal(false, 2500))).toBe(false);
    expect(g.pedalTap(on(60, 3000))).toBe(false);
  });
});
