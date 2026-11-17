import type { ReactNode } from 'react';
import type { RepertoireChange } from '../../core/repertoire/repertoire';
import { Callout } from '../components/controls';
import { Icon } from '../components/Icon';

/**
 * What a Flow run of a repertoire item (a scale, a chord progression) changes next: the tempo on
 * its ladder as the title, then mastery and the review date. A neutral callout: the ribbon
 * already says whether the run counted.
 */
export function TempoChange(props: {
  change: RepertoireChange;
  /** A ladder tempo in beats per minute. */
  bpm: (ladderTempo: number) => number;
  /** The speed the item was mastered at, with its unit. */
  masteredAt: string;
}) {
  const { change } = props;
  const from = props.bpm(change.fromTempo);
  const to = props.bpm(change.toTempo);
  const up = change.toTempo > change.fromTempo;
  const down = change.toTempo < change.fromTempo;
  const title = up ? `Tempo up: ${from} → ${to} bpm` : down ? `Tempo down to ${to} bpm` : `Tempo stays at ${to} bpm`;
  const facts: ReactNode[] = [];
  if (down) facts.push('Get it clean first.');
  if (change.newlyMastered) {
    facts.push(
      <>
        <Icon name="star" /> Mastered at {props.masteredAt}.
      </>,
    );
  }
  if (change.dueInDays > 0) facts.push(`Review in ${change.dueInDays} day${change.dueInDays === 1 ? '' : 's'}.`);
  return (
    <Callout title={title}>
      {facts.length
        ? facts.map((fact, i) => (
            <span key={i}>
              {i > 0 ? ' ' : null}
              {fact}
            </span>
          ))
        : null}
    </Callout>
  );
}
