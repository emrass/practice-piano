import keysSvg from '../../../design/system/assets/Logos/practice-piano-keys.svg?raw';

/**
 * The icon set of the design system (design/system/assets/Icons), inlined so each icon takes
 * the text color. The files carry one fixed ink; here every stroke and fill becomes
 * currentColor. Icons are decorative: the control around one carries its name.
 */
const FILES = import.meta.glob('../../../design/system/assets/Icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, svg]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
    svg
      .replace(/^[\s\S]*?<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '')
      .replace(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/g, '$1="currentColor"'),
  ]),
);

export type IconName =
  | 'check'
  | 'database'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'guide'
  | 'guide-on'
  | 'menu'
  | 'moon'
  | 'next'
  | 'note'
  | 'restart'
  | 'sliders'
  | 'sound-off'
  | 'sound-on'
  | 'star'
  | 'streak'
  | 'sun'
  | 'warning';

/** 16px inside controls, `large` (20px) standing alone. */
export function Icon(props: { name: IconName; large?: boolean; className?: string }) {
  return (
    <svg
      className={['icon', props.large ? 'icon-lg' : '', props.className ?? ''].filter(Boolean).join(' ')}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICONS[props.name] ?? '' }}
    />
  );
}

/** The drawing's own shapes, without the file's outer <svg>. */
const KEYS = keysSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/**
 * The keys alone, decorative (the splash screen): the outlined drawing of the top bar, inlined
 * so its paper, ink and oxblood come from the theme's tokens (see design/system/components/Logo).
 */
export function LogoKeys() {
  return <svg className="logo-mark" viewBox="0 0 28 28" width={28} height={28} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: KEYS }} />;
}

/** The keys and the live wordmark (see design/system/components/Logo). */
export function Logo() {
  return (
    <div className="logo">
      <LogoKeys />
      <span className="logo-name">
        practice-piano<span className="logo-tld">.com</span>
      </span>
    </div>
  );
}
