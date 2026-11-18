import { wrongNote, pct, verdict } from './format';
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

/** The timing tile's note names the direction only, so it fits one line; the title gives the size. */
function tendencyWord(ms: number | null): string {
  return ms === null || Math.abs(ms) < 8 ? '' : ` · ${ms < 0 ? 'early' : 'late'}`;
}

function timingTitle(ms: number | null): string {
  const offset = ms === null || Math.abs(ms) < 8 ? 'centered' : `${Math.abs(ms)} ms ${ms < 0 ? 'early' : 'late'}`;
  return `Average offset of your chords: ${offset}. Early is rushing, late is dragging.`;
}

/** Chords & progressions (repertoire). Body is defined inline so this file only exports the view (react-refresh). */
export const chordsResults: ResultsView = {
  ribbon: (result, passed) => {
    const flow = result.mode === 'flow';
    if (passed) return flow ? 'Clean run. Tempo goes up.' : 'Chords found. Try them in Flow.';
    return flow ? 'A clean run needs 90% of chords and 75% timing.' : 'Needs 90% of chords right the first time.';
  },
  // As in scales: a pass in Flow is a clean run; mastery is said in the tempo callout.
  headline: (result, passed) => verdict(result, passed, result.mode === 'flow'),
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
          <StatTile main value={`${c.correct}/${c.chords}`} note={flow ? 'On the beat' : 'Right first time'} />
          {flow ? (
            <StatTile title={timingTitle(c.tendencyMs)} value={pct(result.timingAccuracy)} note={`Timing${tendencyWord(c.tendencyMs)}`} />
          ) : (
            <StatTile
              title="Median time from a chord being asked to it being played"
              value={c.medianReactionMs === null ? '–' : `${(c.medianReactionMs / 1000).toFixed(1)} s`}
              note="To find a chord"
            />
          )}
          {flow ? (
            <StatTile title="Time between the first and last key of a chord: lower sounds together" value={c.spreadMs === null ? '–' : `${c.spreadMs} ms`} note="Keys together" />
          ) : (
            <StatTile value={result.wrongNotes} note={wrongNote(result, 'Wrong keys')} />
          )}
          {c.voiceLeading !== null && c.movement ? (
            <StatTile
              title={`How far your hand moved between chords (${c.movement.played} semitones a change), compared with the smallest move possible (${c.movement.minimal})`}
              value={pct(c.voiceLeading)}
              note="Voice leading"
            />
          ) : (
            <StatTile value={c.chords - c.correct} note={flow ? 'Missed' : 'Needed a retry'} />
          )}
        </div>
        {flow && change ? (
          <TempoChange change={change} bpm={(tempo) => tempo} masteredAt={`${c.bpm} bpm`} />
        ) : change ? (
          <Callout>Practice run. The tempo ladder and review date move only in Flow.</Callout>
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
              <li>
                Your hand moves {c.movement ? `${c.movement.played} semitones a change where ${c.movement.minimal} would do` : 'more than it needs to between chords'}. Keep common
                notes and move the others to the nearest chord tone.
              </li>
            ) : null}
          </ul>
        ) : null}
      </>
    );
  },
};
