import type { SettingsPatch } from './settings';

/**
 * Where a new player starts (first-run setup, step "How well do you play?").
 *
 * The player picks one overall stage. It is translated into one statement per skill, shown in
 * that skill's own words, and each statement sets the lessons that train the skill. Every
 * level is the first level of a tier, so a statement says what that tier introduces.
 * Starting points are cautious on purpose: a self-description is a rough signal, and too easy
 * costs one "harder" press while too hard makes a bad first exercise.
 */

export const EXPERIENCE_SKILLS = ['reading', 'ear', 'technique'] as const;
export type ExperienceSkill = (typeof EXPERIENCE_SKILLS)[number];

/** The chosen statement of each skill, as an index into its list. */
export type ExperienceSelection = Readonly<Record<ExperienceSkill, number>>;

export interface ExperienceStatement {
  text: string;
  /** Sets every field the skill governs, so moving between statements leaves nothing behind. */
  patch: SettingsPatch;
}

export interface ExperienceSkillInfo {
  name: string;
  /** The lessons the skill sets, for the hint under its dropdown. */
  lessons: string;
  statements: readonly ExperienceStatement[];
}

export const SKILLS: Readonly<Record<ExperienceSkill, ExperienceSkillInfo>> = {
  reading: {
    name: 'Reading music',
    lessons: 'Sight reading and Rhythm',
    statements: [
      { text: 'I can’t read notes yet', patch: { sight: { level: 1, hands: 'rh' }, rhythm: { level: 1 } } },
      { text: 'I read a few notes around middle C', patch: { sight: { level: 10, hands: 'rh' }, rhythm: { level: 1 } } },
      { text: 'I read simple melodies, one hand at a time', patch: { sight: { level: 13, hands: 'alternating' }, rhythm: { level: 9 } } },
      { text: 'I read both hands in easy keys', patch: { sight: { level: 16, hands: 'both' }, rhythm: { level: 17 } } },
      { text: 'I read both hands with sharps, flats and dotted rhythms', patch: { sight: { level: 36, hands: 'both' }, rhythm: { level: 37 } } },
      { text: 'I read fluently in any key', patch: { sight: { level: 66, hands: 'both' }, rhythm: { level: 57 } } },
    ],
  },
  ear: {
    name: 'Playing by ear',
    lessons: 'Ear training',
    statements: [
      { text: 'I have never tried', patch: { ear: { level: 1 } } },
      { text: 'I can copy two or three neighboring notes', patch: { ear: { level: 7 } } },
      { text: 'I can play back short tunes within five notes', patch: { ear: { level: 13 } } },
      { text: 'I can play back melodies that span an octave', patch: { ear: { level: 21 } } },
      { text: 'I can play back melodies in different keys', patch: { ear: { level: 41 } } },
      { text: 'I can pick out intervals and chords', patch: { ear: { level: 61 } } },
    ],
  },
  technique: {
    name: 'Scales & chords',
    lessons: 'Scales & arpeggios and Chords & progressions',
    statements: [
      {
        text: 'I don’t know any yet',
        patch: { scales: { hands: 'rh', octaves: 1, noteValue: 'eighth' }, chords: { set: 'triads', inversions: 'root' } },
      },
      {
        text: 'I know a few major scales and basic chords',
        patch: { scales: { hands: 'rh', octaves: 2, noteValue: 'eighth' }, chords: { set: 'triads', inversions: 'root' } },
      },
      {
        text: 'I play major and minor scales hands together, and chords in inversions',
        patch: { scales: { hands: 'together', octaves: 2, noteValue: 'eighth' }, chords: { set: 'all-triads', inversions: 'inversions' } },
      },
      {
        text: 'I play scales in all keys at speed, and seventh chords',
        patch: { scales: { hands: 'together', octaves: 2, noteValue: 'sixteenth' }, chords: { set: 'sevenths', inversions: 'inversions' } },
      },
    ],
  },
};

export interface ExperienceStage {
  id: string;
  name: string;
  description: string;
  selection: ExperienceSelection;
}

/** Overall stages. Ear training starts a little lower: reading well does not mean playing by ear. */
export const STAGES: readonly ExperienceStage[] = [
  { id: 'new', name: 'New to the piano', description: 'I have never played, or I am just starting.', selection: { reading: 0, ear: 0, technique: 0 } },
  { id: 'beginner', name: 'Beginner', description: 'I play simple tunes, mostly one hand at a time.', selection: { reading: 1, ear: 1, technique: 0 } },
  { id: 'elementary', name: 'Elementary', description: 'I play easy pieces with both hands.', selection: { reading: 3, ear: 2, technique: 1 } },
  {
    id: 'intermediate',
    name: 'Intermediate',
    description: 'I play pieces with a few sharps or flats and know several scales.',
    selection: { reading: 4, ear: 3, technique: 2 },
  },
  { id: 'advanced', name: 'Advanced', description: 'I play demanding pieces in any key.', selection: { reading: 5, ear: 4, technique: 3 } },
];

export function sameSelection(a: ExperienceSelection | null, b: ExperienceSelection | null): boolean {
  if (!a || !b) return a === b;
  return EXPERIENCE_SKILLS.every((k) => a[k] === b[k]);
}

/** The stage a selection is the preset of, or null once a dropdown was changed. */
export function stageOf(selection: ExperienceSelection | null): ExperienceStage | null {
  return STAGES.find((s) => sameSelection(s.selection, selection)) ?? null;
}

/** The settings a selection stands for, with the selection itself so the setup can show it again. */
export function experiencePatch(selection: ExperienceSelection): SettingsPatch {
  const patch: SettingsPatch = { experience: selection };
  for (const skill of EXPERIENCE_SKILLS) {
    const part = SKILLS[skill].statements[selection[skill]].patch as Record<string, object>;
    for (const [group, fields] of Object.entries(part)) {
      (patch as Record<string, object>)[group] = { ...(patch as Record<string, object>)[group], ...fields };
    }
  }
  return patch;
}

/** A saved selection, or null when it is missing or names a statement that does not exist. */
export function normalizeExperience(raw: unknown): ExperienceSelection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const valid = EXPERIENCE_SKILLS.every((k) => Number.isInteger(r[k]) && (r[k] as number) >= 0 && (r[k] as number) < SKILLS[k].statements.length);
  return valid ? { reading: r.reading as number, ear: r.ear as number, technique: r.technique as number } : null;
}
