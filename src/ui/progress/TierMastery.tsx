import { LESSONS, type LessonId } from '../../core/lessons';
import type { ProgressState } from '../../core/progress/progress';

/** Tier ladder of a levelled lesson (not used by repertoire lessons), marking the tier of the current level. */
export function TierMastery(props: { lesson: LessonId; level: number; progress: ProgressState }) {
  const info = LESSONS[props.lesson];
  return (
    <section className="panel-section">
      <div className="section-title">Tier mastery · {info.name}</div>
      <ol className="tier-ladder">
        {info.tiers.map((t) => {
          const st = props.progress.tiers[t.id];
          const current = props.level >= t.minLevel && props.level <= t.maxLevel;
          return (
            <li key={t.id} className={`${st?.mastered ? 'is-mastered' : ''} ${current ? 'is-current' : ''}`}>
              <span className="tl-range">
                {t.minLevel}–{t.maxLevel}
              </span>
              <span className="tl-name">{t.name}</span>
              <span className="tl-state">{st?.mastered ? '★' : `${Math.min(st?.passes ?? 0, t.passesRequired)}/${t.passesRequired}`}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
