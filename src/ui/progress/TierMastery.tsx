import { LESSONS, type LessonId } from '../../core/lessons';
import type { ProgressState } from '../../core/progress/progress';
import { MasteredMark } from './MasteredMark';

/** Tier ladder of a leveled lesson (not used by repertoire lessons), marking the tier of the current level. */
export function TierMastery(props: { lesson: LessonId; level: number; progress: ProgressState }) {
  const info = LESSONS[props.lesson];
  return (
    <section className="section">
      <div className="section-title">Tier mastery · {info.name}</div>
      <ol className="data-list tier-ladder">
        {info.tiers.map((t) => {
          const st = props.progress.tiers[t.id];
          const current = props.level >= t.minLevel && props.level <= t.maxLevel;
          return (
            <li key={t.id} className={st?.mastered ? 'is-mastered' : undefined} aria-current={current || undefined}>
              <span className="data-meta num">
                {t.minLevel}–{t.maxLevel}
              </span>
              <span>{t.name}</span>
              <span className="data-state">{st?.mastered ? <MasteredMark /> : `${Math.min(st?.passes ?? 0, t.passesRequired)}/${t.passesRequired}`}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
