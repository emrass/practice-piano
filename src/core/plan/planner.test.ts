import { describe, expect, it } from 'vitest';
import fixtureJson from '../../../scripts/screenshots/progress-fixture.json?raw';
import { emptyProgress, normalizeProgress } from '../progress/progress';
import type { HistoryEntry, ProgressState } from '../progress/types';
import { newRepertoireItem } from '../repertoire/repertoire';
import { applySettingsPatch, DEFAULT_SETTINGS, type Settings } from '../settings';
import { blockPatch, buildPlan, DEFAULT_PLAN_PREFS, normalizePlanPrefs, planLevel, type PlanPrefs } from './planner';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 21, 9);

/** A few weeks of sight reading, rhythm and scales: the progress the landing-page screenshots use. */
function fixture(): { progress: ProgressState; now: number } {
  const progress = normalizeProgress(JSON.parse(fixtureJson));
  const last = Math.max(...progress.history.map((h) => h.at));
  return { progress, now: last + DAY };
}

function run(lesson: HistoryEntry['lesson'], level: number, passed: boolean, at: number): HistoryEntry {
  return { at, lesson, exerciseId: `${lesson}-${at}`, mode: 'wait', level, tierId: 't', pitchAccuracy: passed ? 1 : 0.5, timingAccuracy: null, medianReactionMs: null, xp: 1, firstSight: false, passed };
}

const prefs = (minutes: PlanPrefs['minutes'], off: (keyof PlanPrefs['lessons'])[] = []): PlanPrefs => ({
  minutes,
  lessons: { ...DEFAULT_PLAN_PREFS.lessons, ...Object.fromEntries(off.map((l) => [l, false])) },
});

describe('buildPlan', () => {
  it('orders the blocks: due scales, reading, then ear training and rhythm', () => {
    const { progress, now } = fixture();
    const plan = buildPlan(progress, DEFAULT_SETTINGS, prefs(20), now);
    expect(plan.map((b) => b.lesson)).toEqual(['scales', 'sight', 'ear', 'rhythm']);
    expect(plan[0]).toMatchObject({ start: 'review', exercises: 3 });
    expect(plan[0].reason).toMatch(/^3 of \d+ due items, most overdue first\. Starts with /);
    // Sight reading at the level last passed, featuring the weakest notes.
    expect(plan[1]).toMatchObject({ start: 'weak-spots', level: planLevel(progress, DEFAULT_SETTINGS, 'sight') });
    expect(plan[1].reason).toContain('Featuring F2');
    // Ear training was never practiced, so it comes before rhythm.
    expect(plan[2].reason).toBe('Not tried yet. Starts at level 1.');
    expect(plan[3].reason).toContain('your weakest figure');
  });

  it('fits the length: about 10, 20 and 30 minutes', () => {
    const { progress, now } = fixture();
    for (const minutes of [10, 20, 30] as const) {
      const plan = buildPlan(progress, DEFAULT_SETTINGS, prefs(minutes), now);
      const sum = plan.reduce((t, b) => t + b.minutes, 0);
      expect(Math.abs(sum - minutes), `${minutes} min plan is ${sum} min`).toBeLessThanOrEqual(2);
    }
    expect(buildPlan(progress, DEFAULT_SETTINGS, prefs(10), now).map((b) => b.lesson)).toEqual(['scales', 'sight', 'ear']);
    expect(buildPlan(progress, DEFAULT_SETTINGS, prefs(30), now).map((b) => b.lesson)).toEqual(['scales', 'sight', 'ear', 'rhythm', 'chords']);
  });

  it('gives a new player every lesson at its starting level', () => {
    const settings = applySettingsPatch(DEFAULT_SETTINGS, { sight: { level: 10 }, ear: { level: 7 } });
    const plan = buildPlan(emptyProgress(), settings, prefs(20), NOW);
    expect(plan.map((b) => [b.lesson, b.start, b.level])).toEqual([
      ['scales', 'plain', null],
      ['sight', 'plain', 10],
      ['ear', 'plain', 7],
      ['rhythm', 'plain', 1],
    ]);
    expect(plan[0].reason).toBe('Not tried yet. Starts with the item it is set to.');
  });

  it('plays the item the lesson is set to when nothing is due', () => {
    const progress = emptyProgress();
    progress.repertoire['major/C/rh'] = { ...newRepertoireItem(120, NOW), dueAt: NOW + 3 * DAY, attempts: 2 };
    const plan = buildPlan(progress, DEFAULT_SETTINGS, prefs(20), NOW);
    expect(plan[0]).toMatchObject({ lesson: 'scales', start: 'plain' });
    expect(plan[0].reason).toBe(`Nothing is due. ${plan[0].exercises} runs of the item you are on.`);
  });

  it('a review block is as long as its due items, and the others take the time', () => {
    const progress = emptyProgress();
    progress.repertoire['major/G/rh'] = { ...newRepertoireItem(120, NOW - DAY), attempts: 2 };
    const plan = buildPlan(progress, DEFAULT_SETTINGS, prefs(20), NOW);
    expect(plan[0]).toMatchObject({ start: 'review', exercises: 1, reason: '1 due item. Starts with G major scale.' });
    expect(plan.find((b) => b.lesson === 'sight')!.exercises).toBeGreaterThan(4);
  });

  it('leaves out lessons that are switched off and shares their time', () => {
    const { progress, now } = fixture();
    const plan = buildPlan(progress, DEFAULT_SETTINGS, prefs(20, ['ear', 'rhythm']), now);
    expect(plan.map((b) => b.lesson)).toEqual(['scales', 'sight']);
    expect(plan[1].exercises).toBeGreaterThan(4);
    // Chords take the warm-up when scales are off.
    expect(buildPlan(progress, DEFAULT_SETTINGS, prefs(10, ['scales']), now)[0].lesson).toBe('chords');
    expect(buildPlan(progress, DEFAULT_SETTINGS, prefs(20, ['scales', 'sight', 'ear', 'rhythm', 'chords']), now)).toEqual([]);
  });

  it('is the same plan for the same day', () => {
    const { progress, now } = fixture();
    expect(buildPlan(progress, DEFAULT_SETTINGS, prefs(20), now)).toEqual(buildPlan(progress, DEFAULT_SETTINGS, prefs(20), now));
  });
});

