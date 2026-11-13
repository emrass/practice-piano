import { useStore } from '../../lib/store';
import type { Session } from '../practice/session';

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

const GRADE_TEXT = { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late' } as const;

export function PracticeBar(props: {
  controller: Session;
  onHint?: () => void;
  onRetry?: () => void;
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
  const ear = s.mode === 'ear' ? s.ear : undefined;
  const active = s.status === 'countin' || s.status === 'running';
  const phase = s.rhythm?.phase ?? null;

  let message: string;
  if (ear && s.status !== 'finished') {
    if (!ear.listened) message = props.pianoShortcuts ? 'Press Space or tap the pedal to listen' : 'Press Space to listen';
    else if (ear.playing) message = 'Listening…';
    else if (s.live.correct === 0 && s.live.wrong === 0) message = s.expected.length ? 'Play it back — start on the shown note' : 'Play it back — find the first note from the key';
    else message = 'Keep going — notes appear as you find them';
  } else if (s.status === 'finished') message = props.pianoShortcuts ? 'Finished — on the piano: C retry · D next' : 'Finished — see your results';
  else if (flow && s.status === 'ready') message = props.pianoShortcuts ? 'Press Space or tap the sustain pedal to start' : 'Press Start or Space to start';
  else if (flow && s.status === 'countin') message = s.rhythm ? 'Count-in… listen to the tempo' : 'Count-in… get ready';
  else if (phase === 'call') message = 'Listen…';
  else if (phase === 'response') message = 'Your turn — play it back';
  else if (phase === 'silent') message = 'Silent — keep the beat going';
  else if (phase === 'click') message = 'Feel the pulse…';
  else if (s.chords && flow) message = 'Play each chord on beat 1';
  else if (s.chords) message = s.chords.bassHint ?? (s.chords.index === 0 ? 'Play the chord — any octave' : 'Take your time');
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
        {ear && s.status === 'finished' ? (
          <button type="button" className="btn btn-primary btn-start" onClick={props.onRetry}>
            Retry <kbd>R</kbd>
          </button>
        ) : ear ? (
          <>
            <button type="button" className={`btn btn-primary btn-start ${ear.playing ? 'is-playing' : ''}`} onClick={() => props.controller.start()}>
              {ear.listened ? 'Replay' : 'Listen'}
              <kbd>Space</kbd>
            </button>
            <button type="button" className="btn" onClick={props.onHint} disabled={s.status !== 'running' || ear.playing}>
              Hint <kbd>?</kbd>
            </button>
          </>
        ) : flow ? (
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
        {ear && s.status !== 'finished' ? null : s.status === 'finished' && props.resultsHidden ? (
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
        <span className="pb-message">{wrongFlash ? (s.rhythm ? 'Use your rhythm keys' : 'Not that one — try again') : message}</span>
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
          <dt>{flow ? 'Timing' : ear ? 'Replays' : 'Wrong'}</dt>
          <dd>{flow ? pct(s.live.timing) : ear ? ear.replays : s.live.wrong}</dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>{s.live.streak}</dd>
        </div>
      </dl>
    </div>
  );
}
