import { EAR_TIERS, earTierForLevel } from './ear/tiers';
import { tierForLevel, TIERS, type Tier } from './generator/tiers';
import { RHYTHM_TIERS, rhythmTierForLevel } from './rhythm/tiers';

/**
 * Lesson types. Each lesson brings its own generator, difficulty tiers and controller;
 * input, scoring engines, persistence and progress are shared.
 */
export type LessonId = 'sight' | 'ear' | 'rhythm' | 'scales' | 'chords';

export interface LessonInfo {
  id: LessonId;
  name: string;
  short: string;
  tiers: readonly Tier[];
  tierForLevel: (level: number) => Tier;
  /** Fixed repertoire (DIDACTICS §2): items with a tempo ladder instead of a 1–100 level. */
  repertoire?: boolean;
}

/** Repertoire lessons have no level bands; one placeholder tier keeps shared code simple. */
const SCALES_TIER: Tier = { id: 'sc', name: 'Scales & arpeggios', minLevel: 1, maxLevel: 100, passesRequired: 1, summary: 'Tempo ladder per item' };
const CHORDS_TIER: Tier = { id: 'ch', name: 'Chords & progressions', minLevel: 1, maxLevel: 100, passesRequired: 1, summary: 'Tempo ladder per item' };

export const LESSONS: Readonly<Record<LessonId, LessonInfo>> = {
  sight: { id: 'sight', name: 'Sight reading', short: 'Sight', tiers: TIERS, tierForLevel },
  ear: { id: 'ear', name: 'Ear training', short: 'Ear', tiers: EAR_TIERS, tierForLevel: earTierForLevel },
  rhythm: { id: 'rhythm', name: 'Rhythm', short: 'Rhythm', tiers: RHYTHM_TIERS, tierForLevel: rhythmTierForLevel },
  scales: { id: 'scales', name: 'Scales & arpeggios', short: 'Scales', tiers: [SCALES_TIER], tierForLevel: () => SCALES_TIER, repertoire: true },
  chords: { id: 'chords', name: 'Chords & progressions', short: 'Chords', tiers: [CHORDS_TIER], tierForLevel: () => CHORDS_TIER, repertoire: true },
};

export const LESSON_IDS = Object.keys(LESSONS) as LessonId[];

export function lessonOfTier(tierId: string): LessonId {
  return LESSON_IDS.find((id) => LESSONS[id].tiers.some((t) => t.id === tierId)) ?? 'sight';
}

export function findTier(tierId: string): Tier | undefined {
  return [...TIERS, ...EAR_TIERS, ...RHYTHM_TIERS, SCALES_TIER, CHORDS_TIER].find((t) => t.id === tierId);
}
