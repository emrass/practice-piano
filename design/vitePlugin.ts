import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import { CSS_PATH, DESIGN, TOKENS_PATH, compile, readTokens, resolveColor, type Tokens } from './scripts/build.mjs';

/** The color of the browser and status bar around the app: the top bar's surface. */
export const THEME_COLOR_TOKEN = 'surface-sheet';

/**
 * Builds design/dist/tokens.css from design/system/tokens.json when `vite` starts and when
 * `vite build` runs, and again whenever tokens.json changes, so the stylesheet is never stale
 * and never committed. The app imports the result (src/main.tsx); Vite follows its font URLs and
 * hashes the files, so the service worker precaches them and the native build bundles them.
 *
 * It also writes into index.html what has to be there before the stylesheet loads: preloads
 * for the roman faces (Newsreader and Figtree), so the first paint does not reflow, and the
 * theme-color meta, which the app updates when the theme changes.
 */
export function designTokens(): Plugin {
  const build = () => {
    const tokens = readTokens();
    const css = compile(tokens);
    if (!existsSync(CSS_PATH) || readFileSync(CSS_PATH, 'utf8') !== css) {
      mkdirSync(dirname(CSS_PATH), { recursive: true });
      writeFileSync(CSS_PATH, css);
    }
    return tokens;
  };

  let root = process.cwd();

  return {
    name: 'practice-piano-design-tokens',
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      build();
      this.addWatchFile(TOKENS_PATH);
    },
    configureServer(server) {
      server.watcher.add(TOKENS_PATH);
      server.watcher.on('change', (file) => {
        if (file !== TOKENS_PATH) return;
        try {
          build(); // Vite sees tokens.css change and hot-reloads it.
        } catch (error) {
          server.config.logger.error(`design tokens: ${(error as Error).message}`, { timestamp: true });
        }
      });
    },
    transformIndexHtml: {
      // Before Vite's own HTML step, so it resolves and hashes the font URLs like any asset.
      order: 'pre',
      handler: (): HtmlTagDescriptor[] => {
        const tokens = build();
        return [
          ...preloadedFonts(tokens).map((font) => ({
            tag: 'link',
            attrs: { rel: 'preload', href: `/${relative(root, join(DESIGN, 'system', font.file))}`, as: 'font', type: 'font/woff2', crossorigin: true },
            injectTo: 'head' as const,
          })),
          { tag: 'meta', attrs: { name: 'theme-color', content: resolveColor(tokens, THEME_COLOR_TOKEN, 'light') }, injectTo: 'head' },
        ];
      },
    },
  };
}

/** The upright faces the app's stylesheet loads (Newsreader and Figtree; not the italic, not Caveat). */
function preloadedFonts(tokens: Tokens) {
  const css = compile(tokens);
  return tokens.type.fonts.filter((font) => font.style === 'normal' && css.includes(font.file));
}
