import { figureName } from '../../core/generator/rhythm';
import { findWeakFigures, timeStats, type TimeStat } from '../../core/progress/rhythm';
import { BEAT_POSITION_LABELS, TEXTURE_INFO, type BeatPosition, type RhythmTexture } from '../../core/rhythm/generator';
import { pct, tendencyText } from './format';
import { TierMastery } from './TierMastery';
import type { ProgressSectionProps } from './types';
import { ProgressBar } from '../components/controls';

/** Hit rate bars with timing quality and tendency, for any rhythm dimension. */
function TimeBars(props: { rows: { label: string; stat: TimeStat }[]; empty: string }) {
  if (!props.rows.length) return <p className="field-hint">{props.empty}</p>;
  return (
    <div className="clef-bars time-bars">
      {props.rows.map(({ label, stat }) => (
        <div
          key={label}
          className="progress-row"
          title={`${Math.round(stat.accuracy * stat.attempts)}/${stat.attempts} hit · timing ${pct(stat.timing)}${
            stat.tendencyMs !== null ? ` · ${tendencyText(stat.tendencyMs)}` : ''
          }${stat.steadinessMs !== null ? ` · ±${stat.steadinessMs} ms` : ''}`}
        >
          <span>{label}</span>
          <ProgressBar label="Accuracy" value={Math.round(stat.accuracy * 100)} max={100} />
          <span className="num">{pct(stat.accuracy)}</span>
        </div>
      ))}
    </div>
  );
}

/** Rhythm: figures, beat positions, hand independence and the tier ladder. */
export function RhythmSection(props: ProgressSectionProps) {
  const { progress } = props;
  const figures = timeStats(progress, 'rhythmFigure')
    .filter((t) => t.attempts >= 2)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10)
    .map((stat) => ({ label: figureName(stat.key), stat }));
  const order: BeatPosition[] = ['downbeat', 'beat', 'offbeat', 'sixteenth'];
  const beats = timeStats(progress, 'beatPosition')
    .sort((a, b) => order.indexOf(a.key as BeatPosition) - order.indexOf(b.key as BeatPosition))
    .map((stat) => ({ label: BEAT_POSITION_LABELS[stat.key as BeatPosition] ?? stat.key, stat }));
  const hands = timeStats(progress, 'rhythmHand').map((stat) => ({ label: stat.key === 'rh' ? 'Right hand' : 'Left hand', stat }));
  const textures = timeStats(progress, 'rhythmTexture').map((stat) => ({ label: TEXTURE_INFO[stat.key as RhythmTexture]?.name ?? stat.key, stat }));
  const weak = findWeakFigures(progress);
  return (
    <>
      <section className="section">
        <div className="section-title">Rhythm figures</div>
        <TimeBars rows={figures} empty="Figure accuracy appears after your first rhythms (and Flow-mode sight reading)." />
        {weak.length ? (
          <p className="field-hint">
            Weakest:{' '}
            {weak
              .map((w) => `${figureName(w.key).toLowerCase()} (${pct(w.accuracy)}${w.tendencyMs !== null && Math.abs(w.tendencyMs) >= 8 ? `, ${tendencyText(w.tendencyMs)}` : ''})`)
              .join(', ')}
          </p>
        ) : null}
        <button type="button" className="btn btn-block" disabled={weak.length === 0} onClick={props.onPracticeWeakSpots}>
          Practice weak figures
        </button>
      </section>
      <section className="section">
        <div className="section-title">Where in the bar</div>
        <TimeBars rows={beats} empty="Appears after your first rhythms." />
      </section>
      {hands.length > 1 || textures.length ? (
        <section className="section">
          <div className="section-title">Hand independence</div>
          <TimeBars rows={[...hands, ...textures]} empty="" />
          {hands.length === 2 ? (
            <p className="field-hint">
              Tendency — right: {tendencyText(hands.find((h) => h.stat.key === 'rh')!.stat.tendencyMs) || '—'}, left:{' '}
              {tendencyText(hands.find((h) => h.stat.key === 'lh')!.stat.tendencyMs) || '—'}
            </p>
          ) : null}
        </section>
      ) : null}

      <TierMastery lesson="rhythm" level={props.settings.rhythm.level} progress={progress} />
    </>
  );
}
