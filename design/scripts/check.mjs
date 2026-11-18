// Checks the design system: token hygiene, contrast, the component stylesheet and its files.
//   node design/scripts/check.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DESIGN, compile, compileSiteFonts, listFamilies, readTokens, resolveColor, typeShorthand } from './build.mjs';

const SYSTEM = join(DESIGN, 'system');
const REPO = join(DESIGN, '..');
const tokens = readTokens();
const failures = [];
const fail = (message) => failures.push(message);
const read = (...parts) => readFileSync(join(...parts), 'utf8');

// ---------- Tokens: names, notes, aliases ----------

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const all = new Map();
for (const [family, { tokens: list }] of listFamilies(tokens)) {
  for (const token of list) {
    if (!NAME.test(token.name)) fail(`${family}: "${token.name}" is not a valid token name`);
    if (all.has(token.name)) fail(`${family}: "${token.name}" is defined twice`);
    if (!token.usage) fail(`${family}: "${token.name}" has no usage note`);
    all.set(token.name, token);
  }
}

const themes = tokens.color.themes.map((t) => t.id);
const colors = new Map(tokens.color.tokens.map((t) => [t.name, t]));

const resolve = (name, theme) => resolveColor(tokens, name, theme);

for (const token of colors.values()) {
  for (const theme of themes) {
    try {
      parseColor(resolve(token.name, theme));
    } catch (error) {
      fail(`color: ${error.message}`);
    }
  }
}

// ---------- Contrast (WCAG 2) ----------

function parseColor(value) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value)?.[1];
  if (hex && [3, 6, 8].includes(hex.length)) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    const channel = (i) => parseInt(full.slice(i, i + 2), 16);
    return { r: channel(0), g: channel(2), b: channel(4), a: full.length === 8 ? channel(6) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  throw new Error(`cannot read the color "${value}" (use hex or rgb/rgba)`);
}

const over = (top, bottom) => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});

