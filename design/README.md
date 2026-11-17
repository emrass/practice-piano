# Design system

The look and behavior of practice-piano.com, written down once: design tokens, component styles,
guidelines, icons and fonts. It covers the app in this repository and the landing page in
[practice-piano-site](https://github.com/emrass/practice-piano-site).

**Status:** the system is defined here, but the app's styles in `src/styles` do not use it yet.
Moving the app onto it is a separate step; `system/guides/05-adoption.md` maps every current
variable and class to its replacement and lists what will look different.

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
    assets/               the mark, the icon set, font licenses
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
- `bundle.css` contains a literal color, duration or type size, or uses a variable that is not
  a token;
- the text styles restated at the top of `bundle.css` differ from `tokens.json`;
- a component lacks its README or preview, a font lacks its license, or `tokens.json` no
  longer compiles;
- the mark differs from `public/favicon.svg`, or the Score preview loads a VexFlow version
  other than the app's.

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

- **The app**, once it adopts the system, builds `design/dist/tokens.css` as part of `vite` and
  `vite build` (a small plugin that calls `compile()` from `scripts/build.mjs` and rebuilds when
  `tokens.json` changes), imports it followed by `design/system/components/bundle.css`, and sets
  `data-theme="light"` or `"dark"` on `<html>`. Vite follows the font URLs in `tokens.css` and
  hashes the files, so the service worker caches them with the rest of the build and the native
  app bundles them. `tokens.css` leaves out Caveat, so the app never downloads it.
- **The landing page** has no build step. Whatever copies files into it runs
  `npm run design:build` here first, then takes `tokens.css` and `site-fonts.css` with the font
  paths adjusted, plus the font files and the mark.
- **In CSS**, tokens are custom properties: `var(--surface-card)`, `var(--space-12)`,
  `font: var(--type-body)`. Text styles with tracking also have `var(--tracking-overline)`.

## The published reference

A browsable copy of `system/`, with live component previews and token swatches, is published at
<https://claude.ai/artifact/8ph95ePkLBkndALoTwq2CX> (private; ask the owner for access). This
folder is the source: change it here, then republish the copy. Two things differ there by
design: the page compiles its own stylesheet from `tokens.json` (text styles become classes
such as `.title` instead of `--type-*` variables, which is why `bundle.css` restates them), and
the icons and the mark are stored as uploads.
