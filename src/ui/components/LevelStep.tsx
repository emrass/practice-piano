import { useEffect, useRef } from 'react';
import { EXPERIENCE_SKILLS, type ExperienceSelection, SKILLS, stageOf, STAGES } from '../../core/experience';
import { ChoiceGroup, Select } from './controls';

/** What the level step of the first-run guide shows (its step is in guideSteps.tsx). */

export function LevelStep(props: { selection: ExperienceSelection | null; onChange: (s: ExperienceSelection) => void }) {
  const { selection } = props;
  const stage = stageOf(selection);
  const skills = useRef<HTMLDivElement>(null);
  const picked = selection !== null;
  // The skills appear below the choices once one is picked; bring them into the fixed-height dialog's view.
  useEffect(() => {
    if (picked) skills.current?.scrollIntoView({ block: 'nearest' });
  }, [picked]);

  return (
    <>
      <p>Pick what fits best. It sets a starting point for every lesson, and you can change any level later.</p>
      <ChoiceGroup
        label="How well do you play?"
        value={stage?.id ?? null}
        onChange={(id) => props.onChange(STAGES.find((st) => st.id === id)!.selection)}
        options={STAGES.map((st) => ({ value: st.id, name: st.name, description: st.description }))}
      />

      {selection ? (
        <div className="well setup-skills" ref={skills}>
          <p>
            <b>We’ll start you here.</b> Change anything that doesn’t fit.
          </p>
          {EXPERIENCE_SKILLS.map((skill) => (
            <Select<number>
              key={skill}
              label={SKILLS[skill].name}
              value={selection[skill]}
              onChange={(i) => props.onChange({ ...selection, [skill]: i })}
              options={SKILLS[skill].statements.map((st, i) => ({ value: i, label: st.text }))}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
