import type { NoteInput } from './events';

/** Actions available from the piano after an exercise. Any octave works. */
export type PianoAction = 'retry' | 'next' | 'close' | 'easier' | 'harder';

export const PIANO_ACTIONS: readonly { pc: number; key: string; action: PianoAction; label: string }[] = [
  { pc: 0, key: 'C', action: 'retry', label: 'Retry' },
  { pc: 2, key: 'D', action: 'next', label: 'Next' },
  { pc: 4, key: 'E', action: 'close', label: 'Close' },
  { pc: 5, key: 'F', action: 'easier', label: 'Easier' },
  { pc: 7, key: 'G', action: 'harder', label: 'Harder' },
];

export function pianoActionFor(midi: number): PianoAction | null {
  const pc = ((midi % 12) + 12) % 12;
  return PIANO_ACTIONS.find((a) => a.pc === pc)?.action ?? null;
}

/** Delay after an exercise ends before piano shortcuts react. */
export const SHORTCUT_ARM_MS = 600;
/** A pedal press shorter than this counts as a "tap". */
export const PEDAL_TAP_MS = 450;

/**
 * Decides when a key press is a navigation command rather than music.
 *
 * Shortcuts arm only after the exercise has finished, a short grace period has passed
 * and the press starts from silence (no key still held). So the last notes of a piece,
 * a held final chord or an over-eager extra note never trigger anything.
 */
export class PianoShortcutGate {
  private readonly held = new Set<number>();
  private finishedAt: number | null = null;
  private pedalDownAt: number | null = null;

  /** New session started: shortcuts are off. */
  reset(): void {
    this.finishedAt = null;
  }

  /** The exercise just ended. */
  finish(time: number): void {
    this.finishedAt = time;
  }

  get isFinished(): boolean {
    return this.finishedAt !== null;
  }

  /** Returns the navigation action for this input, if any. Call for every input event. */
  handle(ev: NoteInput): PianoAction | null {
    if (ev.kind === 'noteOff') {
      this.held.delete(ev.midi);
      return null;
    }
    if (ev.kind === 'allOff') {
      this.held.clear();
      return null;
    }
    if (ev.kind !== 'noteOn') return null;
    const fromSilence = this.held.size === 0;
    this.held.add(ev.midi);
    if (this.finishedAt === null || ev.time < this.finishedAt + SHORTCUT_ARM_MS || !fromSilence) return null;
    return pianoActionFor(ev.midi);
  }

  /** Sustain-pedal tap (press + quick release). Returns true on the release of a tap. */
  pedalTap(ev: NoteInput): boolean {
    if (ev.kind !== 'sustain') return false;
    if (ev.down) {
      this.pedalDownAt = ev.time;
      return false;
    }
    const tapped = this.pedalDownAt !== null && ev.time - this.pedalDownAt <= PEDAL_TAP_MS;
    this.pedalDownAt = null;
    return tapped;
  }
}
