# Adopting it in the app

The system was drawn from the app as it stood in November 2026, then tightened. This page maps the app's current styles onto it and lists what will look different once the app follows it.

## Variables

| App today | System token | Note |
|---|---|---|
| `--bg` | `surface-canvas` | |
| `--paper` | `surface-sheet` | Score, chord chart, top bar. |
| `--paper-2` | `surface-panel` or `surface-well` | It did two jobs: the sidebar, and insets inside cards. |
| `--card` | `surface-card`, `surface-overlay` | Overlay for dialogs and popovers. |
| `--ink`, `--ink-2` | `text`, `text-muted` | |
| `--ink-3` | `text-subtle` for text; `border-strong` for edges and dots | Was 3.2 to 3.8:1 as text in the light theme; now 4.8:1 or better. |
| `--label` | `score-label` | |
| `--rule`, `--rule-2` | `border`, `border-subtle` | Where `--rule-2` was a fill (segmented track, neutral ribbon), use `surface-well`. |
| `--accent`, `--accent-soft` | `accent`, `accent-soft` | Text on it is `on-accent`, replacing `#fff8f0` and `#1b1310`. |
| `--gold` | `reward` (fills, icons), `reward-text` (words) | |
| `--warn` | `warning` | Was the same amber as gold; as text it is now darker in the light theme. |
| `--ok`, `--ok-soft` | `success`, `success-soft` | Hue moves from green toward teal. |
| `--bad`, `--bad-soft` | `danger`, `danger-soft` | Hue moves from the accent's red to carmine. |
| `--cursor`, `--cursor-edge` | `score-cursor`, `score-cursor-edge` | Edge is stronger (3.8:1). |
| `--shadow` | `shadow-1` | Dialog, results, popover and drawer shadows become `shadow-2` and `shadow-3`. |
| `--radius`, `--radius-sm` | `radius-lg`, `radius-md` | |
| `--serif`, `--sans`, `--mono` | `--font-serif`, `--font-sans`, `--font-mono` | Serif loads Newsreader and sans loads Figtree; mono stays the system's. |
| `--key-*` | same names, plus `key-wrong`, `key-ink*`, `key-black-*`, `keyboard-*` | Replaces 48 hex and rgba literals in `keyboard.css`. |
| `--accent-2`, `--bg-grain` | none | Unused today. |

## Values that fold into the scales

| What | App today | System |
|---|---|---|
| Font sizes | 23 fixed sizes from 8px to 54px, seven of them half-pixels, plus three fluid ones | 19 text styles for the app; 11px floor |
| Font weights | 400, 500, 600, 700, 800 | 400, 600, 700 |
| Radii | 13 values plus per-corner variants | 6 tokens |
| Gaps and padding | some 20 values between 1 and 24px | 10 steps on a 4px grid (10px becomes 8 or 12; 14px becomes 12 or 16) |
| Control heights | 22, 24, 28, 30, 34, 36px | 32, 36, 44px |
| Transitions | 10 durations from 50 to 400 ms | 4 durations, 2 easings |
| Shadows | 17 definitions besides `--shadow` | 4 tokens |
| Stacking | 1, 2, 5, 19, 20, 40 | `z-*` scale |
| Shell breakpoints | 480, 600, 760, 900, 1080, 1240, 1760px | 480, 760, 1080, 1440px; content-driven ones become container queries |

## Classes

