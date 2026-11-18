# Button

A labeled action. Quiet (card fill, hairline border) is the default; everything else is an exception you can name.

| Variant | Class | Use |
|---|---|---|
| Quiet | `.btn` | Any action. |
| Primary | `.btn-primary` | The one way forward in a view: Start, Next, Continue. At most one visible per region. |
| Inverse | `.btn-inverse` | Stop, and only Stop: Start turns into it while a run plays. |
| Ghost | `.btn-ghost` | The way out beside a primary: Skip, Cancel, Back. |
| Danger text | `.btn-ghost.btn-danger-text` | Opens a destructive flow (Reset progress). |
| Danger | `.btn-danger` | Confirms it, inside the confirming dialog only. |
| Pressed | `aria-pressed="true"` | A toggle that is on. |
| Nudge | `.is-nudge` | Points a new player at the next setup step. Remove once used. |

Sizes: `.btn-sm` 32px in dense panels, default 36px everywhere else, the stage included. `.btn-lg` 44px is for one button that has to be found without looking; the app uses none today. `.btn-block` fills its container.

- **You provide** the label, an optional shortcut `<kbd>` after it, and the handler.
- Label: a verb or verb plus object, sentence case, no period: "New exercise", not "OK" or "Submit".
- The accent and danger fills are both reds. Tell them apart by words and place, never by color: a destructive action always names what it destroys and confirms in a dialog.
- A button that changes meaning keeps its width (Start and Stop share a `min-width`), so nothing beside it moves.
- Disabled buttons keep their place and say why in a `title` or nearby text. Do not hide them.
- On touch screens every size reaches 44px through an invisible hit area; do not enlarge the button.

```html
<button class="btn btn-primary">Start <kbd>Space</kbd></button>
```
