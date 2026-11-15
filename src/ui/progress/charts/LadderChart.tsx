import type { LadderLogEntry } from '../../../core/repertoire/repertoire';
import { shortDate } from '../../../core/progress/trends';

const W = 320;
const H = 112;
const PAD = { left: 8, right: 8, top: 16, bottom: 20 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/**
 * An item's ladder tempo over time as a step line (entries evenly spaced), with a dashed line
 * at the goal tempo.
 */
export function LadderChart(props: { log: readonly LadderLogEntry[]; goal: number; format: (tempo: number) => string }) {
  const { log, goal, format } = props;
  const tempos = log.map((e) => e[1]);
  const lo = Math.min(goal, ...tempos) * 0.9;
  const hi = Math.max(goal, ...tempos) * 1.04;
  const n = log.length;
  const x = (i: number) => PAD.left + (n === 1 ? 0 : (i * PLOT_W) / (n - 1));
  const y = (t: number) => PAD.top + (1 - (t - lo) / (hi - lo)) * PLOT_H;
  let d = `M${x(0)} ${y(tempos[0]).toFixed(1)}`;
  for (let i = 1; i < n; i++) d += `H${x(i).toFixed(1)}V${y(tempos[i]).toFixed(1)}`;
  if (n === 1) d += `H${W - PAD.right}`;
  const lastX = n === 1 ? W - PAD.right : x(n - 1);
  const last = tempos[n - 1];
  const summary = `Ladder tempo from ${format(tempos[0])} on ${shortDate(log[0][0])} to ${format(last)} on ${shortDate(log[n - 1][0])}, goal ${format(goal)}`;
  return (
    <svg className="ladder-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      <line className="ladder-goal" x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} />
      <text className="chart-axis" x={W - PAD.right} y={y(goal) - 4} textAnchor="end">
        goal {format(goal)}
      </text>
      <path className="ladder-line" d={d} />
      {log.map(([day, t], i) => (
        <circle key={i} className="ladder-dot" cx={x(i)} cy={y(t)} r={2.4}>
          <title>{`${shortDate(day)}: ${format(t)}`}</title>
        </circle>
      ))}
      <text className="chart-value" x={Math.min(lastX, W - PAD.right)} y={y(last) + (y(last) - y(goal) < 14 ? 13 : -5)} textAnchor="end">
        {format(last)}
      </text>
      <text className="chart-axis" x={PAD.left} y={H - 5} textAnchor="start">
        {shortDate(log[0][0])}
      </text>
      {n > 1 && log[n - 1][0] !== log[0][0] ? (
        <text className="chart-axis" x={W - PAD.right} y={H - 5} textAnchor="end">
          {shortDate(log[n - 1][0])}
        </text>
      ) : null}
    </svg>
  );
}
