# Score

The sheet of music and everything drawn on it: notes, their feedback colors, the Wait cursor and the Flow playhead.

- **You provide** the exercise and the state of each note; the engraver (VexFlow) draws it. Tag each note group with `.note` plus one state class.
- The score lives on `surface-sheet` and nothing else does. Notation is `text`; staff and bar lines are `score-staff`, a step quieter than the notes.

| State | Class | Looks like | Second cue |
|---|---|---|---|
| Not yet played | `.note` | `text` | none needed |
| Current (Wait) | `.is-current` | `accent` | the cursor box around it |
| Right | `.is-good` | `score-good` | none: it is the default outcome |
| Nearly: right pitch off the beat (Flow), or found after a wrong key (Wait) | `.is-ok` | `score-ok` | a tilde under the note; in Flow also "Early" or "Late" in the practice bar |
| Wrong | `.is-bad` | `score-bad` | a cross under the note; the cursor shakes |
| Missed | `.is-missed` | `score-bad` at `opacity-missed` | a cross under the note |
| Not shown yet | `.is-hidden` on a `.note` with its labels and mark, or on a whole `.bar` | invisible | a placeholder in the note's place (ear training); the bar's empty staff (Rhythm Echo) |
| Played by the app | `.is-call` | `text-subtle` | its place: the call bars come first, the bars to answer after them |

- **Hidden notes** are for the lessons that ask the player to find or answer something: ear training shows a note once it is found, Rhythm Echo shows a bar once it is answered (the bar fades in over `duration-base`). The engraver groups each bar's notes, rests and beams as `.bar`.
- **The placeholder** (`.score-placeholder`, shown with `.is-shown`) holds the place of a note not found yet: a dashed box in `accent-soft` with a question mark in `accent`, on the middle line of the staff. It goes when the note appears.
- **Feedback is never color alone.** Nearly, wrong and missed notes get a mark under the staff, so the result reads in grayscale and for red-green color blindness. The mark is a `.score-mark` text one row under the note's name label (in the label's row when names are off), drawn by the engraver from the same state that sets the color; `.is-ok` on it makes it the tilde's color.
- **Musical time is horizontal distance.** Bars in a system have equal width and beats are spaced evenly; notes sounding together in both hands line up exactly. Do not let the engraver pack notes by glyph width.
- **Wait cursor** (`.score-cursor`): a 30px box with `score-cursor` fill and a `score-cursor-edge` outline. Moves over `duration-base` with `ease-out`. On a wrong note it turns `danger` and shakes once; `.is-wrong` comes off again when the practice bar's message clears.
- **Flow playhead** (`.score-playhead`): a 3px `accent` line that moves at constant speed with `ease-linear`, straight through bar lines.
- **Read-ahead cover** (`.score-cover`, sight reading in Flow, when chosen): a soft layer over the music from just behind the playhead (about a notehead, so the note being played is hidden too) to a beat, half a bar or a bar ahead. The notes dissolve under a `blur-cover` blur and the `veil` paper wash, while the staff lines and bar lines are redrawn on top in `score-staff`, so the staff runs on unbroken. No box, border or corners: every edge fades out over `space-12` (sides) and `space-24` (top and bottom), centered on the edge. It covers the whole height of the line; past the end of a line it carries on at the start of the next one. It moves with the playhead, which stays on top of it. It is not shown during the count-in or on the results, and the keyboard guide is off while it is on, since it would light the covered keys.
- Labels around the staff (note names, fingering) are `micro` in `score-label`; thumb crossings in fingering are `accent`.
- **Fingering** sits above the treble staff and below the bass staff. A line of single notes has one number per note, in one row. A chord has one number per note, stacked away from the staff in the order of its notes, so the top number is the top note's finger (right hand 5 over 3 over 1). The stack gets its own room: the system grows by a row for each number beyond the first, and nothing overlaps it. Chord symbols go above the stack. A stack has no accent: every chord has a thumb in it. Chord symbols are `chord` (`.chord-symbol`), a Roman numeral beside one is `label-sm` in `text-subtle` (`.chord-numeral`); bar numbers are `bar-number`.
- The score scrolls inside a fixed frame. A new exercise never changes the height of the card or moves the keyboard.
- Results cover it with `.veil`, a translucent sheet, so the notation and its marks stay readable behind the card.