describe('planLevel', () => {
  const settings: Settings = applySettingsPatch(DEFAULT_SETTINGS, { sight: { level: 80 } });

  it('is the level last passed, not the level last set', () => {
    const progress = emptyProgress();
    progress.history = [run('sight', 44, true, 1), run('sight', 45, true, 2), run('sight', 80, false, 3)];
    expect(planLevel(progress, settings, 'sight')).toBe(45);
    progress.history.push(run('sight', 80, true, 4));
    expect(planLevel(progress, settings, 'sight')).toBe(80);
  });

  it('is the lesson’s own level before any pass', () => {
    const progress = emptyProgress();
    progress.history = [run('rhythm', 30, true, 1), run('sight', 80, false, 2)];
    expect(planLevel(progress, settings, 'sight')).toBe(80);
    expect(planLevel(progress, settings, 'ear')).toBe(1);
  });
});

describe('blockPatch', () => {
  it('sets the lesson, its level and the weak-spot focus for level lessons', () => {
    expect(blockPatch({ lesson: 'sight', start: 'weak-spots', level: 45, exercises: 3, minutes: 6, reason: '' })).toEqual({ lesson: 'sight', weakSpotFocus: true, sight: { level: 45 } });
    expect(blockPatch({ lesson: 'ear', start: 'plain', level: 13, exercises: 2, minutes: 3, reason: '' })).toEqual({ lesson: 'ear', weakSpotFocus: false, ear: { level: 13 } });
  });

  it('switches a repertoire lesson between review and its own item', () => {
    expect(blockPatch({ lesson: 'scales', start: 'review', level: null, exercises: 3, minutes: 5, reason: '' })).toEqual({ lesson: 'scales', scales: { source: 'review' } });
    expect(blockPatch({ lesson: 'chords', start: 'plain', level: null, exercises: 3, minutes: 6, reason: '' })).toEqual({ lesson: 'chords', chords: { source: 'pick' } });
  });
});

describe('normalizePlanPrefs', () => {
  it('fills what is missing or wrong', () => {
    expect(normalizePlanPrefs(null)).toEqual(DEFAULT_PLAN_PREFS);
    expect(normalizePlanPrefs({ minutes: 15, lessons: { ear: false, sight: 'no' } })).toEqual({ minutes: 20, lessons: { ...DEFAULT_PLAN_PREFS.lessons, ear: false } });
  });
});
