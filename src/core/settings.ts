import { KEYS } from './music/keys';
import { TIME_SIGNATURE_IDS, type TimeSignatureId } from './music/rhythm';
import { KEYBOARD_SIZES, type KeyboardSize } from './keyboard/range';
import type { GeneratorSettings } from './generator/generator';
import type { EarSettings } from './ear/generator';
import { LESSON_IDS, type LessonId } from './lessons';
import {
  CHORD_SET_IDS,
  type ChordHands,
  type ChordPrompt,
  type ChordSetId,
  findProgression,
  type InversionRule,
  keysFor,
  PROGRESSIONS,
} from './chords/catalog';
import { SCALE_TYPE_IDS, SCALE_TYPES, type NoteValue, type ScaleHands, type ScaleTypeId } from './scales/catalog';
import { RHYTHM_TEXTURES, type RhythmHands, type RhythmSettings, type RhythmTask, type RhythmTexture } from './rhythm/generator';

export const SETTINGS_SCHEMA_VERSION = 2;

export type AudioSetup = 'speakers' | 'headphones' | 'calibrated' | 'custom';
export type SustainScoring = 'ignore' | 'hold';
export type Theme = 'light' | 'dark';

/** Sight reading: the generator's settings (keyboard size comes from Display) and the mode. */
export interface SightSettings extends Omit<GeneratorSettings, 'keyboardSize' | 'focus' | 'focusFigures'> {
  bars: 4 | 8 | 16;
  mode: 'wait' | 'flow';
}

/** Ear training: what the phrase generator takes (weak-spot focus is added per run). */
export type EarLessonSettings = Omit<EarSettings, 'focusIntervals'>;

/** Rhythm: what the rhythm generator takes, designated keys included (focus is added per run). */
export interface RhythmLessonSettings extends Omit<RhythmSettings, 'focusFigures'> {
  task: RhythmTask;
  hands: RhythmHands;
  texture: 'auto' | RhythmTexture;
  bars: 4 | 8;
  timeSignature: 'auto' | TimeSignatureId;
}

export interface ScaleSettings {
  type: ScaleTypeId;
  /** A tonic from the type's list, or 'shuffle' for a different key each run. */
  tonic: string;
  hands: ScaleHands;
  octaves: 1 | 2;
  noteValue: NoteValue;
  /** Wait = learn (self-paced), Flow = play with the metronome on the tempo ladder. */
  mode: 'wait' | 'flow';
  /** 'review' practises the items that are due (spaced repetition). */
  source: 'pick' | 'review';
  /** Mastery goal in notes per second. */
  goalNps: number;
  showFingering: boolean;
  /** false = play from memory (notation hidden). */
  notation: boolean;
}

export interface ChordSettings {
  task: 'drill' | 'progression';
  set: ChordSetId;
  /** Drill: chords named by symbol, or written on the staff. */
  prompt: ChordPrompt;
  inversions: InversionRule;
  /** Drill length in chords. */
  count: 8 | 12 | 16;
  progression: string;
  /** A key the progression's mode has, or 'shuffle'. */
  key: string;
  hands: ChordHands;
  mode: 'wait' | 'flow';
  source: 'pick' | 'review';
  /** Mastery goal in bpm (one chord per bar). */
  goalBpm: number;
  /** Progressions: show the suggested voicing on the staff (off = play from the chord chart). */
  notation: boolean;
}

/** The lessons' own settings, one group per lesson. */
export interface LessonSettings {
  sight: SightSettings;
  ear: EarLessonSettings;
  rhythm: RhythmLessonSettings;
  scales: ScaleSettings;
  chords: ChordSettings;
}

