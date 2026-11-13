import { useMemo } from 'react';
import type { Clef } from '../../core/exercise';
import { isBlackKey } from '../../core/keyboard/range';
import { midiLabel } from '../../core/music/pitch';
import { findWeakSpots, noteHeatmap, type ProgressState } from '../../core/progress/progress';
import { heatColor, pct } from './format';
import { TierMastery } from './TierMastery';
import type { ProgressSectionProps } from './types';

const HEAT_RANGE: Record<Clef, [number, number]> = { treble: [55, 96], bass: [28, 67] };

/** Keyboard-shaped accuracy map of one clef's range. */
function Heatmap(props: { progress: ProgressState; clef: Clef }) {
  const heat = useMemo(() => noteHeatmap(props.progress, props.clef), [props.progress, props.clef]);
  const [lo, hi] = HEAT_RANGE[props.clef];
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  return (
    <div className="heatmap" aria-label={`${props.clef} clef accuracy by note`}>
      <div className="heatmap-label">{props.clef === 'treble' ? '𝄞 Treble' : '𝄢 Bass'}</div>
      <div className="heatmap-keys">
        {whites.map((m) => {
          const h = heat.get(m);
          const sharp = heat.get(m + 1);
          return (
            <div
              key={m}
              className="heat-key"
              title={h ? `${midiLabel(m)}: ${pct(h.accuracy)} of ${h.attempts}` : `${midiLabel(m)}: no data`}
              style={h ? { background: heatColor(h.accuracy) } : undefined}
            >
              {m % 12 === 0 ? <span>{midiLabel(m)}</span> : null}
              {sharp && isBlackKey(m + 1) ? (
                <i className="heat-sharp" style={{ background: heatColor(sharp.accuracy) }} title={`${midiLabel(m + 1)}: ${pct(sharp.accuracy)}`} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Sight reading: weak notes, clef bars, note heatmaps and the tier ladder. */
export function SightSection(props: ProgressSectionProps) {
  const { progress } = props;
  const weak = useMemo(() => findWeakSpots(progress), [progress]);
  return (
    <>
      <section className="panel-section">
        <div className="section-title">Weak spots</div>
        {weak.notes.length === 0 ? (
          <p className="field-hint">No consistent weak notes yet — keep reading! Notes need a few attempts before they’re judged.</p>
        ) : (
          <ul className="weak-list">
            {weak.notes.map((n) => (
              <li key={`${n.clef}${n.midi}`}>
                <span className="weak-note">{midiLabel(n.midi)}</span>
                <span className="muted">{n.clef}</span>
                <span>{pct(n.accuracy)}</span>
                <span className="muted">{n.medianReactionMs ? `${(n.medianReactionMs / 1000).toFixed(1)}s` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {weak.clefs.length ? (
          <div className="clef-bars">
            {weak.clefs.map((c) => (
              <div key={c.clef} className="clef-bar">
                <span>{c.clef === 'treble' ? 'Treble' : 'Bass'}</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${c.accuracy * 100}%` }} />
                </div>
                <span>{pct(c.accuracy)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {weak.weakestClef ? <p className="field-hint">Your {weak.weakestClef} clef needs the most attention.</p> : null}
        <button type="button" className="btn btn-block" disabled={weak.notes.length === 0} onClick={props.onPracticeWeakSpots}>
          Practise weak spots
        </button>
      </section>

      <section className="panel-section">
        <div className="section-title">Note accuracy</div>
        <Heatmap progress={progress} clef="treble" />
        <Heatmap progress={progress} clef="bass" />
      </section>

      <TierMastery lesson="sight" level={props.settings.sight.level} progress={progress} />
    </>
  );
}
