import type { ScaleExercise } from '../../core/scales/generator';
import { useStore } from '../../lib/store';
import type { Session } from '../practice/session';
import { ProgressBar } from './controls';

/** Scales "from memory": no notation, just what to play and how far you are. */
export function MemoryCard(props: { exercise: ScaleExercise; session: Session }) {
  const state = useStore(props.session.state);
  const { scale } = props.exercise;
  const total = props.exercise.steps.length;
  const done = state.status === 'finished' ? total : Math.min(total, state.stepIndex);
  return (
    <div className="memory-card">
      <div className="memory-title">{scale.title}</div>
      <div className="memory-sub">
        {scale.item.hands === 'rh' ? 'Right hand' : scale.item.hands === 'lh' ? 'Left hand' : scale.item.hands === 'together' ? 'Hands together' : 'Contrary motion'} ·{' '}
        {scale.octaves} octave{scale.octaves > 1 ? 's' : ''} · up and down
      </div>
      <ProgressBar className="memory-progress" label="Notes played" value={done} max={Math.max(1, total)} accent />
    </div>
  );
}
