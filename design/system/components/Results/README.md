# Results

The card that lands on the score when a run ends: the verdict, the numbers behind it, what changes next, and one thing to work on.

- **Order, always:** ribbon, verdict, up to four stat tiles, what happens next, coaching notes, XP, piano shortcuts and actions, 12px apart, as in a dialog body.
- **You provide** pass or fail, the stats for the lesson type, the consequence (tempo, level, review date), up to three notes, XP, and the actions.
- **Ribbon:** one line that says whether the run counted and why. Pass is `success` with a check; not passed is neutral, never red. A run that did not pass is practice, not failure.
- **Verdict** in `headline`: one or two words in a teacher's voice. A clean run is "Clean!", the only exclamation mark; any other pass is "Passed"; a run that did not pass is "Nearly" (75% or more) or "Slow it down". Mastery is not a verdict: it goes in the Next callout, with the star.
- **Tiles:** the deciding figure first and `.is-key`, all at the default Stat size. Each tile is a value over a short sentence-case note that names it and, where it helps, a direction or a count ("Timing · late", "Wrong · 2 hints"): a direction goes in the note, never in the value, so the figure is never cut. The note fits one line: about 15 characters, 89px at `caption` in the four-up grid. A size that does not fit (the offset in ms, the semitones moved) goes in the tile's title, or in a coaching note when it is worth acting on. A breakdown that needs a sentence takes a full row: `.stat-tile-wide`.
- **Next** is a neutral Callout stating the consequence as a fact on one line where it fits, the change in bold: "**Tempo up: 60 → 64 bpm.** Review in 1 day.", or the tier's name with its progress bar and "2/3 passes". The ribbon already carries the color.
- **XP** is a Stat: the figure (`.results-xp`) over one `stat-note` per thing that changed it.
- **Notes** name the bar, note or chord and say what to do about it. At most three.
- **Shortcuts** (`.results-shortcuts`), when the player navigates from the piano: one row in a well that starts with "Piano:" and gives each action as a piano keycap (Kbd, `.kbd-piano`) with its word, in the lesson's own words ("New rhythm"). It wraps when it must.
- **Actions** right-aligned, the way forward `primary` and last. The same actions sit on piano keys (see Keyboard), so the player need not reach for the screen.
- It sits on `.veil` over the score, not on a scrim: the marked-up notation stays visible behind it. Width up to 480px; tiles go two-up when the card is narrow (the card is the size container, under 400px inside). Taller than the score, it scrolls inside itself.
