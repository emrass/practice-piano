import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from './Icon';

const FILES = Object.keys(import.meta.glob('../../../design/system/assets/Icons/*.svg')).map((path) => path.slice(path.lastIndexOf('/') + 1, -'.svg'.length) as IconName);

describe('Icon', () => {
  it('finds the icon set', () => expect(FILES.length).toBeGreaterThan(10));

  it.each(FILES)('inlines %s in the text color', (name) => {
    const html = renderToStaticMarkup(<Icon name={name} />);
    expect(html).toMatch(/^<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"/);
    expect(html).toMatch(/<(path|rect|circle|ellipse)/);
    // The files carry one fixed ink; inlined, every stroke and fill follows the text.
    expect(html).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('draws large icons at 20px', () => {
    expect(renderToStaticMarkup(<Icon name="close" large />)).toContain('class="icon icon-lg"');
  });
});