/** Everything else is shared by all lessons. */
export interface Settings extends LessonSettings {
  schemaVersion: number;
  lesson: LessonId;
  /** Volume of the built-in piano sound (ear training playback, key sound), 0–1. */
  synthVolume: number;
  /** Draw more of what you miss (weak notes, intervals, figures, chords). */
  weakSpotFocus: boolean;
  // Practice
  /** Wait mode: keys of a chord may arrive this far apart. */
  chordGraceMs: number;
  sustainScoring: SustainScoring;
  countInBars: 1 | 2;
  // Display
  keyboardSize: KeyboardSize;
  keyboardView: 'fit' | 'full';
  /** Letter names under the notes (sight reading and ear training; other lessons print their own). */
  showStaffNames: boolean;
  /** Letter names on the on-screen keys. */
  showKeyNames: boolean;
  showKeyboardGuide: boolean;
  showQwertyHints: boolean;
  /** Play the synth for on-screen and computer keys (off: a MIDI piano makes its own sound). */
  keySound: boolean;
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

/** A change to settings: shared fields as they are, lesson groups field by field. */
export type SettingsPatch = Partial<Omit<Settings, keyof LessonSettings>> & { [K in keyof LessonSettings]?: Partial<LessonSettings[K]> };

const LESSON_GROUPS = ['sight', 'ear', 'rhythm', 'scales', 'chords'] as const satisfies readonly (keyof LessonSettings)[];

/** Apply a patch: lesson groups merge field by field, everything else is replaced. */
export function applySettingsPatch(prev: Settings, patch: SettingsPatch): Settings {
  const next = { ...prev, ...patch } as Settings;
  for (const g of LESSON_GROUPS) {
    const part = patch[g];
    if (part) (next as unknown as Record<string, unknown>)[g] = { ...prev[g], ...part };
  }
  return next;
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
  sight: {
    level: 1,
    hands: 'rh',
    bars: 4,
    keyId: 'auto',
    timeSignature: 'auto',
    rhythmComplexity: 'auto',
    maxPolyphony: 'auto',
    bpm: null,
    mode: 'wait',
  },
  ear: { level: 1, length: 'auto', reference: 'auto', keyId: 'auto' },
  rhythm: {
    level: 1,
    task: 'read',
    hands: 'rh',
    texture: 'auto',
    bars: 4,
    timeSignature: 'auto',
    bpm: null,
    rhKey: 72,
    lhKey: 48,
  },
  scales: {
    type: 'major',
    tonic: 'C',
    hands: 'rh',
    octaves: 1,
    noteValue: 'eighth',
    mode: 'wait',
    source: 'pick',
    goalNps: 4,
    showFingering: true,
    notation: true,
  },
  chords: {
    task: 'drill',
    set: 'triads',
    prompt: 'symbol',
    inversions: 'root',
    count: 8,
    progression: 'I-IV-V-I',
    key: 'C',
    hands: 'rh',
    mode: 'wait',
    source: 'pick',
    goalBpm: 80,
    notation: true,
  },
  synthVolume: 0.8,
  weakSpotFocus: false,
  chordGraceMs: 75,
  sustainScoring: 'ignore',
  countInBars: 1,
  keyboardSize: 88,
  keyboardView: 'fit',
  showStaffNames: true,
  showKeyNames: true,
  showKeyboardGuide: true,
  showQwertyHints: false,
  keySound: false,
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

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const group = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const optionalBpm = (v: unknown) => (v === null || v === undefined ? null : Math.round(clampNum(v, 30, 240, 80)));

/**
 * Validate & fill settings loaded from storage / import, so bad data never crashes the app.
 * Lesson settings from before the per-lesson groups (schema 1) are not carried over.
 */
export function normalizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return structuredClone(d);
  const r = raw as Record<string, unknown>;
  const latencyMs = Math.round(clampNum(r.latencyMs, 0, 300, d.latencyMs));
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    lesson: oneOf(r.lesson, LESSON_IDS, d.lesson),
    sight: normalizeSight(group(r.sight)),
    ear: normalizeEar(group(r.ear)),
    rhythm: normalizeRhythm(group(r.rhythm)),
    scales: normalizeScales(group(r.scales)),
    chords: normalizeChords(group(r.chords)),
    synthVolume: clampNum(r.synthVolume, 0, 1, d.synthVolume),
    weakSpotFocus: bool(r.weakSpotFocus, d.weakSpotFocus),
    chordGraceMs: Math.round(clampNum(r.chordGraceMs, 20, 200, d.chordGraceMs)),
    sustainScoring: oneOf(r.sustainScoring, ['ignore', 'hold'] as const, d.sustainScoring),
    countInBars: oneOf(r.countInBars, [1, 2] as const, d.countInBars),
    keyboardSize: oneOf(r.keyboardSize, KEYBOARD_SIZES, d.keyboardSize),
    keyboardView: oneOf(r.keyboardView, ['fit', 'full'] as const, d.keyboardView),
    // Older settings had one `showNoteNames` for both.
    showStaffNames: bool(r.showStaffNames, bool(r.showNoteNames, d.showStaffNames)),
    showKeyNames: bool(r.showKeyNames, bool(r.showNoteNames, d.showKeyNames)),
    showKeyboardGuide: bool(r.showKeyboardGuide, d.showKeyboardGuide),
    showQwertyHints: bool(r.showQwertyHints, d.showQwertyHints),
    keySound: bool(r.keySound, d.keySound),
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
    pianoShortcuts: bool(r.pianoShortcuts, d.pianoShortcuts),
  };
}

function normalizeSight(r: Record<string, unknown>): SightSettings {
  const d = DEFAULT_SETTINGS.sight;
  return {
    level: Math.round(clampNum(r.level, 1, 100, d.level)),
    hands: oneOf(r.hands, ['rh', 'lh', 'alternating', 'both'] as const, d.hands),
    bars: oneOf(r.bars, [4, 8, 16] as const, d.bars),
    keyId: oneOf(r.keyId, ['auto', ...KEYS.map((k) => k.id)], d.keyId),
    timeSignature: oneOf(r.timeSignature, ['auto', ...TIME_SIGNATURE_IDS] as const, d.timeSignature),
    rhythmComplexity: autoOrInt(r.rhythmComplexity, 0, 4),
    maxPolyphony: autoOrInt(r.maxPolyphony, 1, 4),
    bpm: optionalBpm(r.bpm),
    mode: oneOf(r.mode, ['wait', 'flow'] as const, d.mode),
  };
}

