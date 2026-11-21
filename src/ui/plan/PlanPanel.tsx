import { LESSONS, type LessonId } from '../../core/lessons';
import { isFinished, isStarted, type PlanDay } from '../../core/plan/day';
import { PLAN_MINUTES, type PlanMinutes, type PlanPrefs } from '../../core/plan/planner';
import { Callout, Field, Segmented, Toggle } from '../components/controls';

const HINTS: Record<LessonId, string> = {
  scales: 'The warm-up. Due items first.',
  sight: 'New passages at the level you last passed.',
  ear: 'In turn with rhythm. The one that needs it more comes first.',
  rhythm: 'In turn with ear training.',
  chords: 'Due items, in a 30 min plan.',
};
/** The order the plan plays them in. */
const ORDER: readonly LessonId[] = ['scales', 'sight', 'ear', 'rhythm', 'chords'];

/** The Plan tab of the sidebar, beside the plan page: how long today's practice is and what it draws from. */
export function PlanPanel(props: { prefs: PlanPrefs; day: PlanDay | null; onChange: (prefs: PlanPrefs) => void }) {
  const { prefs, day } = props;
  const underWay = !!day && isStarted(day);
  return (
    <div className="panel-body">
      <section className="section">
        <Field label="Length" hint="The length sets how many blocks you get and how many exercises are in each.">
          <Segmented<PlanMinutes> label="Length" value={prefs.minutes} options={PLAN_MINUTES.map((m) => ({ value: m, label: `${m} min` }))} onChange={(minutes) => props.onChange({ ...prefs, minutes })} />
        </Field>
      </section>
      <section className="section">
        <div className="section-title">In your plan</div>
        {ORDER.map((id) => (
          <Toggle key={id} label={LESSONS[id].name} hint={HINTS[id]} checked={prefs.lessons[id]} onChange={(on) => props.onChange({ ...prefs, lessons: { ...prefs.lessons, [id]: on } })} />
        ))}
        {underWay ? <Callout>{isFinished(day) ? "Today's plan is played. Changes make tomorrow's plan." : "Today's plan is under way. Changes make tomorrow's plan."}</Callout> : null}
      </section>
    </div>
  );
}
