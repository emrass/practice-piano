# Keyboard

The on-screen piano: a dark case with a control bar on top and playable keys below. It mirrors the real instrument and stands in for it.

- **You provide** the visible range, the state of each key, and which labels to show.
- **The case is dark in both themes.** It is an instrument, not a panel. On it use only `keyboard-text`, `keyboard-text-muted` and `keyboard-accent`; focus rings there are `keyboard-accent`.
- **Fixed height** (196px; 160px on short screens; 148px below `bp-md`). Changing the range rescales the keys inside; the dock never grows or shrinks.

| Key state | Class | Tint | Second cue |
|---|---|---|---|
| Play this next | `.is-expected` | `key-expected` (gold) | a dot above the label |
| Held | `.is-held` | `key-held` | the note tag in the bar |
| Held and right | `.is-correct` | `key-correct` | none: the expected dot clears |
| Wrong | `.is-wrong` | `key-wrong` | a cross and one shake |

- Key states change in `duration-instant` or less. A key that lights late feels like latency.
- Labels are `micro` in `key-ink`; the Cs are `key-ink-c` so octaves are easy to find. On a tinted key every label switches to `key-ink-strong`. Labels may shrink with the key down to 9px, then hide.
- **Bar, left:** the pedal (hollow up, filled and gold down, always with the words) and a tag per held note. **Bar, right:** range, then icon toggles for guide, display and key sound.
- **Piano shortcuts:** when a run ends, a few keys carry a `.key-flag` ("Next", "Restart") and play that action. Flags are oxblood in both themes.
- In ear training the guide is off and says why; the keys never give the answer away.
- Each key is a button for touch and mouse; computer keys A S D F play too. Do not put any other control inside the key bed.
