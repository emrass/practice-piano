import type { Exercise } from '../../core/exercise';
import type { TimingGrade } from '../../core/eval/flowEngine';
import type { ExerciseResult, LiveStats, PracticeMode } from '../../core/eval/types';
import type { Emitter, Store } from '../../lib/store';

export type StepMark = 'good' | 'ok' | 'bad' | 'missed' | 'call';
export type PracticeStatus = 'ready' | 'countin' | 'running' | 'finished';

export interface PracticeState {
  status: PracticeStatus;
  mode: PracticeMode;
  stepIndex: number;
  /** Keys the keyboard guide highlights (shown only while the guide is on). */
  expected: number[];
  /** Keys shown whatever the guide setting: a hint asked for, a given starting note. */
  revealed: number[];
  countIn: { beat: number; total: number } | null;
  beat: { index: number; beatsPerBar: number } | null;
  live: LiveStats;
  marks: Record<number, StepMark>;
  wrong: { midi: number; at: number } | null;
  lastGrade: { grade: TimingGrade; deltaMs: number; at: number } | null;
  result: ExerciseResult | null;
  /** Ear training: steps with index < visibleSteps are shown; undefined = all shown. */
  visibleSteps?: number;
  /** Rhythm Echo: bars with index < visibleBars are shown; undefined = all shown. */
  visibleBars?: number;
  /** Rhythm mode: what the current bar is (Echo call / response, Pulse click / silent). */
  rhythm?: { phase: 'call' | 'response' | 'click' | 'silent' | null };
  ear?: { playing: boolean; listened: boolean; replays: number; hints: number };
  /** Chords: the chord asked for, and a nudge when the right notes have the wrong bass. */
  chords?: { index: number; bassHint: string | null };
}

/**
 * What the UI needs from any lesson's practice session (sight-reading Wait/Flow, ear
 * training, rhythm, scales, chords). Score view, practice bar, keyboard, results and piano
 * shortcuts all work against this interface; `SessionBase` (sessionBase.ts) holds the
 * plumbing the controllers share.
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
  /** Ear training: reveal the next note. */
  hint?(): void;
  dispose(): void;
}
