import { useId, useState, type ReactNode } from 'react';
import type { RepertoireItem } from '../../core/repertoire/repertoire';
import { dayKey } from '../../core/progress/days';
import { shortDate } from '../../core/progress/trends';
import { LadderChart } from './charts/LadderChart';
import { DAY } from './format';

export interface RepertoireEntry {
  id: string;
  it: RepertoireItem;
  /** The item's name, with any second line (e.g. the hands) as a `<small>`. */
  title: ReactNode;
}

/**
 * Scales' and chords' items with their ladder tempo, review date and progress toward the goal.
 * Tapping a row opens the item's ladder history (one at a time).
 */
export function RepertoireList(props: {
  entries: RepertoireEntry[];
  /** Goal tempo, in the lesson's ladder unit. */
  goal: number;
  /** A ladder tempo as shown to the learner. */
  format: (tempo: number) => string;
  now: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();
  return (
    <ul className="repertoire-list">
      {props.entries.map(({ id, it, title }, i) => {
        const days = Math.ceil((it.dueAt - props.now) / DAY);
        const expanded = open === id;
        const panelId = `${baseId}-${i}`;
        const log = it.ladderLog?.length ? it.ladderLog : [[dayKey(new Date(it.lastAt)), it.ladderTempo] as [string, number]];
        return (
          <li key={id} className={`${it.mastered ? 'is-mastered' : ''}${expanded ? ' is-open' : ''}`}>
            <button type="button" className="rep-row" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : id)}>
              <span className="rep-name">{title}</span>
              <span className="rep-tempo" title="Ladder tempo">
                {props.format(it.ladderTempo)}
              </span>
              <span className="rep-state">{it.mastered ? '★' : days <= 0 ? 'due' : `${days}d`}</span>
              <span className="progress-track">
                <span className={`progress-fill ${it.mastered ? 'is-mastered' : ''}`} style={{ width: `${Math.min(100, (it.ladderTempo / props.goal) * 100)}%` }} />
              </span>
            </button>
            {expanded ? (
              <div id={panelId} className="rep-history">
                <LadderChart log={log} goal={props.goal} format={props.format} />
                <p className="field-hint">
                  {it.mastered && it.masteredAt ? `Mastered ${shortDate(dayKey(new Date(it.masteredAt)))} · ` : ''}
                  {log.length > 1
                    ? `${it.attempts} run${it.attempts === 1 ? '' : 's'} · best clean ${it.bestCleanTempo ? props.format(it.bestCleanTempo) : '—'}`
                    : 'The history fills in as clean Flow runs move the ladder.'}
                </p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
