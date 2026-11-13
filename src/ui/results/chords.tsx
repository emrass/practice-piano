import { gradeHeadline, pct, signedMs } from './format';
import type { ResultsView } from './types';

const TROUBLE_TEXT = {
  missed: 'missed',
  retry: 'a wrong key first',
  bass: 'wrong note in the bass',
  slow: 'slow to find',
  late: 'late',
  early: 'early',
  rolled: 'keys not together',
} as const;

/** Chords & progressions (repertoire). Body is defined inline so this file only exports the view (react-refresh). */
export const chordsResults: ResultsView = {
  ribbon: (result, passed) => {
    const flow = result.mode === 'flow';
    if (passed) return flow ? 'Clean run — tempo goes up' : 'Chords found — try them in Flow';
    return flow ? 'A clean run needs ≥ 90% chords and ≥ 75% timing' : 'Needs ≥ 90% of chords right first time';
  },
  headline: (result, passed, award) => {
    if (!passed) return gradeHeadline(result, passed);
    if (result.mode !== 'flow') return 'Chords in place!';
    return award?.repertoire?.newlyMastered ? 'Mastered!' : 'Clean!';
  },
  nextLabel: 'Next',
  repertoire: true,
  trains: null,
  Body: function ChordResults({ result, award }) {
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
  },
};
