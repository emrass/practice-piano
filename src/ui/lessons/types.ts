import type { ReactNode, RefObject } from 'react';
import type { Exercise } from '../../core/exercise';
import type { PcSpelling } from '../../core/music/pitch';
import type { ProgressState } from '../../core/progress/progress';
import type { Settings, SettingsPatch } from '../../core/settings';
import type { PracticeState, Session } from '../practice/session';

/** What every lesson module gets from the studio. */
export interface LessonContext {
  settings: Settings;
  progress: ProgressState;
  /** Latest progress for callbacks (the rendered `progress` can be a step behind). */
  progressRef: RefObject<ProgressState>;
  setProgress: (progress: ProgressState) => void;
  /** Settings change, passed through the active lesson's `onPatch` first. */
  update: (patch: SettingsPatch) => void;
  /** Seed of the current exercise; `reseed` makes a new exercise. */
  seed: number;
  reseed: () => void;
  /** Changes on every retry: a fresh run of the same exercise. */
  retryToken: number;
  now: number;
}

/** Which keyboard display settings apply to a lesson (the rest are greyed out in the keyboard bar). */
export interface KeyboardAvailability {
  /** Why a setting does not apply here, shown with it greyed out. */
  unavailable?: { guide?: string; qwertyHints?: string };
  /** What "fit" means here (ear training: a fixed C3–C6 window). Default: fit to the exercise. */
  fitLabel?: string;
}

/**
 * One lesson as the studio sees it: the current exercise and how to practise it, the lesson's
 * settings panel and stage, and how it reacts to "next", "easier / harder" and settings
 * changes. Each lesson builds this in its own hook (ui/lessons/<lesson>.tsx); App.tsx only
 * picks the active one.
 */
export interface LessonRuntime {
  exercise: Exercise;
  /** The practice session for the current exercise (a new one per exercise, mode or retry). */
  session: Session;
  /** Prepare and show a new exercise (next review item, shuffled key, fresh weak spots…). */
  next: () => void;
  /** Piano F / G after a run: one level (or one tempo step) easier or harder. */
  step: (direction: 1 | -1) => void;
  /** React to a settings change before it is applied (e.g. switching on review). */
  onPatch?: (patch: SettingsPatch) => void;
  /** The Exercise tab of the sidebar. */
  panel: ReactNode;
  /** What to show instead of the engraved score (chord chart, play from memory), if anything. */
  stage?: (session: Session) => ReactNode;
  /** Engraved score options. */
  score?: { showFingering?: boolean };
  /** The Wait / Flow switch in the top bar, for lessons that have both. */
  mode?: { value: 'wait' | 'flow'; set: (mode: 'wait' | 'flow') => void };
  /** Weak-spot focus is shaping this exercise (shown in the meta strip). */
  focusActive: boolean;
  keyboard: {
    /** Keys the on-screen keyboard must show (fitted to the keyboard size around them). */
    span: { min: number; max: number };
    /** Computer-keyboard mapping that replaces the usual piano layout (rhythm: J / F). */
    qwerty?: ReadonlyMap<string, number>;
    /** Labels on keys (rhythm: the designated keys). */
    markers?: ReadonlyMap<number, string>;
    /** How the keys and held notes are spelled at this point of the run (chords: as the chord asked for). */
    spelling?: (state: PracticeState) => PcSpelling | undefined;
  } & KeyboardAvailability;
  /** Progress tab: review the due items (repertoire lessons). */
  review?: () => void;
  /** Progress tab: practise the weak spots it lists. */
  practiceWeakSpots: () => void;
  /** New exercises start on their own once audio is unlocked (ear training plays the phrase). */
  autoStart?: boolean;
}
