Practice Piano is the design system for practice-piano.com: a practice studio where you put a tablet or laptop on the music stand, plug in a MIDI piano, and read, listen and play. It covers the app (web, iPadOS, macOS) and the landing page.

The look is a sheet of music on a wooden desk. Warm paper, near-black ink, one oxblood pencil. The screen is read from the piano bench, at arm's length, with both hands busy, and every rule below follows from that.

## Principles

1. **Read from the bench.** The player sits 60 to 90 cm away with their eyes on the music. Anything read while playing (the score, the practice-bar message, live stats) is set at `body-lg` or larger; anything tapped while playing is `size-control-lg`. Small type and dense controls belong in the sidebar and dialogs, where the player leans in.
2. **Nothing moves but the music.** Controls, cards and the keyboard hold their size and place while values change, sliders drag and exercises swap. Reserve space for the longest value; hide with `visibility`, not `display`; give dialogs with tabs or steps a fixed height.
3. **The sheet is for music.** `surface-sheet` carries notation and the frame around it, nothing else. Notes are `text`; everything around them is quieter.
4. **One accent, said once.** Oxblood (`accent`) means "you are here" and "this is the next step". One primary button per region. If two things on screen are oxblood for different reasons, one of them is wrong.
5. **Never by color alone.** Every state has a second cue: a shape, a mark, a position, a word. Right and wrong must read in grayscale.
6. **In time, or not at all.** Feedback tied to a note or a beat lands within `duration-instant`. A key that lights late feels like a broken piano. Everything decorative can be dropped.
7. **A teacher, not a game.** Rewards mark accuracy and habit, in gold, quietly. No confetti, no streak pressure, no exclamation unless a run was clean.

## Color

Use the semantic tokens. The palette steps (`sepia-*`, `oxblood-*`, `gold-*`, `viridian-*`, `carmine-*`) exist to define them and are not for components.

- **Surfaces stack from the desk up.** `surface-canvas` is the desk. `surface-panel` is the sidebar. `surface-sheet` is the score and top bar. `surface-card` is every card and control. `surface-overlay` floats. `surface-well` is a recess inside a card. In both themes, lower means closer to the canvas color.
- **Text has three levels.** `text` for what matters, `text-muted` for what supports it, `text-subtle` for labels, hints and units. `text-subtle` holds 4.5:1 on card, sheet, panel, well and overlay; keep it off `surface-canvas`.
- **Borders have three jobs.** `border-subtle` divides, `border` outlines cards and labeled buttons, `border-strong` marks controls that need an edge to be found (inputs, the off switch, slider line).
- **Accent** is `accent` on `on-accent`, with `accent-hover` and the tint `accent-soft`. In the dark theme the accent lightens to a terracotta and takes dark text; never hard-code white on it.
- **Status is four words.** `success` (right, in time, passed), `warning` (nearly: early, late, uneven), `danger` (wrong, missed, destructive), `reward` (earned: XP, streak, mastery). Each has a `-soft` tint; fills take the matching `on-` text.
- **Danger is carmine, not oxblood.** The accent and the error color are both reds, on different hues. Do not rely on that difference: an error always carries words or a mark.
- **Success is a blue-leaning green** so it stays apart from danger for red-green color blindness.
- **Reward and warning share the gold ramp** and are kept apart by form: reward is an icon, a badge or a bar that fills; warning is a judgment in words.
- **Gold as text** is `reward-text` or `warning`, never `reward`: the bright gold only passes as a graphic.
- **The keyboard and the score have their own tokens** (`keyboard-*`, `key-*`, `score-*`, `heat-*`). The keyboard case is dark and the keys are light in both themes.
- **Themes:** light is the default and the brand; dark is for evening practice. Set `data-theme` on the root. Every token has a value in both, so components never branch on the theme.

## Typography

