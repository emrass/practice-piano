import { gradeHeadline, hintNote, pct, signedMs } from './format';
import { TempoChange } from './TempoChange';
import type { ResultsView } from './types';
import { Callout, StatTile } from '../components/controls';

const TROUBLE_TEXT = {
  missed: 'missed',
  retry: 'a wrong key first',
  hint: 'needed a hint',
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
  repertoire: true,
  trains: null,
  Body: function ChordResults({ result, award }) {
    if (result.lesson !== 'chords') return null;
    const c = result.chords;
    const flow = result.mode === 'flow';
    const change = award?.repertoire;
    return (
      <>
        <div className="results-grid">
          <StatTile main value={`${c.correct}/${c.chords}`} note={flow ? 'Chords on the beat' : 'Right first time'} />
          {flow ? (
            <StatTile
              title="Average offset of your chords: early = rushing, late = dragging"
              value={pct(result.timingAccuracy)}
              note={`Timing · ${signedMs(c.tendencyMs, 'early', 'late').toLowerCase()}`}
            />
          ) : (
            <StatTile
              title="Median time from a chord being asked to it being played"
              value={c.medianReactionMs === null ? '—' : `${(c.medianReactionMs / 1000).toFixed(1)} s`}
              note="To find a chord"
            />
          )}
          {flow ? (
            <StatTile title="Time between the first and last key of a chord — lower sounds together" value={c.spreadMs === null ? '—' : `${c.spreadMs} ms`} note="Keys together" />
          ) : (
            <StatTile value={result.wrongNotes} note={`Wrong keys${hintNote(result)}`} />
          )}
          {c.voiceLeading !== null && c.movement ? (
            <StatTile
              title="How far your hand moved between chords, compared with the smallest move possible"
              value={pct(c.voiceLeading)}
              note={
                <>
                  Voice leading · {c.movement.played} vs {c.movement.minimal} st
                </>
              }
            />
          ) : (
            <StatTile value={c.chords - c.correct} note={flow ? 'Missed' : 'Needed a retry'} />
          )}
        </div>
        {flow && change ? (
          <TempoChange change={change} bpm={(tempo) => tempo} masteredAt={`${c.bpm} bpm`} />
        ) : change ? (
          <Callout>Practice run — the tempo ladder and review date move only in Flow</Callout>
        ) : null}
        {c.trouble.length || (c.voiceLeading !== null && c.voiceLeading < 0.8) ? (
          <ul className="results-notes">
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
