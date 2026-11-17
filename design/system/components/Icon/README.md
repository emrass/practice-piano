# Icon

One small set of line icons, drawn for this app: a 20-unit grid, 1.5 stroke, round caps and joins, solid shapes only for the parts that mean "on" or "earned".

- **Use** an icon where a control has no room for a word (icon buttons, the keyboard bar) or to back up a status word (a check beside "We hear you"). Never as decoration, never in place of a label that would fit.
- **You provide** the name. Inline the SVG so it takes the text color; size with `.icon` (16px) or `.icon-lg` (20px). In running text the icon sits on the line like a letter ("· ★ mastered at 96 bpm").
- Icons are `aria-hidden`; the control carries the name in `aria-label` or visible text.
- No Unicode symbols as icons (`☰ ✕ ☀ ☾ ◆ ★ ♪`): they change shape from one system font to the next and some turn into emoji. No emoji anywhere.
- Musical signs inside text are text, not icons: write ♭ and ♯ as the real characters.
- A new icon keeps the grid, the stroke and the round ends, and must read at 16px.

```html
<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>
```
