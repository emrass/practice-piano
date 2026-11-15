import { describe, expect, it } from 'vitest';
import { EXPERIENCE_SKILLS, experiencePatch, normalizeExperience, SKILLS, STAGES, stageOf } from './experience';
import { LESSONS, type LessonId } from './lessons';
import { applySettingsPatch, DEFAULT_SETTINGS, normalizeSettings } from './settings';

const LEVELED: LessonId[] = ['sight', 'ear', 'rhythm'];

describe('experience statements', () => {
  it('start every leveled lesson on the first level of a tier', () => {
    for (const skill of EXPERIENCE_SKILLS) {
      for (const st of SKILLS[skill].statements) {
        for (const lesson of LEVELED) {
          const level = (st.patch[lesson] as { level?: number } | undefined)?.level;
          if (level === undefined) continue;
          expect(LESSONS[lesson].tiers.map((t) => t.minLevel), `${st.text} → ${lesson} ${level}`).toContain(level);
        }
      }
    }
  });

  it('never get easier down the list and set the same fields throughout a skill', () => {
    for (const skill of EXPERIENCE_SKILLS) {
      const list = SKILLS[skill].statements;
      const fields = (i: number) => Object.entries(list[i].patch).flatMap(([g, v]) => Object.keys(v as object).map((k) => `${g}.${k}`));
      for (let i = 1; i < list.length; i++) {
        expect(fields(i)).toEqual(fields(0));
        for (const lesson of LEVELED) {
          const level = (j: number) => (list[j].patch[lesson] as { level?: number } | undefined)?.level;
          if (level(i) !== undefined) expect(level(i)).toBeGreaterThanOrEqual(level(i - 1)!);
        }
      }
    }
  });

  it('are valid settings: nothing is changed by normalizing', () => {
    for (const reading of SKILLS.reading.statements.keys()) {
      for (const ear of SKILLS.ear.statements.keys()) {
        for (const technique of SKILLS.technique.statements.keys()) {
          const applied = applySettingsPatch(DEFAULT_SETTINGS, experiencePatch({ reading, ear, technique }));
          expect(normalizeSettings(JSON.parse(JSON.stringify(applied)))).toEqual(applied);
        }
      }
    }
  });
});

describe('experience stages', () => {
  it('each pick an existing statement per skill, never lower than the stage before', () => {
    STAGES.forEach((stage, i) => {
      for (const skill of EXPERIENCE_SKILLS) {
        expect(SKILLS[skill].statements[stage.selection[skill]]).toBeDefined();
        if (i > 0) expect(stage.selection[skill]).toBeGreaterThanOrEqual(STAGES[i - 1].selection[skill]);
      }
    });
    expect(STAGES[0].selection).toEqual({ reading: 0, ear: 0, technique: 0 });
  });

  it('set all five lessons from one choice', () => {
    const s = applySettingsPatch(DEFAULT_SETTINGS, experiencePatch(STAGES[3].selection));
    expect(s.sight).toMatchObject({ level: 36, hands: 'both' });
    expect(s.rhythm.level).toBe(37);
    expect(s.ear.level).toBe(21);
    expect(s.scales).toMatchObject({ hands: 'together', octaves: 2 });
    expect(s.chords).toMatchObject({ set: 'all-triads', inversions: 'inversions' });
    expect(s.experience).toEqual(STAGES[3].selection);
  });

  it('are recognized from a selection until a statement is changed', () => {
    expect(stageOf(STAGES[2].selection)?.id).toBe('elementary');
    expect(stageOf({ ...STAGES[2].selection, ear: 5 })).toBeNull();
    expect(stageOf(null)).toBeNull();
  });
});

describe('saved experience', () => {
  it('is kept when valid and dropped otherwise', () => {
    expect(normalizeExperience({ reading: 3, ear: 2, technique: 1 })).toEqual({ reading: 3, ear: 2, technique: 1 });
    expect(normalizeExperience({ reading: 99, ear: 2, technique: 1 })).toBeNull();
    expect(normalizeExperience({ reading: 1.5, ear: 2, technique: 1 })).toBeNull();
    expect(normalizeExperience({ reading: 1 })).toBeNull();
    expect(normalizeExperience('advanced')).toBeNull();
  });

  it('a profile without the setup fields has not seen the setup', () => {
    expect(normalizeSettings({ theme: 'dark' })).toMatchObject({ setupGuideSeen: false, experience: null });
    expect(normalizeSettings({ setupGuideSeen: true, experience: { reading: 0, ear: 0, technique: 0 } })).toMatchObject({
      setupGuideSeen: true,
      experience: { reading: 0, ear: 0, technique: 0 },
    });
  });
});
