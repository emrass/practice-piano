import type { HandsMode } from './exercise';
import type { PracticeMode } from './eval/types';
import { KEYS } from './music/keys';
import { TIME_SIGNATURE_IDS, type TimeSignatureId } from './music/rhythm';
import { KEYBOARD_SIZES, type KeyboardSize } from './keyboard/range';
import type { GeneratorSettings } from './generator/generator';
import type { EarReference, EarSettings } from './ear/generator';
import { LESSON_IDS, type LessonId } from './lessons';
import { RHYTHM_TEXTURES, type RhythmHands, type RhythmSettings, type RhythmTask, type RhythmTexture } from './rhythm/generator';

export const SETTINGS_SCHEMA_VERSION = 1;

export type AudioSetup = 'speakers' | 'headphones' | 'calibrated' | 'custom';
export type SustainScoring = 'ignore' | 'hold';
export type Theme = 'light' | 'dark';

export interface Settings {
  schemaVersion: number;
  lesson: LessonId;
  // Ear training
  earLevel: number;
  earLength: 'auto' | number;
  earReference: EarReference;
  earKeyId: string;
  /** Volume of the built-in piano sound (ear training playback), 0–1. */
  synthVolume: number;
  // Rhythm
  rhythmLevel: number;
  rhythmTask: RhythmTask;
  rhythmHands: RhythmHands;
  rhythmTexture: 'auto' | RhythmTexture;
  rhythmBars: 4 | 8;
  rhythmTimeSignature: 'auto' | TimeSignatureId;
  rhythmBpm: number | null;
  /** Designated keys (MIDI) for the right and left hand. */
  rhythmRhKey: number;
  rhythmLhKey: number;
  // Sight-reading exercise
  level: number;
  hands: HandsMode;
  bars: 4 | 8 | 16;
  keyId: string; // 'auto' | key id
  timeSignature: 'auto' | TimeSignatureId;
  rhythmComplexity: 'auto' | number;
  maxPolyphony: 'auto' | number;
  bpm: number | null; // null = auto
  weakSpotFocus: boolean;
  // Practice
  mode: PracticeMode;
  chordGraceMs: number;
  sustainScoring: SustainScoring;
  countInBars: 1 | 2;
  // Display
  keyboardSize: KeyboardSize;
  keyboardView: 'fit' | 'full';
  showNoteNames: boolean;
  showKeyboardGuide: boolean;
  showQwertyHints: boolean;
  theme: Theme;
  // Audio / latency
  audioSetup: AudioSetup;
  /** Subtracted from note timestamps when judging Flow-mode timing. */
  latencyMs: number;
  /** How far the Flow playhead lags real time so it matches the (late) heard click. */
  playheadDelayMs: number;
  calibration: LatencyCalibration | null;
  metronomeVolume: number;
  // Input
  midiInputId: string; // 'auto' | device id
  /** Play C/D/E/F/G after an exercise to retry / next / close / easier / harder. */
  pianoShortcuts: boolean;
}

export interface LatencyCalibration {
  at: number;
  latencyMs: number;
  spreadMs: number;
  taps: number;
  playheadDelayMs: number | null;
  /** Input source the taps came from (midi / screen / qwerty). */
  source: string;
}

export const LATENCY_PRESETS: Readonly<Record<'speakers' | 'headphones', { latencyMs: number; playheadDelayMs: number; label: string; help: string }>> = {
  speakers: {
    latencyMs: 15,
    playheadDelayMs: 0,
    label: 'Device speakers',
    help: 'Piano plays through its own speakers; metronome from this device. Bluetooth MIDI adds ~15 ms.',
  },
  headphones: {
    latencyMs: 180,
    playheadDelayMs: 165,
    label: 'Headphones on piano',
    help: 'Metronome is streamed to the piano over Bluetooth audio (~180 ms), so you hear it late.',
  },
};

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  lesson: 'sight',
  earLevel: 1,
  earLength: 'auto',
  earReference: 'auto',
  earKeyId: 'auto',
  synthVolume: 0.8,
  rhythmLevel: 1,
  rhythmTask: 'read',
  rhythmHands: 'rh',
  rhythmTexture: 'auto',
  rhythmBars: 4,
  rhythmTimeSignature: 'auto',
  rhythmBpm: null,
  rhythmRhKey: 72,
  rhythmLhKey: 48,
  level: 1,
  hands: 'rh',
  bars: 4,
  keyId: 'auto',
  timeSignature: 'auto',
  rhythmComplexity: 'auto',
  maxPolyphony: 'auto',
  bpm: null,
  weakSpotFocus: false,
  mode: 'wait',
  chordGraceMs: 75,
  sustainScoring: 'ignore',
  countInBars: 1,
  keyboardSize: 88,
  keyboardView: 'fit',
  showNoteNames: true,
  showKeyboardGuide: true,
  showQwertyHints: false,
  theme: 'light',
  audioSetup: 'speakers',
  latencyMs: 15,
  playheadDelayMs: 0,
  calibration: null,
  metronomeVolume: 0.7,
  midiInputId: 'auto',
  pianoShortcuts: true,
};

