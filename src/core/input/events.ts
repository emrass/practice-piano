export type InputSource = 'midi' | 'screen' | 'qwerty';

/** Normalised performance input from any source (MIDI, on-screen keys, computer keyboard). */
export type NoteInput =
  | { kind: 'noteOn'; midi: number; velocity: number; time: number; source: InputSource }
  | { kind: 'noteOff'; midi: number; time: number; source: InputSource }
  | { kind: 'sustain'; down: boolean; time: number; source: InputSource }
  | { kind: 'allOff'; time: number; source: InputSource };

export interface HeldState {
  /** Keys physically held (any source). */
  held: number[];
  /** Keys still sounding because of the sustain pedal. */
  sustained: number[];
  sustain: boolean;
}

/**
 * Tracks held keys + sustain pedal for the live input monitor.
 * A key pressed from two sources (e.g. MIDI and mouse) is held until both release.
 */
export class HeldNotesTracker {
  private readonly held = new Map<number, Set<InputSource>>();
  private readonly sustainedSet = new Set<number>();
  private sustain = false;

  apply(ev: NoteInput): void {
    switch (ev.kind) {
      case 'noteOn': {
        const set = this.held.get(ev.midi) ?? new Set<InputSource>();
        set.add(ev.source);
        this.held.set(ev.midi, set);
        this.sustainedSet.delete(ev.midi);
        break;
      }
      case 'noteOff': {
        const set = this.held.get(ev.midi);
        if (!set) break;
        set.delete(ev.source);
        if (set.size === 0) {
          this.held.delete(ev.midi);
          if (this.sustain) this.sustainedSet.add(ev.midi);
        }
        break;
      }
      case 'sustain':
        this.sustain = ev.down;
        if (!ev.down) this.sustainedSet.clear();
        break;
      case 'allOff':
        for (const [midi, set] of this.held) {
          set.delete(ev.source);
          if (set.size === 0) this.held.delete(midi);
        }
        this.sustainedSet.clear();
        break;
    }
  }

  snapshot(): HeldState {
    return {
      held: [...this.held.keys()].sort((a, b) => a - b),
      sustained: [...this.sustainedSet].sort((a, b) => a - b),
      sustain: this.sustain,
    };
  }

  isHeld(midi: number): boolean {
    return this.held.has(midi);
  }
}