| App today | System |
|---|---|
| `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-block` | same |
| `.btn-small` | `.btn-sm` |
| `.btn-start.is-stop` | `.btn-inverse` |
| `.btn-ghost-danger` | `.btn-ghost.btn-danger-text` |
| `.btn.is-selected` | `aria-pressed="true"` |
| `.btn-start.is-playing` (gold) | dropped; the count-in shows in the beat dots and the message |
| `.icon-btn`, `.kb-icon` | `.icon-btn` (bare, small on the keyboard case) |
| `.segmented button.is-active` | `button[aria-checked="true"]` |
| `.sidebar-tabs`, `.settings-tablist` | `.tabs` with `aria-selected` |
| `.select-field`, `.slider-field`, `.field` | `.field` with `.field-label`, `.field-hint`, `.select`, `.slider` |
| `.toggle-row`, `.switch.is-on`, `.switch-knob` | `.switch-row`, `.switch[aria-checked="true"]` |
| `.setup-stage.is-active` | `.choice[aria-checked="true"]` |
| `details.advanced`, `details.help` | `.disclosure` |
| `.badge-sight`, `.badge-focus`, `.badge-mastered`, `.grade-chip` | `.badge` with a tone class |
| `.note-chip` | `.tag` |
| `.chip`, `.chip-midi .dot` | `.chip`, `.status-dot` |
| `.status-line`, `.review-note`, `.setup-note`, `.setup-listen`, `.scale-ladder`, `.item-status` | `.callout` with a tone class |
| `.progress-track`, `.progress-fill` | `.progress` with a child `span` |
| `.meta-item`, `.pb-stats div`, `.rg-item`, `.tile`, `.calib-results div` | `.stat` (with `.stat-tile`; in a MetaStrip) |
| `.weak-list`, `.tier-ladder`, `.repertoire-list` | `.data-list` |
| `.heatmap-keys`, `.heat-key` | `.heatmap`, `.heat-key.heat-1` to `.heat-5` |
| `.meta-strip`, `.practice-bar`, `.score-card` | `.card` plus `.meta-strip`, `.practice-bar`, `.score` |
| `.meta-tier`, `.meta-level`, `.meta-tier-name`, `.meta-item` | `.meta-lead`, `.meta-level`, `.meta-title`, `.stat` |
| `.piano-legend`, `.legend-key` | `.results-shortcuts`, `kbd.kbd-piano` |
| `.chord-hint` | `.badge.badge-accent` |
| `.pp-placeholder`, `.vf-pp-measure` | `.score-placeholder`; add `.bar` beside it |
| `.modal-backdrop`, `.modal-card`, `.modal-head`, `.modal-actions` | `.scrim`, `.dialog`, `.dialog-head`, `.dialog-actions` |
| `.kb-popover` | `.popover` |
| `.results-backdrop`, `.results-card`, `.results-grid` | `.veil`, `.results`, `.results-grid` |
| `.keyboard-dock`, `.piano`, `.key-action`, `.key-marker` | `.keyboard`, `.keys`, `.key-flag` |
| `.vf-pp-note` | add `.note` beside it |
| `.chord-card` | `.chord-cell` |
| `.brand`, `.brand-mark` (drawn in CSS) | `.logo` with the SVG mark |

## What will look different

1. **Wrong notes and keys turn carmine** instead of the accent's own red. In the dark theme the wrong key and the primary button were the same salmon.
2. **Notes get marks under the staff**: a tilde for right pitch off the beat, a cross for wrong or missed. Keys get a dot for "play this" and a cross for wrong.
3. **Right notes lean teal.**
4. **Small gray text gets darker** in the light theme: field labels, hints, stat keys, key names.
5. **Type is the same on every platform.** Headings, figures and the wordmark are Newsreader, not Iowan on Apple devices, Palatino on Windows and Times elsewhere. Interface text is Figtree, not San Francisco, Segoe or Roboto.
6. **The practice-bar message grows to 16px.** Stage buttons stay 36px; `.btn-lg` (44px) was tried there and taken back.
7. **Symbols become drawn icons**: ☰ ✕ ☀ ☾ ◆ ★ ♪ and the disclosure triangles.
8. **Inputs get a visible edge**; the off switch is gray rather than paper-colored.
9. **Gold badges take dark text**: "Mastered" was cream on gold at 3.4:1 (2.1:1 in the dark theme).
10. **Corners settle** on 8px for controls and 12px for cards; cards lose the inner top highlight.
11. **Messages drop the em dash**: "Take your time. The cursor waits for you."
12. **The heatmap has five bands** and a legend instead of a red-to-green sweep.
13. **Dark theme surfaces reorder** so recesses are darker than cards, as in the light theme.

## More than restyling

Most of the move is renaming variables and classes. Four parts change behavior or assets:

- **Fonts.** The app loads three files: Newsreader roman (132 KB) and italic (147 KB, used only for bar numbers) and Figtree (19 KB). Import them through the stylesheet so the build hashes them: the service worker then caches them with the rest of the build, and the native app bundles them. Preload the Newsreader roman and Figtree files so the first paint does not reflow. Caveat is for the landing page only and is left out of the app's stylesheet.
- **Second cues in the score.** The tilde and cross under the staff are drawn by the score renderer, next to the note-name labels, from the same note states that set the colors. The dot and cross on keys are CSS.
- **Two drawings, one each side of the door.** Inside the app the top bar keeps its outlined keys, now a file (`practice-piano-keys.svg`) instead of a CSS drawing. The favicon is the mark. Redraw the installed-app icon (web and native) from the keys.
- **Copy.** Messages, hints and results text are rewritten to the Writing guide: no em dashes, units on every number.

The landing page already matches closely (same paper, ink and oxblood, Newsreader). It needs the token names and the shared mark, not a redesign; it takes copies of the built `tokens.css` and `site-fonts.css` because it has no build step.