function clampNum(v: unknown, lo: number, hi: number, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}

function autoOrInt(v: unknown, lo: number, hi: number): 'auto' | number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : 'auto';
}

function oneOf<T>(v: unknown, allowed: readonly T[], d: T): T {
  return allowed.includes(v as T) ? (v as T) : d;
}

/** Validate & fill settings loaded from storage / import, so bad data never crashes the app. */
export function normalizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Record<string, unknown>;
  const latencyMs = Math.round(clampNum(r.latencyMs, 0, 300, d.latencyMs));
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    lesson: oneOf(r.lesson, LESSON_IDS, d.lesson),
    earLevel: Math.round(clampNum(r.earLevel, 1, 100, d.earLevel)),
    earLength: autoOrInt(r.earLength, 2, 8),
    earReference: oneOf(r.earReference, ['auto', 'first-note', 'key-only'] as const, d.earReference),
    earKeyId: oneOf(r.earKeyId, ['auto', ...KEYS.map((k) => k.id)], d.earKeyId),
    synthVolume: clampNum(r.synthVolume, 0, 1, d.synthVolume),
    rhythmLevel: Math.round(clampNum(r.rhythmLevel, 1, 100, d.rhythmLevel)),
    rhythmTask: oneOf(r.rhythmTask, ['read', 'echo', 'pulse'] as const, d.rhythmTask),
    rhythmHands: oneOf(r.rhythmHands, ['rh', 'lh', 'both'] as const, d.rhythmHands),
    rhythmTexture: oneOf(r.rhythmTexture, ['auto', ...RHYTHM_TEXTURES] as const, d.rhythmTexture),
    rhythmBars: oneOf(r.rhythmBars, [4, 8] as const, d.rhythmBars),
    rhythmTimeSignature: oneOf(r.rhythmTimeSignature, ['auto', ...TIME_SIGNATURE_IDS] as const, d.rhythmTimeSignature),
    rhythmBpm: r.rhythmBpm === null || r.rhythmBpm === undefined ? null : Math.round(clampNum(r.rhythmBpm, 30, 240, 80)),
    ...designatedKeys(r.rhythmRhKey, r.rhythmLhKey),
    level: Math.round(clampNum(r.level, 1, 100, d.level)),
    hands: oneOf(r.hands, ['rh', 'lh', 'alternating', 'both'] as const, d.hands),
    bars: oneOf(r.bars, [4, 8, 16] as const, d.bars),
    keyId: oneOf(r.keyId, ['auto', ...KEYS.map((k) => k.id)], d.keyId),
    timeSignature: oneOf(r.timeSignature, ['auto', ...TIME_SIGNATURE_IDS] as const, d.timeSignature),
    rhythmComplexity: autoOrInt(r.rhythmComplexity, 0, 4),
    maxPolyphony: autoOrInt(r.maxPolyphony, 1, 4),
    bpm: r.bpm === null || r.bpm === undefined ? null : Math.round(clampNum(r.bpm, 30, 240, 80)),
    weakSpotFocus: typeof r.weakSpotFocus === 'boolean' ? r.weakSpotFocus : d.weakSpotFocus,
    mode: oneOf(r.mode, ['wait', 'flow'] as const, d.mode),
    chordGraceMs: Math.round(clampNum(r.chordGraceMs, 20, 200, d.chordGraceMs)),
    sustainScoring: oneOf(r.sustainScoring, ['ignore', 'hold'] as const, d.sustainScoring),
    countInBars: oneOf(r.countInBars, [1, 2] as const, d.countInBars),
    keyboardSize: oneOf(r.keyboardSize, KEYBOARD_SIZES, d.keyboardSize),
    keyboardView: oneOf(r.keyboardView, ['fit', 'full'] as const, d.keyboardView),
    showNoteNames: typeof r.showNoteNames === 'boolean' ? r.showNoteNames : d.showNoteNames,
    showKeyboardGuide: typeof r.showKeyboardGuide === 'boolean' ? r.showKeyboardGuide : d.showKeyboardGuide,
    showQwertyHints: typeof r.showQwertyHints === 'boolean' ? r.showQwertyHints : d.showQwertyHints,
    theme: oneOf(r.theme, ['light', 'dark'] as const, d.theme),
    audioSetup: oneOf(r.audioSetup, ['speakers', 'headphones', 'calibrated', 'custom'] as const, d.audioSetup),
    latencyMs,
    // v1.0 stored a boolean `delayPlayhead` that reused the full latency.
    playheadDelayMs:
      typeof r.playheadDelayMs === 'number'
        ? Math.round(clampNum(r.playheadDelayMs, 0, 300, 0))
        : r.delayPlayhead === true
          ? latencyMs
          : d.playheadDelayMs,
    calibration: normalizeCalibration(r.calibration),
    metronomeVolume: clampNum(r.metronomeVolume, 0, 1, d.metronomeVolume),
    midiInputId: typeof r.midiInputId === 'string' && r.midiInputId ? r.midiInputId : d.midiInputId,
    pianoShortcuts: typeof r.pianoShortcuts === 'boolean' ? r.pianoShortcuts : d.pianoShortcuts,
  };
}