function luminance({ r, g, b }) {
  const linear = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let pairs = 0;
/** `fg` on `bg` must reach `min` in every theme; `tint` is a translucent token laid over `bg` first. */
function pair(fg, bg, min, tint) {
  for (const theme of themes) {
    pairs += 1;
    try {
      let ground = parseColor(resolve(bg, theme));
      if (tint) ground = over(parseColor(resolve(tint, theme)), ground);
      const ratio = contrast(over(parseColor(resolve(fg, theme)), ground), ground);
      if (ratio < min) fail(`contrast: ${fg} on ${bg}${tint ? ` under ${tint}` : ''} is ${ratio.toFixed(2)}:1 in ${theme}, needs ${min}:1`);
    } catch (error) {
      fail(`contrast: ${error.message}`);
    }
  }
}

// Text needs 4.5:1; marks that carry meaning (edges, rings, noteheads, fills) need 3:1.
const GROUNDS = ['surface-card', 'surface-sheet', 'surface-panel', 'surface-well', 'surface-overlay'];
for (const ground of [...GROUNDS, 'surface-canvas']) {
  pair('text', ground, 7);
  pair('text-muted', ground, 4.5);
  pair('accent', ground, 4.5);
  pair('success', ground, 4.5);
  pair('danger', ground, 4.5);
  pair('focus-ring', ground, 3);
  pair('border-strong', ground, 3);
}
for (const ground of GROUNDS) {
  pair('text-subtle', ground, 4.5);
  pair('warning', ground, 4.5);
  pair('reward-text', ground, 4.5);
  pair('reward', ground, 3);
  pair('accent', ground, 4.5, 'accent-soft');
  pair('success', ground, 4.5, 'success-soft');
  pair('warning', ground, 4.5, 'warning-soft');
  pair('danger', ground, 4.5, 'danger-soft');
  pair('reward-text', ground, 4.5, 'reward-soft');
  pair('text', ground, 7, 'surface-hover');
}
pair('on-accent', 'accent', 4.5);
pair('on-accent', 'accent-hover', 4.5);
pair('on-success', 'success', 4.5);
pair('on-danger', 'danger', 4.5);
pair('on-reward', 'reward', 4.5);
pair('on-inverse', 'surface-inverse', 4.5);
pair('score-staff', 'surface-sheet', 3);
pair('score-label', 'surface-sheet', 4.5);
for (const mark of ['score-good', 'score-ok', 'score-bad', 'score-cursor-edge']) pair(mark, 'surface-sheet', 3);
for (const ground of ['keyboard-case-top', 'keyboard-case-bottom']) {
  for (const fg of ['keyboard-text', 'keyboard-text-muted', 'keyboard-accent']) pair(fg, ground, 4.5);
}
pair('key-ink', 'key-white', 4.5);
pair('key-ink-c', 'key-white', 4.5);
pair('key-white', 'key-ink-c', 4.5); // the flag on a key
pair('key-black-ink', 'key-black', 4.5);
pair('key-black-ink', 'key-black-top', 4.5);
for (const tint of ['key-expected', 'key-held', 'key-correct', 'key-wrong']) pair('key-ink-strong', tint, 4.5);
for (const tint of ['key-black-expected', 'key-black-held', 'key-black-correct', 'key-black-wrong']) pair('key-black-ink', tint, 3);

// ---------- Component stylesheet ----------

/** Custom properties a stylesheet declares itself (component parameters such as --fill). */
const declaredIn = (css) => new Set([...css.matchAll(/(?:^|[\s;{"])--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const fontStacks = Object.keys(tokens.type.families).map((key) => `font-${key}`);

/**
 * The rules every stylesheet built on the system follows: no literal colors, durations or type
 * sizes, and every var() without a fallback is a token (or a variable the stylesheet declares).
 * A var() with a fallback is a parameter the markup sets (--value, --cols). A line may state an
 * exception with a `/* literal: why *\/` comment; colors have none.
 */
function lintStylesheet(name, css, known) {
  for (const [, variable] of css.matchAll(/var\(--([a-z0-9-]+)\)/g)) {
    if (!known.has(variable)) fail(`${name}: var(--${variable}) is not a token`);
  }
  css.split('\n').forEach((line, index) => {
    const at = `${name}:${index + 1}`;
    if (/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch|oklab|lab|lch)a?\(/i.test(line)) fail(`${at}: literal color; use a token`);
    if (line.includes('/* literal:') || /^\s+--/.test(line)) return; // a stated exception, or a variable definition
    if (/[\s(,]\d*\.?\d+m?s\b/.test(line)) fail(`${at}: literal duration; use a duration token`);
    if (/\bfont(?:-size)?\s*:[^;]*\d(?:rem|px|em)\b/.test(line)) fail(`${at}: literal type size; use a --type-* text style`);
  });
}

const bundle = read(SYSTEM, 'components/bundle.css');
const declared = declaredIn(bundle);
lintStylesheet('bundle.css', bundle, new Set([...all.keys(), ...fontStacks, ...declared]));

// The --type-* and --tracking-* variables in bundle.css restate tokens.json; they must agree.
const restated = new Map([...bundle.matchAll(/^\s+--((?:type|tracking)-[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2]]));
const expected = new Map();
for (const group of tokens.type.groups) {
  for (const style of group.styles) {
    expected.set(`type-${style.name}`, typeShorthand(style, group));
    if (style.letterSpacing) expected.set(`tracking-${style.name}`, style.letterSpacing);
  }
}
for (const [name, value] of restated) {
  if (!expected.has(name)) fail(`bundle.css: --${name} has no text style in tokens.json`);
  else if (expected.get(name) !== value) fail(`bundle.css: --${name} is "${value}", tokens.json says "${expected.get(name)}"`);
}
for (const [, name] of bundle.matchAll(/var\(--((?:type|tracking)-[a-z0-9-]+)/g)) {
  if (!restated.has(name)) fail(`bundle.css: var(--${name}) is used but not defined at the top of the file`);
}

// ---------- The app's stylesheets (src/styles) ----------

// The same rules as bundle.css. Text styles come from tokens.css here, so --type-* and
// --tracking-* count as tokens; a variable the app declares must not shadow one.
const APP_STYLES = join(REPO, 'src/styles');
const appStyles = readdirSync(APP_STYLES, { recursive: true })
  .filter((file) => file.endsWith('.css'))
  .sort()
  .map((file) => ({ name: `src/styles/${file.split('\\').join('/')}`, css: read(APP_STYLES, file) }));
const appDeclared = new Set(appStyles.flatMap(({ css }) => [...declaredIn(css)]));
const tokenNames = new Set([...all.keys(), ...fontStacks, ...expected.keys()]);
for (const name of appDeclared) {
  if (tokenNames.has(name)) fail(`src/styles: --${name} redefines a token; change it in tokens.json`);
}
for (const { name, css } of appStyles) lintStylesheet(name, css, new Set([...tokenNames, ...appDeclared]));

// ---------- Files ----------

const components = readdirSync(join(SYSTEM, 'components'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const name of components) {
  const preview = join(SYSTEM, 'components', name, 'preview.html');
  if (!existsSync(preview)) fail(`components/${name}: no preview.html`);
  else if (!read(preview).startsWith('<!-- @dsCard')) fail(`components/${name}/preview.html: line 1 must be the @dsCard marker`);
  const readme = join(SYSTEM, 'components', name, 'README.md');
  if (name === 'Cover') {
    if (existsSync(readme)) fail('components/Cover: the cover has a preview only, no README');
  } else if (!existsSync(readme)) fail(`components/${name}: no README.md`);
  else if (!read(readme).startsWith(`# ${name}\n`)) fail(`components/${name}/README.md: must start with "# ${name}"`);
}

const icons = readdirSync(join(SYSTEM, 'assets/Icons')).filter((file) => file.endsWith('.svg'));
for (const file of icons) {
  if (!read(SYSTEM, 'assets/Icons', file).includes('viewBox="0 0 20 20"')) fail(`assets/Icons/${file}: icons are drawn on a 20-unit grid`);
}

const listedFonts = new Set(tokens.type.fonts.map((font) => font.file));
for (const file of listedFonts) if (!existsSync(join(SYSTEM, file))) fail(`${file}: listed in tokens.json but missing`);
for (const file of readdirSync(join(SYSTEM, 'fonts'))) {
  if (!listedFonts.has(`fonts/${file}`)) fail(`fonts/${file}: not listed in tokens.json (type.fonts)`);
}
for (const family of new Set(tokens.type.fonts.map((font) => font.family))) {
  if (!existsSync(join(SYSTEM, 'assets/Licenses', `OFL-${family}.txt`))) fail(`assets/Licenses: no license text for ${family}`);
}

// The favicon is the keys redrawn on a 16px grid: the same four parts, in the same colors.
const keyParts = (svg) => new Map([...svg.matchAll(/class="(logo-keys-[a-z]+)"[^>]*?(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map((m) => [m[1], m[2].toLowerCase()]));
const keysParts = keyParts(read(SYSTEM, 'assets/Logos/practice-piano-keys.svg'));
const faviconParts = keyParts(read(REPO, 'public/favicon.svg'));
if (keysParts.size !== 4) fail('assets/Logos/practice-piano-keys.svg: expected the four parts logo-keys-field, -lines, -black and -edge');
for (const [part, color] of keysParts) {
  if (faviconParts.get(part) !== color) fail(`public/favicon.svg: ${part} must be ${color}, as in assets/Logos/practice-piano-keys.svg`);
}
for (const part of faviconParts.keys()) if (!keysParts.has(part)) fail(`public/favicon.svg: ${part} is not a part of the keys`);

// The Score preview engraves with the app's own VexFlow version.
const vexflow = JSON.parse(read(REPO, 'package.json')).dependencies.vexflow;
if (!read(SYSTEM, 'components/Score/preview.html').includes(`vexflow@${vexflow}/`)) {
  fail(`components/Score/preview.html: must load vexflow@${vexflow}, the version in package.json`);
}

// The stylesheets are built on demand, not committed; make sure they still compile, and that
// the landing-page font stays out of the app's stylesheet.
try {
  if (compile(tokens).includes('"Caveat"') || !compileSiteFonts(tokens).includes('"Caveat"')) {
    fail('build: Caveat belongs in site-fonts.css only');
  }
} catch (error) {
  fail(`build: tokens.json does not compile (${error.message})`);
}

// ---------- Report ----------

if (failures.length) {
  console.error(`Design system: ${failures.length} problem${failures.length === 1 ? '' : 's'}\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`Design system OK: ${all.size} tokens, ${pairs} contrast checks, ${components.length - 1} components, ${icons.length} icons, ${appStyles.length} app stylesheets.`);
