import { Icon } from '../components/Icon';

/** The end of a mastered row in a data list: the star, with its word for screen readers. */
export function MasteredMark() {
  return (
    <>
      <Icon name="star" />
      <span className="visually-hidden">Mastered</span>
    </>
  );
}
