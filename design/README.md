# Design system

The look and behavior of practice-piano.com, written down once: design tokens, component styles,
guidelines, icons and fonts. It covers the app in this repository and the landing page in
[practice-piano-site](https://github.com/emrass/practice-piano-site).

**Status:** the app builds and imports the tokens and the component stylesheet. Its controls,
dialogs, panels, the top bar, the stage (meta strip, score, keyboard, practice bar, results,
chord chart, beat dots, heatmap) and Today's practice (plan steps, plan list) use the components; the React side is in `src/ui/components`
(`controls.tsx`, `Dialog.tsx`, `Icon.tsx` and the stage components themselves). What is left in
`src/styles` for the stage is arrangement: the stage grid, the score's scrolling frame, how the
cursor and playhead are placed, and what the shell changes by window size. `system/guides/05-adoption.md` maps the old classes to their replacements.
The copy follows the Writing guide, and the favicon and the installed-app icon are drawn from the
keys, like the logo.

## What is here

```
design/
  system/                 the design system itself (the source of truth)
    README.md             principles and the rules for color, type, space, motion and icons
    tokens.json           every token: colors per theme, text styles, spacing, radius, shadow, ...
    guides/               writing, layout, accessibility, changing the system, adoption
    components/
      bundle.css          the styles of all components, built on the tokens
      <Name>/README.md    when to use the component, what you provide, how it behaves
      <Name>/preview.html a bare page showing its variants and states
    assets/               the logo (the keys), the icon set, font licenses
    fonts/                Newsreader (voice), Figtree (interface), Caveat (landing page only)
  scripts/                build, check and preview (plain Node, no dependencies)
  dist/                   built on demand, not committed:
    tokens.css            CSS custom properties and @font-face for the app
    site-fonts.css        the faces only the landing page uses (Caveat)
```

## Commands

```sh
npm run design:preview   # every component in light and dark at http://localhost:4174
npm run design:build     # write design/dist/tokens.css and site-fonts.css from tokens.json
npm run design:check     # validate the system; part of `npm run check`, so CI runs it
```

`design:check` fails when:

- a text color drops below 4.5:1, or a mark that carries meaning below 3:1, on the surfaces it
  is meant for, in either theme (246 pairs);
- a token has no usage note, a duplicate name, or an alias that leads nowhere;
- `bundle.css` or a stylesheet in the app's `src/styles` contains a literal color, duration or
  type size, or uses a variable that is not a token (a line can state an exception with a
  `/* literal: why */` comment, except for colors); the app's stylesheets may not redefine a token;
- the text styles restated at the top of `bundle.css` differ from `tokens.json`;
- a component lacks its README or preview, a font lacks its license, or `tokens.json` no
  longer compiles;
- `public/favicon.svg` is not the keys: the four parts of `assets/Logos/practice-piano-keys.svg`
  in their colors; or the Score preview loads a VexFlow version other than the app's.

## Changing it

Read `system/guides/04-governance.md` first. In short:

1. Edit `system/tokens.json` (values), `system/components/bundle.css` (looks) or a README (rules).
   Components use semantic tokens, never palette steps or literal values.
2. Run `npm run design:check`.
3. Look at the result in both themes with `npm run design:preview`. It compiles the tokens on
   every request, so a reload shows the change.

## Using it

The stylesheets in `design/dist/` are build output. `tokens.json` is the only source, so there
is no generated file to keep in step and nothing to commit after a token change.

- **The app** builds `design/dist/tokens.css` as part of `vite` and `vite build`
  (`design/vitePlugin.ts` calls `compile()` from `scripts/build.mjs` and rebuilds when
  `tokens.json` changes), imports it first in `src/main.tsx`, and sets `data-theme="light"` or
  `"dark"` on `<html>`. Vite follows the font URLs in `tokens.css` and hashes the files, so the
  service worker caches them with the rest of the build and the native app bundles them. The
  plugin also preloads the Newsreader roman and Figtree files and writes the theme-color meta
  (`surface-sheet`); the web app manifest takes its colors from the tokens too. `tokens.css`
  leaves out Caveat, so the app never downloads it. `design/system/components/bundle.css`
  follows it in `src/main.tsx`, before the app's own stylesheets.
- **The landing page** has no build step. Its `scripts/sync-design.sh` runs
  `npm run design:build` here, then copies `tokens.css` and `site-fonts.css` with the font
  paths adjusted, the font files it uses, and the favicon (`public/favicon.svg`). Its own
  stylesheet uses the tokens; `system/guides/02-layout.md` has the page's rules.
- **In CSS**, tokens are custom properties: `var(--surface-card)`, `var(--space-12)`,
  `font: var(--type-body)`. Text styles with tracking also have `var(--tracking-overline)`.

## The published reference

A browsable copy of `system/`, with live component previews and token swatches, is published at
<https://claude.ai/artifact/8ph95ePkLBkndALoTwq2CX> (private; ask the owner for access). This
folder is the source: change it here, then republish the copy. Two things differ there by
design: the page compiles its own stylesheet from `tokens.json` (text styles become classes
such as `.title` instead of `--type-*` variables, which is why `bundle.css` restates them), and
the icons and the logos are stored as uploads.