- **Newsreader is the voice of the music**: names, numbers and verdicts (`display`, `headline`, `title`, `title-sm`, the `numeral` steps, `chord`). Ship the font; never fall back to whatever serif the system has for brand text.
- **Figtree does the work**: everything you operate or read as instruction (`body-lg`, `body`, `body-sm`, `caption`, the `label` steps, `overline`, `micro`). Ship the font, so a label measures the same on iPad, Mac, Windows and Android. The system UI font is only the fallback while it loads; preload both faces so the first paint does not reflow.
- **Figures are tabular lining numerals**, always, with their unit: "83 bpm", "96%", "10 ms". Digits that change must not shift their neighbors.
- **Uppercase is for `overline` only**: one or two words, 0.06em tracking. Everything else is sentence case.
- **Three weights**: 400 for reading, 600 for controls and headings, 700 for `overline`, `micro` and chord symbols. Both families are variable fonts: one file each covers them all.
- **Floor:** 11px (`overline`, `micro`) for one or two words; 12px (`caption`) for a sentence; 16px (`body-lg`) for anything read while playing.
- Sizes are in rem so the browser's text-size setting scales the interface. Layout must survive 200% zoom and a 320px-wide viewport.
- Accidentals are the real characters, ♭ and ♯. Neither font has them (nor the arrow →); they fall back to the system's symbol font, and that is expected.
- **Caveat** (`site-hand`) is the teacher's pencil on the landing page hero. It never appears in the app.

## Space, shape and depth

- **Spacing** is a 4px grid with 2 and 6 for dense rows; the token name is the pixel value (`space-12`). Lay out with `gap`, not margins. Typical steps: 6 from label to control, 8 between buttons, 12 between fields and between stage cards, 16 inside a card, 24 inside a dialog.
- **Radius** nests by subtraction: `radius-xl` dialogs, `radius-lg` cards, `radius-md` controls and wells, `radius-sm` parts inside a control, `radius-xs` keycaps and piano keys, `radius-full` pills and dots.
- **Borders carry structure; shadows only say "this floats."** `shadow-1` rests cards on the canvas, `shadow-2` lifts popovers and the drawer, `shadow-3` lifts dialogs and results. `shadow-knob` is for the moving part of a control. No other shadows, no glows, no gradients except the piano case and the shading on a key.
- **Controls** are 36px (`size-control-md`), 32px in dense panels, 44px on the stage. On touch screens every control reaches `size-target-min` through an invisible hit area, without changing size.
- **Focus** is a 2px solid `focus-ring`, 2px off the control, on every focusable element. On the keyboard case it is `keyboard-accent`.
- **Disabled** is `opacity-disabled`, stays in place, and says why.
- **Layers** come from the `z-*` scale: drawer 20, popover 30, dialog 40, toast 50.

## Motion

- `duration-instant` (60 ms) for anything that answers a note or a beat: key states, beat dots, the pedal. No easing.
- `duration-fast` (120 ms) for hover and color; `duration-base` (200 ms) for the cursor, switch, drawer and dialog; `duration-slow` (400 ms) for progress fills and the wrong-note shake.
- Everything eases with `ease-out`. The Flow playhead and anything tied to musical time is `ease-linear` at constant speed.
- One shake, 3px, once, for a wrong note. Nothing bounces, pulses or loops.
- Under `prefers-reduced-motion`, transitions and the shake drop out. The playhead, cursor and beat dots stay: they are the information.

## Iconography

- Use the icons in `assets/Icons`, inlined so they take the text color, at 16px in controls and 20px alone.
- No Unicode symbols as icons and no emoji. Their shapes change between systems.
- An icon never stands alone as a status. Pair it with a word, or put the word in the label.
- The mark is `assets/Logos/practice-piano-mark.svg`, used whole and unaltered; the name beside it is live text (see Logo).

## Building with it

- **Tokens** are CSS custom properties: `var(--surface-card)`, `var(--space-12)`, `var(--radius-md)`, `var(--font-serif)`. A text style is one declaration, `font: var(--type-title)`; styles with tracking add `letter-spacing: var(--tracking-overline)`.
- **Components** are plain classes in `components/bundle.css`: a block (`.btn`), modifiers with a hyphen (`.btn-primary`, `.btn-lg`), and state from ARIA wherever ARIA has a word for it (`aria-pressed`, `aria-checked`, `aria-selected`, `aria-current`, `disabled`). `.is-*` classes are only for states ARIA cannot name (`.is-wrong`, `.is-held`).
- **No literal colors, type sizes, shadows or durations in component CSS.** One that is not a token is either a mistake or a missing token. Measurements that are one component's own anatomy (a switch's track, a key's height) stay with that component.
- **Page-level media queries are for the shell only.** A component adapts to its own width with a container query.
- Write in American English: color, center, gray.
