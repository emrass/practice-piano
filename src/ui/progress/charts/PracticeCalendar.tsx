import { useMemo } from 'react';
import { LESSONS, type LessonId } from '../../../core/lessons';
import { dayDate, dayKey } from '../../../core/progress/days';
import type { ProgressState } from '../../../core/progress/progress';
import { calendarWeeks, CALENDAR_WEEKS, shortDate, type CalendarCell } from '../../../core/progress/trends';

const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

function cellText(c: CalendarCell): string {
  if (c.future) return shortDate(c.day);
  if (!c.exercises && !c.minutes) return `${shortDate(c.day)}: no practice`;
  const lessons = c.lessons.length ? ` · ${c.lessons.map((l) => LESSONS[l].name).join(', ')}` : '';
  return `${shortDate(c.day)}: ${c.minutes} min · ${c.exercises} exercise${c.exercises === 1 ? '' : 's'}${lessons}`;
}

/**
 * Practice days of the last 17 weeks, for all lessons (like the streak above it). The shade is
 * the minutes practiced; a dot marks the days that included the lesson of this Progress tab.
 */
export function PracticeCalendar(props: { progress: ProgressState; lesson: LessonId; now: number }) {
  // Keyed by the day, so the grid is rebuilt when the date changes, not on every tick of `now`.
  const today = dayKey(new Date(props.now));
  const weeks = useMemo(() => calendarWeeks(props.progress, dayDate(today)), [props.progress, today]);
  const practiced = weeks.reduce((n, w) => n + w.days.filter((d) => d.intensity > 0).length, 0);
  const lessonName = LESSONS[props.lesson].name;
  return (
    <div className="practice-calendar">
      <div className="cal-head">
        <span>Practice · last {CALENDAR_WEEKS} weeks</span>
        <span className="muted">
          {practiced} day{practiced === 1 ? '' : 's'}
        </span>
      </div>
      <div className="cal-grid" role="group" aria-label={`Practice calendar: ${practiced} practice day${practiced === 1 ? '' : 's'} in the last ${CALENDAR_WEEKS} weeks`}>
        <div className="cal-col cal-weekdays" aria-hidden="true">
          <span className="cal-month" />
          {WEEKDAYS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w.days[0].day} className="cal-col">
            <span className="cal-month" aria-hidden="true">
              {w.month}
            </span>
            {w.days.map((c) => {
              const mine = c.lessons.includes(props.lesson);
              const text = cellText(c);
              return (
                <span
                  key={c.day}
                  role="img"
                  aria-label={text}
                  title={text}
                  className={`cal-day lvl-${c.intensity}${c.future ? ' is-future' : ''}${c.day === today ? ' is-today' : ''}`}
                >
                  {mine ? <i className="cal-dot" /> : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="cal-legend">
        <span>
          <i className="cal-dot" /> {lessonName} that day
        </span>
        <span className="cal-scale" aria-hidden="true">
          less
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`cal-day lvl-${l}`} />
          ))}
          more
        </span>
      </div>
    </div>
  );
}
