# Layout

One screen, no scrolling page. The app is a fixed frame around a score.

## The shell

| Region | Surface | Size | Holds |
|---|---|---|---|
| Top bar | `surface-sheet`, bottom `border` | `size-topbar` (56px); two rows on phones | Logo, lesson switcher, Wait or Flow, status chips, theme, drawer toggle |
| Sidebar | `surface-panel`, right `border` | `size-sidebar` (340px) | Tabs: Practice (settings for the lesson) and Progress |
| Stage | `surface-canvas` | the rest | Four cards, top to bottom |

The stage, in order, with `space-12` between cards and `space-16` around them:

1. **Meta strip** (56px): level and tier name, then the facts of this exercise as a stat strip, then badges.
2. **Score** (fills what is left; scrolls inside itself).
3. **Practice bar** (64px on one row; grows by rows when narrow).
4. **Keyboard** (196px; 160px when the window is under 780px tall; 148px below `bp-md`).

Only the score flexes. Rows 1, 3 and 4 never change height because of their content.

## Stability rules

- A value that changes has a reserved width: `min-width` in `ch` for numbers, a fixed track for stats and badges.
- Something that appears and disappears keeps its box (`visibility: hidden`), or lives in an overlay.
- A slider previews while dragging and commits on release; text that follows it has a fixed minimum height.
- Dialogs with tabs or steps take the height of their tallest state.
- Scroll areas reserve their scrollbar (`scrollbar-gutter: stable`).
- Buttons that swap labels (Start and Stop) share a `min-width`.

## Breakpoints

Use these four for the shell, written as numbers in media queries. Everything else adapts by container query.

| Token | Width | What changes |
|---|---|---|
| `bp-xl` | 1440px and up | Long lesson names, all meta items. |
| `bp-lg` | below 1080px | Sidebar becomes a drawer over the stage, opened from the top bar, with `scrim` behind it. Wordmark and reward chips drop out. |
| `bp-md` | below 760px | Stage padding and gaps go to `space-8`. Short labels in the switchers. Keyboard at 148px. |
| `bp-sm` | below 480px | Shortcut caps and the middle stat hide. Dialogs are full-screen sheets below 600px. |

- What drops out goes in a fixed order: decoration, then labels that have an icon, then secondary numbers. Actions and the score never drop.
- Respect safe areas: pad the top bar and the bottom of the stage with `env(safe-area-inset-*)`.
- Landscape tablet is the reference layout. Design there first, then check a 13-inch laptop and a phone.

## Reading zones

| Zone | Distance | Type floor | Target size |
|---|---|---|---|
| Stage (score, practice bar, keyboard) | 60–90 cm, hands on the keys | `body-lg` for sentences, `numeral` for figures, `overline` for their labels | `size-control-lg` |
| Sidebar, dialogs, popovers | leaning in, one hand free | `body-sm`, `caption` for hints | `size-control-md`, `size-control-sm` in dense rows |

## The landing page

practice-piano.com is a reading page, not an app: one column, `site-body` in a 34em measure, `site-h1` to `site-h3` in Newsreader, screenshots of the real app on `surface-sheet` with `border` and `radius-lg`. It uses the same color tokens and the Logo; of the components it needs only Button. The pencil notes in `site-hand` are its one flourish.
