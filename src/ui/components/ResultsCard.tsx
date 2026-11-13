import { useEffect, useRef } from 'react';
import type { ExerciseResult } from '../../core/eval/types';
import { findTier } from '../../core/lessons';
import { PIANO_ACTIONS } from '../../core/input/pianoShortcuts';
import { isPass, type Award } from '../../core/progress/progress';
import { nps } from '../../core/scales/generator';

function signedMs(ms: number | null, early: string, late: string): string {
  if (ms === null) return '—';
  if (Math.abs(ms) < 8) return 'Centred';
  return `${Math.abs(ms)} ms ${ms < 0 ? early : late}`;
}

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

export function ResultsCard(props: {
  result: ExerciseResult;
  award: Award | null;
  pianoShortcuts: boolean;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { result, award } = props;
  const nextRef = useRef<HTMLButtonElement>(null);
  // Focus "Next" for Enter, without scrolling a tall card away from its top.
  useEffect(() => nextRef.current?.focus({ preventScroll: true }), []);
  const tier = award ? findTier(award.tierId) : null;
  const ear = result.mode === 'ear';
  const rhythm = result.rhythm ?? null;
  const scale = result.scale ?? null;
  const chords = result.chords ?? null;
  const repertoire = scale ?? chords;
  const passed = isPass(result);
  const headline =
    passed &&
    result.pitchAccuracy >= 0.98 &&
    (!rhythm ||
      ((result.timingAccuracy ?? 0) >= 0.9 && Math.abs(rhythm.driftMs ?? 0) < 40 && Math.abs(rhythm.tendencyMs ?? 0) < 40))
      ? ear
        ? 'Perfect ear!'
        : rhythm
          ? 'Right in the pocket!'
          : 'Beautifully read!'
      : passed
        ? 'Passed!'
        : result.pitchAccuracy >= 0.75
          ? 'Nearly there'
          : 'Keep practising';
  const failText = scale
    ? result.mode === 'flow'
      ? 'A clean run needs ≥ 95% notes and ≥ 80% timing'
      : 'Needs ≥ 90% accuracy'
    : chords
      ? result.mode === 'flow'
        ? 'A clean run needs ≥ 90% chords and ≥ 75% timing'
        : 'Needs ≥ 90% of chords right first time'
    : rhythm
    ? 'Needs ≥ 90% hits and ≥ 70% timing to pass'
    : ear
      ? 'Needs ≥ 90% (hints count as misses) to pass'
      : 'Needs ≥ 90% pitch accuracy to pass';
  return (
    <div className="results-backdrop" role="dialog" aria-modal="false" aria-labelledby="results-title">
      <div className="results-card">
        <div className={`results-ribbon ${passed ? 'is-pass' : 'is-fail'}`}>
          {passed ? (repertoire ? (result.mode === 'flow' ? 'Clean run — tempo goes up' : chords ? 'Chords found — try them in Flow' : 'Notes learned — try it in Flow') : rhythm ? 'In time — counts toward mastery' : '≥ 90% — counts toward mastery') : failText}
        </div>
        <h2 id="results-title">
          {repertoire && passed ? (result.mode === 'flow' ? (award?.repertoire?.newlyMastered ? 'Mastered!' : 'Clean!') : chords ? 'Chords in place!' : 'Notes in place!') : headline}
        </h2>
        {scale ? (
          <ScaleResults result={result} award={award} />
        ) : chords ? (
          <ChordResults result={result} award={award} />
        ) : rhythm ? (
          <div className="results-grid">
            <div className="rg-item rg-main">
              <span className="rg-v">{pct(result.pitchAccuracy)}</span>
              <span className="rg-k">Hits</span>
            </div>
            <div className="rg-item">
              <span className="rg-v">{pct(result.timingAccuracy)}</span>
              <span className="rg-k">Timing{result.meanAbsTimingMs !== null ? ` · ±${Math.round(result.meanAbsTimingMs)} ms` : ''}</span>
            </div>
            <div className="rg-item" title="Average offset: early = rushing, late = dragging">
              <span className="rg-v rg-v-small">{signedMs(rhythm.tendencyMs, 'early', 'late')}</span>
              <span className="rg-k">Tendency</span>
            </div>
            {rhythm.task === 'pulse' ? (
              <div className="rg-item" title="Silent bars compared with clicked bars">
                <span className="rg-v rg-v-small">{signedMs(rhythm.driftMs, 'rushing', 'dragging')}</span>
                <span className="rg-k">Drift when silent</span>
              </div>
            ) : (
              <div className="rg-item" title="Spread of your timing — lower is steadier">
                <span className="rg-v rg-v-small">{rhythm.steadinessMs === null ? '—' : `±${rhythm.steadinessMs} ms`}</span>
                <span className="rg-k">Steadiness</span>
              </div>
            )}
            {rhythm.hands.rh && rhythm.hands.lh ? (
              <div className="rg-item rg-wide">
                <span className="rg-k">
                  Right hand <b>{pct(rhythm.hands.rh.hitRate)}</b> · timing {pct(rhythm.hands.rh.timing)} — Left hand <b>{pct(rhythm.hands.lh.hitRate)}</b> · timing{' '}
                  {pct(rhythm.hands.lh.timing)}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
        <div className="results-grid">
          <div className="rg-item rg-main">
            <span className="rg-v">{pct(result.pitchAccuracy)}</span>
            <span className="rg-k">Pitch accuracy</span>
          </div>
          {ear ? (
            <div className="rg-item">
              <span className="rg-v">{result.replays ?? 0}</span>
              <span className="rg-k">Replays</span>
            </div>
          ) : result.mode === 'flow' ? (
            <div className="rg-item">
              <span className="rg-v">{pct(result.timingAccuracy)}</span>
              <span className="rg-k">Timing{result.meanAbsTimingMs !== null ? ` · ±${Math.round(result.meanAbsTimingMs)} ms` : ''}</span>
            </div>
          ) : (
            <div className="rg-item">
              <span className="rg-v">{result.medianReactionMs === null ? '—' : `${(result.medianReactionMs / 1000).toFixed(2)} s`}</span>
              <span className="rg-k">Median reaction</span>
            </div>
          )}
          <div className="rg-item">
            <span className="rg-v">
              {result.cleanSteps}/{result.totalSteps}
            </span>
            <span className="rg-k">{result.mode === 'flow' ? 'Steps fully hit' : ear ? 'Found unaided' : 'First-try steps'}</span>
          </div>
          <div className="rg-item">
            <span className="rg-v">{ear ? `${result.wrongNotes}/${result.hints ?? 0}` : result.wrongNotes + result.missedNotes}</span>
            <span className="rg-k">{result.mode === 'flow' ? 'Wrong + missed' : ear ? 'Wrong / hints' : 'Wrong notes'}</span>
          </div>
        </div>
        )}
        {award ? (
          <div className="results-xp">
            <span className="xp-total">+{award.xp} XP</span>
            {award.firstSightBonus > 0 ? <span className="xp-bonus">incl. first-sight bonus +{award.firstSightBonus}</span> : null}
            {!award.firstAttempt && !repertoire ? <span className="xp-note">Repeat passage — reduced XP. New passages train {ear ? 'your ear' : rhythm ? 'your rhythm' : 'sight reading'} best.</span> : null}
            {ear && (result.replays ?? 0) > 0 ? <span className="xp-note">Each replay reduces XP a little — try to catch it in one listen.</span> : null}
            {award.levelCapped ? <span className="xp-note">XP multiplier capped at level {award.effectiveLevel} — master lower tiers to raise it.</span> : null}
          </div>
        ) : null}
        {award && tier && !repertoire ? (
          <div className="results-tier">
            <div className="rt-head">
              <span>{tier.name}</span>
              <span>
                {Math.min(award.tierPasses, award.tierRequired)}/{award.tierRequired} passes
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(100, (award.tierPasses / award.tierRequired) * 100)}%` }} />
            </div>
            {award.newlyMastered ? <div className="rt-mastered">Tier mastered! Try the next band when you feel ready.</div> : null}
          </div>
        ) : null}
        {props.pianoShortcuts ? (
          <div className="piano-legend" aria-label="Piano shortcuts">
            <span className="muted">Piano:</span>
            {PIANO_ACTIONS.map((a) => (
              <span key={a.key} className="legend-item">
                <span className="legend-key">{a.key}</span>
                {a.label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="results-actions">
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>
            Close <kbd>Esc</kbd>
          </button>
          <button type="button" className="btn" onClick={props.onRetry}>
            Retry <kbd>R</kbd>
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onNext} ref={nextRef}>
            {ear ? 'Next phrase' : rhythm ? 'Next rhythm' : repertoire ? 'Next' : 'Next exercise'} <kbd>Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

const CROSSING_TEXT = { 'thumb-under': 'thumb under', 'finger-over': 'finger over' } as const;

function ScaleResults(props: { result: ExerciseResult; award: Award | null }) {
  const { result, award } = props;
  const scale = result.scale!;
  const flow = result.mode === 'flow';
  const change = award?.repertoire;
  const bpm = (npm: number) => `${Math.round(npm / scale.notesPerBeat)} bpm`;
  return (
    <>
      <div className="results-grid">
        <div className="rg-item rg-main">
          <span className="rg-v">{pct(result.pitchAccuracy)}</span>
          <span className="rg-k">Notes</span>
        </div>
        {flow ? (
          <div className="rg-item">
            <span className="rg-v">{pct(result.timingAccuracy)}</span>
            <span className="rg-k">Timing{scale.steadinessMs !== null ? ` · ±${scale.steadinessMs} ms` : ''}</span>
          </div>
        ) : (
          <div className="rg-item">
            <span className="rg-v">{result.medianReactionMs === null ? '—' : `${(result.medianReactionMs / 1000).toFixed(2)} s`}</span>
            <span className="rg-k">Per note</span>
          </div>
        )}
        {flow ? (
          <div className="rg-item" title="Spread of key velocity — lower is more even">
            <span className="rg-v rg-v-small">{scale.velocitySpread === null ? '—' : `±${Math.round(scale.velocitySpread * 100)}%`}</span>
            <span className="rg-k">Evenness (touch)</span>
          </div>
        ) : (
          <div className="rg-item">
            <span className="rg-v">
              {result.cleanSteps}/{result.totalSteps}
            </span>
            <span className="rg-k">First-try steps</span>
          </div>
        )}
        {scale.syncMs !== null ? (
          <div className="rg-item" title="Average gap between the hands on notes played together">
            <span className="rg-v rg-v-small">{scale.syncMs} ms</span>
            <span className="rg-k">Hands apart</span>
          </div>
        ) : (
          <div className="rg-item">
            <span className="rg-v">{result.wrongNotes + result.missedNotes}</span>
            <span className="rg-k">{flow ? 'Wrong + missed' : 'Wrong notes'}</span>
          </div>
        )}
      </div>
      {flow && change ? (
        <div className={`scale-ladder ${change.toTempo > change.fromTempo ? 'is-up' : change.toTempo < change.fromTempo ? 'is-down' : ''}`}>
          {change.toTempo > change.fromTempo
            ? `Tempo up: ${bpm(change.fromTempo)} → ${bpm(change.toTempo)}`
            : change.toTempo < change.fromTempo
              ? `Tempo down to ${bpm(change.toTempo)} — get it clean first`
              : `Tempo stays at ${bpm(change.toTempo)}`}
          {change.newlyMastered ? ` · ★ mastered at ${nps(scale.npm)}` : ''}
          {change.dueInDays > 0 ? ` · review in ${change.dueInDays} day${change.dueInDays === 1 ? '' : 's'}` : ''}
        </div>
      ) : null}
      {scale.bumps.length || scale.thumbAccent ? (
        <ul className="scale-notes">
          {scale.bumps.map((b) => (
            <li key={`${b.hand}${b.label}`}>
              Timing bump on <b>{b.label}</b> ({b.hand === 'rh' ? 'RH' : 'LH'}
              {b.finger ? `, finger ${b.finger}` : ''}
              {b.crossing ? `, ${CROSSING_TEXT[b.crossing]}` : ''}): {Math.abs(b.ms)} ms {b.ms > 0 ? 'late' : 'early'}
            </li>
          ))}
          {scale.thumbAccent ? <li>Your thumb plays louder than the other fingers — keep it light as it passes under.</li> : null}
        </ul>
      ) : null}
    </>
  );
}

const TROUBLE_TEXT = {
  missed: 'missed',
  retry: 'a wrong key first',
  bass: 'wrong note in the bass',
  slow: 'slow to find',
  late: 'late',
  early: 'early',
  rolled: 'keys not together',
} as const;

function ChordResults(props: { result: ExerciseResult; award: Award | null }) {
  const { result, award } = props;
  const c = result.chords!;
  const flow = result.mode === 'flow';
  const change = award?.repertoire;
  return (
    <>
      <div className="results-grid">
        <div className="rg-item rg-main">
          <span className="rg-v">
            {c.correct}/{c.chords}
          </span>
          <span className="rg-k">{flow ? 'Chords on the beat' : 'Right first time'}</span>
        </div>
        {flow ? (
          <div className="rg-item" title="Average offset of your chords: early = rushing, late = dragging">
            <span className="rg-v">{pct(result.timingAccuracy)}</span>
            <span className="rg-k">Timing · {signedMs(c.tendencyMs, 'early', 'late').toLowerCase()}</span>
          </div>
        ) : (
          <div className="rg-item" title="Median time from a chord being asked to it being played">
            <span className="rg-v">{c.medianReactionMs === null ? '—' : `${(c.medianReactionMs / 1000).toFixed(1)} s`}</span>
            <span className="rg-k">To find a chord</span>
          </div>
        )}
        {flow ? (
          <div className="rg-item" title="Time between the first and last key of a chord — lower sounds together">
            <span className="rg-v rg-v-small">{c.spreadMs === null ? '—' : `${c.spreadMs} ms`}</span>
            <span className="rg-k">Keys together</span>
          </div>
        ) : (
          <div className="rg-item">
            <span className="rg-v">{result.wrongNotes}</span>
            <span className="rg-k">Wrong keys</span>
          </div>
        )}
        {c.voiceLeading !== null && c.movement ? (
          <div className="rg-item" title="How far your hand moved between chords, compared with the smallest move possible">
            <span className="rg-v rg-v-small">{pct(c.voiceLeading)}</span>
            <span className="rg-k">
              Voice leading · {c.movement.played} vs {c.movement.minimal} st
            </span>
          </div>
        ) : (
          <div className="rg-item">
            <span className="rg-v">{c.chords - c.correct}</span>
            <span className="rg-k">{flow ? 'Missed' : 'Needed a retry'}</span>
          </div>
        )}
      </div>
      {flow && change ? (
        <div className={`scale-ladder ${change.toTempo > change.fromTempo ? 'is-up' : change.toTempo < change.fromTempo ? 'is-down' : ''}`}>
          {change.toTempo > change.fromTempo
            ? `Tempo up: ${change.fromTempo} → ${change.toTempo} bpm`
            : change.toTempo < change.fromTempo
              ? `Tempo down to ${change.toTempo} bpm — get it clean first`
              : `Tempo stays at ${change.toTempo} bpm`}
          {change.newlyMastered ? ` · ★ mastered at ${c.bpm} bpm` : ''}
          {change.dueInDays > 0 ? ` · review in ${change.dueInDays} day${change.dueInDays === 1 ? '' : 's'}` : ''}
        </div>
      ) : null}
      {c.trouble.length || (c.voiceLeading !== null && c.voiceLeading < 0.8) ? (
        <ul className="scale-notes">
          {c.trouble.map((t) => (
            <li key={`${t.symbol}${t.reason}`}>
              <b>{t.symbol}</b>: {TROUBLE_TEXT[t.reason]}
              {t.ms !== undefined ? ` (${t.reason === 'slow' ? `${(t.ms / 1000).toFixed(1)} s` : `${Math.abs(t.ms)} ms`})` : ''}
            </li>
          ))}
          {c.voiceLeading !== null && c.voiceLeading < 0.8 ? (
            <li>Your hand jumps between chords — keep common notes and move the others to the nearest chord tone (try the voicings shown).</li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}
