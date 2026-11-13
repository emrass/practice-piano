import type { NoteInput } from '../core/input/events';

export interface KeySoundOutput {
  startNote(midi: number, velocity: number, volume: number): void;
  stopNote(midi: number): void;
  stopAllNotes(): void;
}

/**
 * Sound for the on-screen and computer keys. MIDI input stays silent — a digital piano makes
 * its own sound, and doubling it would be confusing — so this is opt-in. The sustain pedal
 * (Shift, or the piano's pedal) holds notes until it is released.
 */
export class KeySound {
  private readonly sounding = new Set<number>();
  private readonly held = new Set<number>();
  private sustain = false;
  enabled = false;
  volume = 0.8;

  constructor(private readonly out: KeySoundOutput) {}

  handle(ev: NoteInput): void {
    switch (ev.kind) {
      case 'noteOn':
        if (!this.enabled || ev.source === 'midi') return;
        this.out.startNote(ev.midi, ev.velocity / 127, this.volume);
        this.sounding.add(ev.midi);
        this.held.add(ev.midi);
        return;
      case 'noteOff':
        if (ev.source === 'midi' || !this.held.delete(ev.midi)) return;
        if (!this.sustain) this.release(ev.midi);
        return;
      case 'sustain':
        this.sustain = ev.down;
        if (!ev.down) for (const midi of [...this.sounding]) if (!this.held.has(midi)) this.release(midi);
        return;
      case 'allOff':
        this.silence();
        return;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.silence();
  }

  private release(midi: number): void {
    this.sounding.delete(midi);
    this.out.stopNote(midi);
  }

  private silence(): void {
    this.sounding.clear();
    this.held.clear();
    this.out.stopAllNotes();
  }
}