function normalizeEar(r: Record<string, unknown>): EarLessonSettings {
  const d = DEFAULT_SETTINGS.ear;
  return {
    level: Math.round(clampNum(r.level, 1, 100, d.level)),
    length: autoOrInt(r.length, 2, 8),
    reference: oneOf(r.reference, ['auto', 'first-note', 'key-only'] as const, d.reference),
    keyId: oneOf(r.keyId, ['auto', ...KEYS.map((k) => k.id)], d.keyId),
  };
}

function normalizeRhythm(r: Record<string, unknown>): RhythmLessonSettings {
  const d = DEFAULT_SETTINGS.rhythm;
  return {
    level: Math.round(clampNum(r.level, 1, 100, d.level)),
    task: oneOf(r.task, ['read', 'echo', 'pulse'] as const, d.task),
    hands: oneOf(r.hands, ['rh', 'lh', 'both'] as const, d.hands),
    texture: oneOf(r.texture, ['auto', ...RHYTHM_TEXTURES] as const, d.texture),
    bars: oneOf(r.bars, [4, 8] as const, d.bars),
    timeSignature: oneOf(r.timeSignature, ['auto', ...TIME_SIGNATURE_IDS] as const, d.timeSignature),
    bpm: optionalBpm(r.bpm),
    ...designatedKeys(r.rhKey, r.lhKey),
  };
}

function normalizeScales(r: Record<string, unknown>): ScaleSettings {
  const d = DEFAULT_SETTINGS.scales;
  return {
    ...scaleChoice(r.type, r.tonic, r.hands),
    octaves: oneOf(r.octaves, [1, 2] as const, d.octaves),
    noteValue: oneOf(r.noteValue, ['quarter', 'eighth', 'sixteenth'] as const, d.noteValue),
    mode: oneOf(r.mode, ['wait', 'flow'] as const, d.mode),
    source: oneOf(r.source, ['pick', 'review'] as const, d.source),
    goalNps: Math.round(clampNum(r.goalNps, 1, 12, d.goalNps)),
    showFingering: bool(r.showFingering, d.showFingering),
    notation: bool(r.notation, d.notation),
  };
}

function normalizeChords(r: Record<string, unknown>): ChordSettings {
  const d = DEFAULT_SETTINGS.chords;
  return {
    task: oneOf(r.task, ['drill', 'progression'] as const, d.task),
    set: oneOf(r.set, CHORD_SET_IDS, d.set),
    prompt: oneOf(r.prompt, ['symbol', 'notation'] as const, d.prompt),
    inversions: oneOf(r.inversions, ['any', 'root', 'inversions'] as const, d.inversions),
    count: oneOf(r.count, [8, 12, 16] as const, d.count),
    ...progressionChoice(r.progression, r.key),
    hands: oneOf(r.hands, ['rh', 'lh-bass'] as const, d.hands),
    mode: oneOf(r.mode, ['wait', 'flow'] as const, d.mode),
    source: oneOf(r.source, ['pick', 'review'] as const, d.source),
    goalBpm: Math.round(clampNum(r.goalBpm, 40, 160, d.goalBpm)),
    notation: bool(r.notation, d.notation),
  };
}

/** A progression and a key of its mode (major keys for major progressions, minor for minor). */
export function progressionChoice(progression: unknown, key: unknown): Pick<ChordSettings, 'progression' | 'key'> {
  const def = findProgression(progression as string) ?? findProgression(DEFAULT_SETTINGS.chords.progression) ?? PROGRESSIONS[0];
  const keys = keysFor(def.mode);
  return { progression: def.id, key: key === 'shuffle' || keys.includes(key as string) ? (key as string) : keys[0] };
}

/** Scale type, key and hands that belong together (contrary motion only where it exists). */
function scaleChoice(type: unknown, tonic: unknown, hands: unknown): Pick<ScaleSettings, 'type' | 'tonic' | 'hands'> {
  const d = DEFAULT_SETTINGS.scales;
  const scaleType = oneOf(type, SCALE_TYPE_IDS, d.type);
  const def = SCALE_TYPES[scaleType];
  const scaleTonic = tonic === 'shuffle' || def.tonics.includes(tonic as string) ? (tonic as string) : def.tonics[0];
  let scaleHands = oneOf(hands, ['rh', 'lh', 'together', 'contrary'] as const, d.hands);
  if (scaleHands === 'contrary' && !def.contrary) scaleHands = 'together';
  return { type: scaleType, tonic: scaleTonic, hands: scaleHands };
}

/** Designated rhythm keys: valid MIDI notes, and never the same key for both hands. */
function designatedKeys(rh: unknown, lh: unknown): Pick<RhythmLessonSettings, 'rhKey' | 'lhKey'> {
  const d = DEFAULT_SETTINGS.rhythm;
  const rhKey = Math.round(clampNum(rh, 21, 108, d.rhKey));
  let lhKey = Math.round(clampNum(lh, 21, 108, d.lhKey));
  if (lhKey === rhKey) lhKey = rhKey >= 45 ? rhKey - 24 : rhKey + 24;
  return { rhKey, lhKey };
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
  const { mode: _mode, ...sight } = s.sight;
  return { ...sight, keyboardSize: s.keyboardSize };
}
