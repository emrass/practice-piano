import type { Exercise } from '../../core/exercise';
import type { ExerciseResult } from '../../core/eval/types';
import type { Emitter, Store } from '../../lib/store';
import type { PracticeState } from './PracticeController';

/**
 * What the UI needs from any lesson's practice session (sight-reading Wait/Flow, ear
 * training, and future lesson types). Score view, practice bar, keyboard, results and
 * piano shortcuts all work against this interface.
 */
export interface Session {
  readonly state: Store<PracticeState>;
  /** Fires once per completed run. */
  readonly finished: Emitter<ExerciseResult>;
  readonly exercise: Exercise;
  /** Something time-based is running (count-in / playback) that should be stopped first. */
  readonly isActive: boolean;
  attach(): () => void;
  /** Primary action: Flow → start count-in, Wait → restart, Ear → listen / replay. */
  start(): void;
  stop(): void;
  /** Flow playhead position in ticks, null when there is no moving playhead. */
  playheadTick(now?: number): number | null;
  setMetronomeVolume(volume: number): void;
  dispose(): void;
}
