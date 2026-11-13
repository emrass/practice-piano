import { describe, expect, it } from 'vitest';
import type { NoteInput } from '../core/input/events';
import { KeySound } from './keySound';

function setup() {
  const log: string[] = [];
  const sound = new KeySound({
    startNote: (m) => log.push(`on ${m}`),
    stopNote: (m) => log.push(`off ${m}`),
    stopAllNotes: () => log.push('all off'),
  });
  return { sound, log };
}

const on = (midi: number, source: NoteInput['source'] = 'screen'): NoteInput => ({ kind: 'noteOn', midi, velocity: 90, time: 0, source });
const off = (midi: number, source: NoteInput['source'] = 'screen'): NoteInput => ({ kind: 'noteOff', midi, time: 0, source });

describe('on-screen key sound', () => {
  it('is silent until enabled, and never sounds for MIDI input', () => {
    const { sound, log } = setup();
    sound.handle(on(60));
    expect(log).toEqual([]);
    sound.setEnabled(true);
    sound.handle(on(62, 'midi'));
    sound.handle(on(64, 'qwerty'));
    sound.handle(off(64, 'qwerty'));
    expect(log).toEqual(['on 64', 'off 64']);
  });

  it('holds released keys while the sustain pedal is down', () => {
    const { sound, log } = setup();
    sound.setEnabled(true);
    sound.handle({ kind: 'sustain', down: true, time: 0, source: 'qwerty' });
    sound.handle(on(60));
    sound.handle(off(60));
    sound.handle(on(64));
    expect(log).toEqual(['on 60', 'on 64']);
    sound.handle({ kind: 'sustain', down: false, time: 0, source: 'qwerty' });
    expect(log).toEqual(['on 60', 'on 64', 'off 60']); // 64 is still held
    sound.setEnabled(false);
    expect(log.at(-1)).toBe('all off');
  });
});
