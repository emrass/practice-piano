# Keyboard

The on-screen piano: a dark case with a control bar on top and playable keys below. It mirrors the real instrument and stands in for it.

- **You provide** the visible range, the state of each key, and which labels to show.
- **The case is dark in both themes.** It is an instrument, not a panel. On it use only `keyboard-text`, `keyboard-text-muted` and `keyboard-accent`; focus rings there are `keyboard-accent`.
- **Fixed height** (196px; 160px on short screens; 148px below `bp-md`). Changing the range rescales the keys inside; the dock never grows or shrinks. The component is always 196px: the two smaller heights depend on the window, so the shell sets them in its own media queries.

| Key state | Class | Tint | Second cue |
|---|---|---|---|
| Play this next | `.is-expected` | `key-expected` (gold) | a dot above the label |
| Held | `.is-held` | `key-held` | the note tag in the bar |
| Sounding on the pedal | `.is-sustained` | a lighter `key-held` | the gold tag in the bar |
| Held and right | `.is-correct` | `key-correct` | none: the expected dot clears |
| Wrong | `.is-wrong` | `key-wrong` | a cross and one shake |

- Key states change in `duration-instant` or less. A key that lights late feels like latency.
- Labels are `micro` in `key-ink`; the Cs are `key-ink-c` so octaves are easy to find. On a tinted key every label switches to `key-ink-strong`. Labels shrink with the key down to 9px; on a key under 13px wide all but the Cs hide. Each key measures itself (it is a size container), so this follows the range and the window without any script.
- A second line above the label (`.key-hint`) shows the computer key that plays it.
- **Bar, left:** the pedal (hollow up, filled and gold down, always with the words; its width is reserved) and a tag per held note in `.keyboard-tags`, which clips at its end and never pushes the right side. **Bar, right:** range (`.keyboard-range`, the first thing to drop when the bar is under 480px), then icon toggles for guide, display and key sound.
- A toggle that does not apply here stays in place with `aria-disabled="true"` and a `title` that says why; it does not react to hover.
- The display menu is a Popover inside the case. It keeps the page's own surface, text and focus ring.
- **Piano shortcuts:** when a run ends, a few keys carry a `.key-flag` ("Next", "Restart") and play that action. Flags are oxblood in both themes. A key that carries a flag in any octave is `.is-flagged` (a faint tint), so the shortcut is found wherever the hands are. The same flag names a lesson's designated keys (Rhythm: "RH", "LH").
- **Flags on narrow keys** (under 44px: a phone, a long range) drop to the foot of the key, over the note name, and every other one takes `.is-alt` to sit a row up, clear of its neighbors. Detail in a `<small>` hides there.
- In ear training the guide is off and says why; the keys never give the answer away.
- Each key is a button for touch and mouse; computer keys A S D F play too. Do not put any other control inside the key bed.
- **Heat layer** (optional): a `.key-heat` bar at the top of a key with a `heat-1` to `heat-5` class, in the bands of the Heatmap.
