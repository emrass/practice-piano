import { useStore } from '../../lib/store';
import { backspaceLabel } from '../../platform/keyLabels';
import type { Continuation } from '../lessons/types';
import { isUntouched, type Session } from '../practice/session';
import { Stat } from './controls';

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

const GRADE_TEXT = { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late' } as const;
const GRADE_TONE = { perfect: 'badge-success', good: 'badge-success', early: 'badge-warning', late: 'badge-warning' } as const;
/** The longest bar the beat dots show (6/8): their row keeps that width in every meter. */
const MAX_BEATS = 6;

export function PracticeBar(props: {
  controller: Session;
  /** How the lesson continues from this exercise: labels of the repeat and next actions. */
  continuation: Continuation;
  onHint?: () => void;
  onRetry?: () => void;
  onStartStop: () => void;
  onRestart: () => void;
  onNext: () => void;
  resultsHidden: boolean;
  onShowResults: () => void;
  pianoShortcuts: boolean;
  /** The keyboard guide setting (a hint adds nothing while the guide lights the keys). */
  keyboardGuide: boolean;
}) {
  const s = useStore(props.controller.state);
  const wrongFlash = s.wrong !== null;
  const flow = s.mode === 'flow';
  const ear = s.mode === 'ear' ? s.ear : undefined;
  const active = s.status === 'countin' || s.status === 'running';
  const phase = s.rhythm?.phase ?? null;
  const guideShowing = props.keyboardGuide && s.expected.length > 0;
  // Stays in place (disabled) once finished, so the bar does not reflow under the results.
  const hint = s.hint ?? null;
  const nudge = !!hint?.nudge && !guideShowing && s.status === 'running';
  const { repeat, next } = props.continuation;
  const onPiano = `C ${repeat.label.toLowerCase()}${next ? ` · D ${next.label.toLowerCase()}` : ''}`;

  let message: string;
  if (ear && s.status !== 'finished') {
    if (!ear.listened) message = props.pianoShortcuts ? 'Press Space or tap the pedal to listen' : 'Press Space to listen';
    else if (ear.playing) message = 'Listening…';
    else if (s.live.correct === 0 && s.live.wrong === 0) message = s.revealed.length ? 'Play it back — start on the shown note' : 'Play it back — find the first note from the key';
    else message = 'Keep going — notes appear as you find them';
  } else if (s.status === 'finished') message = props.pianoShortcuts ? `Finished — on the piano: ${onPiano}` : 'Finished — see your results';
  else if (flow && s.status === 'ready') message = props.pianoShortcuts ? 'Press Space or tap the sustain pedal to start' : 'Press Start or Space to start';
  else if (flow && s.status === 'countin') message = s.rhythm ? 'Count-in… listen to the tempo' : 'Count-in… get ready';
  else if (phase === 'call') message = 'Listen…';
  else if (phase === 'response') message = 'Your turn — play it back';
  else if (phase === 'silent') message = 'Silent — keep the beat going';
  else if (phase === 'click') message = 'Feel the pulse…';
  else if (s.chords && flow) message = 'Play each chord on beat 1';
  else if (s.chords) message = s.chords.bassHint ?? (nudge ? 'Stuck? Press ? for a hint' : s.chords.index === 0 ? 'Play the chord — any octave' : 'Take your time');
  else if (flow) message = 'Play along with the playhead';
  else if (s.live.correct === 0 && s.live.wrong === 0) message = guideShowing || s.revealed.length ? 'Play the highlighted note' : 'Play the first note';
  else message = 'Take your time — the cursor waits for you';

  const dots = s.countIn
    ? Array.from({ length: s.countIn.total }, (_, i) => (i < s.countIn!.beat ? 'is-on' : ''))
    : s.beat
      ? Array.from({ length: s.beat.beatsPerBar }, (_, i) => (i === s.beat!.index ? 'is-on' : ''))
      : Array.from({ length: 4 }, () => '');
  const idle = !s.countIn && !s.beat;
  const grade = s.lastGrade;

  return (
    <div className="card practice-bar">
      <div className="practice-actions">
        {ear && s.status === 'finished' ? (
          <button type="button" className="btn btn-primary" onClick={props.onRetry}>
            {repeat.label} <kbd>R</kbd>
          </button>
        ) : ear ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => props.controller.start()}>
              {ear.listened ? 'Replay' : 'Listen'}
              <kbd>Space</kbd>
            </button>
            <button type="button" className="btn" onClick={props.onHint} disabled={s.status !== 'running' || ear.playing}>
              Hint <kbd>?</kbd>
            </button>
          </>
        ) : flow ? (
          <button type="button" className={`btn ${active ? 'btn-inverse' : 'btn-primary'}`} onClick={props.onStartStop}>
            {active ? 'Stop' : 'Start'}
            <kbd>Space</kbd>
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={props.onRestart} disabled={isUntouched(s)}>
            Restart
            <kbd>{backspaceLabel()}</kbd>
          </button>
        )}
        {hint ? (
          <button
            type="button"
            className={`btn ${nudge ? 'is-nudge' : ''}`}
            onClick={props.onHint}
            disabled={s.status !== 'running' || guideShowing || s.revealed.length > 0}
            title={guideShowing ? 'The keyboard guide already shows the keys' : 'Show the keys to play — this step then no longer counts as first try'}
          >
            Hint <kbd>?</kbd>
          </button>
        ) : null}
        {/* Closed results stay one press away, next to the way on. */}
        {s.status === 'finished' && props.resultsHidden ? (
          <button type="button" className="btn" onClick={props.onShowResults}>
            Results
          </button>
        ) : null}
        {next ? (
          <button type="button" className="btn" onClick={props.onNext}>
            {next.label} <kbd>N</kbd>
          </button>
        ) : null}
      </div>

      {/* Wide: with beat dots and a grade (Flow) or beside a third button (Hint), the status takes its own row sooner. */}
      <div className={`practice-status ${wrongFlash ? 'is-wrong' : ''} ${flow || hint ? 'is-wide' : ''}`}>
        <div className={`beat-dots ${s.countIn ? 'is-countin' : ''} ${idle ? 'is-idle' : ''}`} style={{ ['--beats' as string]: MAX_BEATS }} aria-hidden="true">
          {dots.map((cls, i) => (
            <span key={i} className={`beat-dot ${cls} ${i === 0 ? 'is-downbeat' : ''}`} />
          ))}
        </div>
        <p className="practice-message" role="status">
          {wrongFlash ? (s.rhythm ? 'Use your rhythm keys' : 'Not that one — try again') : message}
        </p>
        {/* Timing grades only come in Flow (and rhythm); elsewhere the badge would just hold space the message needs. */}
        {flow ? (
          <span className={`badge practice-grade ${grade ? GRADE_TONE[grade.grade] : 'is-hidden'}`}>
            {/* Never empty, so the badge keeps its height while hidden. */}
            {grade ? `${GRADE_TEXT[grade.grade]}${grade.grade === 'perfect' ? '' : ` ${Math.abs(Math.round(grade.deltaMs))} ms`}` : 'Perfect'}
          </span>
        ) : null}
      </div>

      <div className="practice-stats">
        <Stat label="Accuracy" value={pct(s.live.correct + s.live.wrong + s.live.missed === 0 ? null : s.live.accuracy)} />
        <Stat label={flow ? 'Timing' : ear ? 'Replays' : 'Wrong'} value={flow ? pct(s.live.timing) : ear ? ear.replays : s.live.wrong} />
        <Stat label="Streak" value={s.live.streak} />
      </div>
    </div>
  );
}
