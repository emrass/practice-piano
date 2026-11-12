import { HeldNotesTracker, type HeldState, type NoteInput } from '../core/input/events';
import { createStore, Emitter } from '../lib/store';

/**
 * Single funnel for all performance input. MIDI devices, the on-screen keyboard and the
 * computer keyboard all publish here; practice sessions and the input monitor subscribe.
 */
export class InputBus {
  private readonly emitter = new Emitter<NoteInput>();
  private readonly tracker = new HeldNotesTracker();
  readonly held = createStore<HeldState>({ held: [], sustained: [], sustain: false });
  private exclusive: ((ev: NoteInput) => void) | null = null;

  publish(ev: NoteInput): void {
    this.tracker.apply(ev);
    this.held.set(this.tracker.snapshot());
    if (this.exclusive) this.exclusive(ev);
    else this.emitter.emit(ev);
  }

  /**
   * Route all input to one listener (e.g. latency calibration) so it can't also drive the
   * practice session or piano shortcuts. Returns a release function.
   */
  capture(listener: (ev: NoteInput) => void): () => void {
    this.exclusive = listener;
    return () => {
      if (this.exclusive === listener) this.exclusive = null;
    };
  }

  get isCaptured(): boolean {
    return this.exclusive !== null;
  }

  subscribe(listener: (ev: NoteInput) => void): () => void {
    return this.emitter.on(listener);
  }

  /** Release everything from one source (e.g. window blur, device unplugged). */
  releaseAll(source: NoteInput['source'], time: number): void {
    for (const midi of this.held.get().held) this.publish({ kind: 'noteOff', midi, time, source });
  }
}

export const inputBus = new InputBus();
