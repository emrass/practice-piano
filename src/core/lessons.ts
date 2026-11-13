import { EAR_TIERS, earTierForLevel } from './ear/tiers';
import { tierForLevel, TIERS, type Tier } from './generator/tiers';
import { RHYTHM_TIERS, rhythmTierForLevel } from './rhythm/tiers';

/**
 * Lesson types. Each lesson brings its own generator, difficulty tiers and controller;
 * input, scoring engines, persistence and progress are shared.
 */
export type LessonId = 'sight' | 'ear' | 'rhythm';

export interface LessonInfo {
  id: LessonId;
  name: string;
  short: string;
  tiers: readonly Tier[];
  tierForLevel: (level: number) => Tier;
}

export const LESSONS: Readonly<Record<LessonId, LessonInfo>> = {
  sight: { id: 'sight', name: 'Sight reading', short: 'Sight', tiers: TIERS, tierForLevel },
  ear: { id: 'ear', name: 'Ear training', short: 'Ear', tiers: EAR_TIERS, tierForLevel: earTierForLevel },
  rhythm: { id: 'rhythm', name: 'Rhythm', short: 'Rhythm', tiers: RHYTHM_TIERS, tierForLevel: rhythmTierForLevel },
};

export const LESSON_IDS = Object.keys(LESSONS) as LessonId[];

export function lessonOfTier(tierId: string): LessonId {
  return LESSON_IDS.find((id) => LESSONS[id].tiers.some((t) => t.id === tierId)) ?? 'sight';
}

export function findTier(tierId: string): Tier | undefined {
  return [...TIERS, ...EAR_TIERS, ...RHYTHM_TIERS].find((t) => t.id === tierId);
}
