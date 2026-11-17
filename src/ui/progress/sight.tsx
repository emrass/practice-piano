import { useMemo } from 'react';
import type { Clef } from '../../core/exercise';
import { isBlackKey } from '../../core/keyboard/range';
import { midiLabel } from '../../core/music/pitch';
import type { ProgressState } from '../../core/progress/progress';
import { findWeakSpots, MIN_NOTE_ATTEMPTS, noteHeatmap } from '../../core/progress/sight';
import { HEAT_BANDS, heatBand, pct } from './format';
import { TierMastery } from './TierMastery';
import type { ProgressSectionProps } from './types';
import { ProgressBar } from '../components/controls';

const HEAT_RANGE: Record<Clef, [number, number]> = { treble: [55, 96], bass: [28, 67] };

type Heat = { attempts: number; accuracy: number };

/** A note with enough attempts to be judged; fewer stay blank. */
const judged = (h: Heat | undefined): h is Heat => !!h && h.attempts >= MIN_NOTE_ATTEMPTS;

function keyTitle(midi: number, h: Heat | undefined): string {
  if (!h) return `${midiLabel(midi)}: no data`;
  return `${midiLabel(midi)}: ${pct(h.accuracy)} of ${h.attempts}${judged(h) ? '' : ' (too few to judge)'}`;
}

/** Heatmap: one clef's range as a strip of piano keys, each in the band of its accuracy. */
function Heatmap(props: { progress: ProgressState; clef: Clef }) {
  const heat = useMemo(() => noteHeatmap(props.progress, props.clef), [props.progress, props.clef]);
  const [lo, hi] = HEAT_RANGE[props.clef];
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const weakest = [...heat].filter(([m, h]) => m >= lo && m <= hi && judged(h)).sort((a, b) => a[1].accuracy - b[1].accuracy)[0];
  const name = props.clef === 'treble' ? 'Treble' : 'Bass';
  const summary = `Note accuracy, ${props.clef} clef, ${midiLabel(lo)} to ${midiLabel(hi)}. ${
    weakest ? `Weakest: ${midiLabel(weakest[0])} at ${Math.round(weakest[1].accuracy * 100)} percent.` : 'No notes judged yet.'
  }`;
  return (
    <div>
      <div className="heat-title">{name}</div>
      <div className="heatmap" role="img" aria-label={summary}>
        {whites.map((m) => {
          const h = heat.get(m);
          const sharp = isBlackKey(m + 1) && m + 1 <= hi ? heat.get(m + 1) : undefined;
          return (
            <span key={m} className={`heat-key ${judged(h) ? `heat-${heatBand(h.accuracy)}` : ''}`} title={keyTitle(m, h)}>
              {judged(sharp) ? <span className={`heat-sharp heat-${heatBand(sharp.accuracy)}`} title={keyTitle(m + 1, sharp)} /> : null}
            </span>
          );
        })}
      </div>
      <div className="heat-axis" aria-hidden="true">
        {whites.map((m) => (
          <span key={m}>{m % 12 === 0 ? midiLabel(m) : null}</span>
        ))}
      </div>
    </div>
  );
}

/** What the five colors mean, once for both strips. */
function HeatLegend() {
  return (
    <ul className="heat-legend" aria-label="Accuracy bands">
      {HEAT_BANDS.map((b) => (
        <li key={b.band}>
          <span className={`heat-swatch heat-${b.band}`} />
          {b.label}
        </li>
      ))}
    </ul>
  );
}

/** Sight reading: weak notes, clef bars, note heatmaps and the tier ladder. */
export function SightSection(props: ProgressSectionProps) {
  const { progress } = props;
  const weak = useMemo(() => findWeakSpots(progress), [progress]);
  return (
    <>
      <section className="section">
        <div className="section-title">Weak spots</div>
        {weak.notes.length === 0 ? (
          <p className="field-hint">No consistent weak notes yet — keep reading! Notes need a few attempts before they’re judged.</p>
        ) : (
          <ul className="data-list data-list-cards weak-list">
            {weak.notes.map((n) => (
              <li key={`${n.clef}${n.midi}`}>
                <span className="data-key">{midiLabel(n.midi)}</span>
                <span className="data-meta">{n.clef}</span>
                <span className="data-num">{pct(n.accuracy)}</span>
                <span className="data-num data-meta">{n.medianReactionMs ? `${(n.medianReactionMs / 1000).toFixed(1)}s` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {weak.clefs.length ? (
          <div className="clef-bars">
            {weak.clefs.map((c) => (
              <div key={c.clef} className="progress-row">
                <span>{c.clef === 'treble' ? 'Treble' : 'Bass'}</span>
                <ProgressBar label="Accuracy" value={Math.round(c.accuracy * 100)} max={100} />
                <span className="num">{pct(c.accuracy)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {weak.weakestClef ? <p className="field-hint">Your {weak.weakestClef} clef needs the most attention.</p> : null}
        <button type="button" className="btn btn-block" disabled={weak.notes.length === 0} onClick={props.onPracticeWeakSpots}>
          Practice weak spots
        </button>
      </section>

      <section className="section">
        <div className="section-title">Note accuracy</div>
        <Heatmap progress={progress} clef="treble" />
        <Heatmap progress={progress} clef="bass" />
        <HeatLegend />
      </section>

      <TierMastery lesson="sight" level={props.settings.sight.level} progress={progress} />
    </>
  );
}
