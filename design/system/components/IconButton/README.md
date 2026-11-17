# IconButton

A square button that shows only an icon. For the few actions that are known by their sign and have no room for a word.

- **Use** for close, theme, the drawer toggle and the keyboard bar toggles. Anything else gets a Button with a label.
- **You provide** an icon from the set and an `aria-label` that says what pressing it does ("Switch to dark theme", not "Moon").
- Toggles carry `aria-pressed`; on turns the icon to `accent` (or `keyboard-accent` on the keyboard case) **and** swaps the icon for its "on" drawing, so state is never color alone.
- Add a `title` with the same words for pointer users.
- `.icon-btn-bare` drops the border inside a dialog head or on the keyboard case. `.icon-btn-sm` is 32px for dense bars.

```html
<button class="icon-btn" aria-label="Settings"><svg class="icon" …></svg></button>
```
