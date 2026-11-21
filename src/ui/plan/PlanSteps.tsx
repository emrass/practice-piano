import { LESSONS } from '../../core/lessons';
import { blockState, type BlockState, type PlanDay } from '../../core/plan/day';
import { Icon } from '../components/Icon';

/** The mark at the start of a step or a plan row: a check once done, the block's number until then. */
export function StepMark(props: { number: number; state: BlockState }) {
  if (props.state === 'done') return <Icon name="check" className="step-mark is-done" />;
  return (
    <span className="step-mark" aria-hidden="true">
      {props.number}
    </span>
  );
}

/** Runs of a block: a dot each while they can be counted at a glance, the count itself above that. */
export function Pips(props: { done: number; total: number }) {
  const done = Math.min(props.done, props.total);
  const label = `${done} of ${props.total} exercises`;
  if (props.total > 5) {
    return (
      <span className="pips-count num" aria-label={label}>
        {done}/{props.total}
      </span>
    );
  }
  return (
    <span className="pips" role="img" aria-label={label}>
      {Array.from({ length: props.total }, (_, i) => (
        <i key={i} className={i < done ? 'is-done' : undefined} />
      ))}
    </span>
  );
}

const STATE_WORDS: Record<BlockState, string> = { done: 'done', skipped: 'skipped', current: 'now', next: 'to come' };

/**
 * PlanSteps (design/system/components/PlanSteps): today's blocks along the top bar while one is
 * played. It reads at a glance from the bench: what is done, which block this is and how far
 * into it. It is a readout; the Plan button beside it is the control.
 */
export function PlanSteps(props: { day: PlanDay }) {
  const { day } = props;
  return (
    <ol className="plan-steps" aria-label="Today's practice">
      {day.blocks.map((block, i) => {
        const state = blockState(day, i);
        const lesson = LESSONS[block.lesson];
        return (
          <li key={i} className={state === 'current' ? undefined : `is-${state}`} aria-current={state === 'current' ? 'step' : undefined} title={`${lesson.name}: ${STATE_WORDS[state]}`}>
            <StepMark number={i + 1} state={state} />
            <span className="plan-step-name">{lesson.short}</span>
            <span className="visually-hidden">, {STATE_WORDS[state]}</span>
            {state === 'current' ? <Pips done={day.runs[i].done} total={block.exercises} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
