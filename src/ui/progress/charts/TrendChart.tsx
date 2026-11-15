import { shortDate, type TrendPoint } from '../../../core/progress/trends';
import { pct } from '../format';

/** What a lesson's trend shows: its accuracy label, a timing label if it has timing, and whether it has a level. */
export interface TrendSeries {
  pitch: string;
  timing: string | null;
  level: boolean;
}

const W = 320;
const H = 132;
const PAD = { left: 30, right: 8, top: 8, bottom: 20 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** A polyline through the points that have a value, broken where a day has none. */
function segments(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (v === null) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}

function pointText(p: TrendPoint, s: TrendSeries): string {
  const parts = [`${shortDate(p.day)} · ${p.runs} run${p.runs === 1 ? '' : 's'}`, `${s.pitch.toLowerCase()} ${pct(p.pitch)}`];
  if (s.timing && p.timing !== null) parts.push(`${s.timing.toLowerCase()} ${pct(p.timing)}`);
  if (s.level && p.level !== null) parts.push(`level ${Math.round(p.level)}`);
  return parts.join(' · ');
}

/**
 * Accuracy (and timing, and level) per practice day of the lesson, days evenly spaced. Level
 * (1–100) shares the 0–100 % axis.
 */
export function TrendChart(props: { points: TrendPoint[]; series: TrendSeries }) {
  const { points, series } = props;
  const n = points.length;
  const x = (i: number) => PAD.left + (n === 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
  const y = (v: number) => PAD.top + (1 - Math.max(0, Math.min(1, v))) * PLOT_H;
  const timing = series.timing ? points.map((p) => p.timing) : [];
  const hasTiming = timing.some((v) => v !== null);
  const level = series.level ? points.map((p) => (p.level === null ? null : p.level / 100)) : [];
  const first = points[0];
  const last = points[n - 1];
  const summary = `${series.pitch} ${pct(first.pitch)} on ${shortDate(first.day)}, ${pct(last.pitch)} on ${shortDate(last.day)}, over ${n} practice days`;
  const colW = n === 1 ? PLOT_W : PLOT_W / (n - 1);
  return (
    <figure className="trend-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {[0, 0.5, 1].map((v) => (
          <g key={v} className="chart-grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text x={PAD.left - 5} y={y(v)} dy="0.32em" textAnchor="end">
              {v * 100}%
            </text>
          </g>
        ))}
        <text className="chart-axis" x={PAD.left} y={H - 5} textAnchor="start">
          {shortDate(first.day)}
        </text>
        {n > 1 ? (
          <text className="chart-axis" x={W - PAD.right} y={H - 5} textAnchor="end">
            {shortDate(last.day)}
          </text>
        ) : null}
        {series.level ? <path className="trend-line is-level" d={segments(level, x, y)} /> : null}
        {hasTiming ? <path className="trend-line is-timing" d={segments(timing, x, y)} /> : null}
        <path className="trend-line is-pitch" d={segments(points.map((p) => p.pitch), x, y)} />
        {hasTiming ? timing.map((v, i) => (v === null ? null : <circle key={`t${i}`} className="trend-dot is-timing" cx={x(i)} cy={y(v)} r={2.2} />)) : null}
        {points.map((p, i) => (
          <circle key={`p${i}`} className="trend-dot is-pitch" cx={x(i)} cy={y(p.pitch)} r={2.4} />
        ))}
        {points.map((p, i) => (
          <rect key={`h${i}`} className="chart-hit" x={x(i) - colW / 2} y={PAD.top} width={colW} height={PLOT_H}>
            <title>{pointText(p, series)}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="chart-legend">
        <span>
          <i className="swatch is-pitch" />
          {series.pitch}
        </span>
        {hasTiming ? (
          <span>
            <i className="swatch is-timing" />
            {series.timing}
          </span>
        ) : null}
        {series.level ? (
          <span>
            <i className="swatch is-level" />
            Level
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
