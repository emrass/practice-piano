# Score

The sheet of music and everything drawn on it: notes, their feedback colors, the Wait cursor and the Flow playhead.

- **You provide** the exercise and the state of each note; the engraver (VexFlow) draws it. Tag each note group with `.note` plus one state class.
- The score lives on `surface-sheet` and nothing else does. Notation is `text`; staff and bar lines are `score-staff`, a step quieter than the notes.

| State | Class | Looks like | Second cue |
|---|---|---|---|
| Not yet played | `.note` | `text` | none needed |
| Current (Wait) | `.is-current` | `accent` | the cursor box around it |
| Right | `.is-good` | `score-good` | none: it is the default outcome |
| Right pitch, off the beat | `.is-ok` | `score-ok` | a tilde under the note, "Early" or "Late" in the practice bar |
| Wrong | `.is-bad` | `score-bad` | a cross under the note; the cursor shakes |
| Missed | `.is-missed` | `score-bad` at `opacity-missed` | a cross under the note |

- **Feedback is never color alone.** Wrong and missed notes get a mark under the staff, so the result reads in grayscale and for red-green color blindness.
- **Musical time is horizontal distance.** Bars in a system have equal width and beats are spaced evenly; notes sounding together in both hands line up exactly. Do not let the engraver pack notes by glyph width.
- **Wait cursor** (`.score-cursor`): a 30px box with `score-cursor` fill and a `score-cursor-edge` outline. Moves over `duration-base` with `ease-out`. On a wrong note it turns `danger` and shakes once.
- **Flow playhead** (`.score-playhead`): a 3px `accent` line that moves at constant speed with `ease-linear`, straight through bar lines.
- Labels around the staff (note names, fingering) are `micro` in `score-label`; thumb crossings in fingering are `accent`. Chord symbols are `chord`; bar numbers are `bar-number`.
- The score scrolls inside a fixed frame. A new exercise never changes the height of the card or moves the keyboard.
- Results cover it with `.veil`, a translucent sheet, so the notation and its marks stay readable behind the card.