/** Designated rhythm keys: valid MIDI notes, and never the same key for both hands. */
function designatedKeys(rh: unknown, lh: unknown): { rhythmRhKey: number; rhythmLhKey: number } {
  const d = DEFAULT_SETTINGS;
  const rhythmRhKey = Math.round(clampNum(rh, 21, 108, d.rhythmRhKey));
  let rhythmLhKey = Math.round(clampNum(lh, 21, 108, d.rhythmLhKey));
  if (rhythmLhKey === rhythmRhKey) rhythmLhKey = rhythmRhKey >= 45 ? rhythmRhKey - 24 : rhythmRhKey + 24;
  return { rhythmRhKey, rhythmLhKey };
}

function normalizeCalibration(raw: unknown): LatencyCalibration | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.at !== 'number' || typeof c.latencyMs !== 'number') return null;
  return {
    at: c.at,
    latencyMs: Math.round(clampNum(c.latencyMs, 0, 300, 0)),
    spreadMs: clampNum(c.spreadMs, 0, 1000, 0),
    taps: Math.round(clampNum(c.taps, 0, 1000, 0)),
    playheadDelayMs: typeof c.playheadDelayMs === 'number' ? Math.round(clampNum(c.playheadDelayMs, 0, 300, 0)) : null,
    source: typeof c.source === 'string' ? c.source : 'midi',
  };
}

export function generatorSettingsFrom(s: Settings): GeneratorSettings {
  return {
    level: s.level,
    hands: s.hands,
    bars: s.bars,
    keyId: s.keyId,
    timeSignature: s.timeSignature,
    rhythmComplexity: s.rhythmComplexity,
    maxPolyphony: s.maxPolyphony,
    bpm: s.bpm,
    keyboardSize: s.keyboardSize,
  };
}

export function earSettingsFrom(s: Settings): EarSettings {
  return { level: s.earLevel, length: s.earLength, reference: s.earReference, keyId: s.earKeyId };
}

export function rhythmSettingsFrom(s: Settings): RhythmSettings {
  return {
    level: s.rhythmLevel,
    task: s.rhythmTask,
    hands: s.rhythmHands,
    texture: s.rhythmTexture,
    bars: s.rhythmBars,
    timeSignature: s.rhythmTimeSignature,
    bpm: s.rhythmBpm,
    rhKey: s.rhythmRhKey,
    lhKey: s.rhythmLhKey,
  };
}
