import { useStore } from '../../lib/store';
import type { PracticeController } from '../practice/PracticeController';

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

const GRADE_TEXT = { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late' } as const;

export function PracticeBar(props: {
  controller: PracticeController;
  onStartStop: () => void;
  onRestart: () => void;
  onNext: () => void;
  resultsHidden: boolean;
  onShowResults: () => void;
  pianoShortcuts: boolean;
}) {
  const s = useStore(props.controller.state);
  const wrongFlash = s.wrong !== null;
  const gradeFlash = s.lastGrade !== null;
  const flow = s.mode === 'flow';
  const active = s.status === 'countin' || s.status === 'running';

  let message: string;
  if (s.status === 'finished') message = props.pianoShortcuts ? 'Finished — on the piano: C retry · D next' : 'Finished — see your results';
  else if (flow && s.status === 'ready') message = props.pianoShortcuts ? 'Press Space or tap the sustain pedal to start' : 'Press Start or Space to start';
  else if (flow && s.status === 'countin') message = 'Count-in… get ready';
  else if (flow) message = 'Play along with the playhead';
  else if (s.live.correct === 0 && s.live.wrong === 0) message = 'Play the highlighted note';
  else message = 'Take your time — the cursor waits for you';

  const dots = s.countIn
    ? Array.from({ length: s.countIn.total }, (_, i) => (i < s.countIn!.beat ? 'is-on' : ''))
    : s.beat
      ? Array.from({ length: s.beat.beatsPerBar }, (_, i) => (i === s.beat!.index ? 'is-on' : ''))
      : Array.from({ length: 4 }, () => 'is-idle');

  return (
    <div className="practice-bar">
      <div className="pb-actions">
        {flow ? (
          <button type="button" className={`btn btn-primary btn-start ${active ? 'is-stop' : ''}`} onClick={props.onStartStop}>
            {active ? 'Stop' : 'Start'}
            <kbd>Space</kbd>
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-start" onClick={props.onRestart}>
            Restart
            <kbd>R</kbd>
          </button>
        )}
        {s.status === 'finished' && props.resultsHidden ? (
          <button type="button" className="btn" onClick={props.onShowResults}>
            Results
          </button>
        ) : (
          <button type="button" className="btn" onClick={props.onNext}>
            New exercise <kbd>N</kbd>
          </button>
        )}
      </div>

      <div className={`pb-status ${wrongFlash ? 'is-wrong' : ''}`}>
        <div className={`beat-dots ${s.countIn ? 'is-countin' : ''}`} aria-hidden="true">
          {dots.map((cls, i) => (
            <span key={i} className={`beat-dot ${cls} ${i === 0 ? 'is-downbeat' : ''}`} />
          ))}
        </div>
        <span className="pb-message">{wrongFlash ? 'Not that one — try again' : message}</span>
        <span className={`grade-chip ${gradeFlash && s.lastGrade ? `is-${s.lastGrade.grade}` : 'is-hidden'}`}>
          {s.lastGrade ? `${GRADE_TEXT[s.lastGrade.grade]} ${s.lastGrade.grade === 'perfect' ? '' : `${Math.abs(Math.round(s.lastGrade.deltaMs))} ms`}` : ''}
        </span>
      </div>

      <dl className="pb-stats">
        <div>
          <dt>Accuracy</dt>
          <dd>{pct(s.live.correct + s.live.wrong + s.live.missed === 0 ? null : s.live.accuracy)}</dd>
        </div>
        <div>
          <dt>{flow ? 'Timing' : 'Wrong'}</dt>
          <dd>{flow ? pct(s.live.timing) : s.live.wrong}</dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>{s.live.streak}</dd>
        </div>
      </dl>
    </div>
  );
}
