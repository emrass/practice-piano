# Results

The card that lands on the score when a run ends: the verdict, the numbers behind it, what changes next, and one thing to work on.

- **Order, always:** ribbon, verdict, up to four stat tiles, what happens next, coaching notes, XP and actions, 12px apart, as in a dialog body.
- **You provide** pass or fail, the stats for the lesson type, the consequence (tempo, level, review date), up to three notes, XP, and the actions.
- **Ribbon:** one line that says whether the run counted and why. Pass is `success` with a check; not passed is neutral, never red. A run that did not pass is practice, not failure.
- **Verdict** in `headline`: one or two words in a teacher's voice ("Clean!", "Nearly", "Slow it down").
- **Tiles:** the deciding figure first and `.is-key`, all at the default Stat size. Each tile is a value over a short sentence-case note that includes the unit or direction ("Timing · 32 ms late"): a direction goes in the note, never in the value, so the figure is never cut. A breakdown that needs a sentence takes a full row: `.stat-tile-wide`.
- **Next** is a neutral Callout stating the consequence as a fact on one line where it fits, the change in bold: "**Tempo up: 60 → 64 bpm.** Review in 1 day.", or the tier's name with its progress bar and "2/3 passes". The ribbon already carries the color.
- **XP** is a Stat: the figure (`.results-xp`) over one `stat-note` per thing that changed it.
- **Notes** name the bar, note or chord and say what to do about it. At most three.
- **Actions** right-aligned, the way forward `primary` and last. The same actions sit on piano keys (see Keyboard), so the player need not reach for the screen.
- It sits on `.veil` over the score, not on a scrim: the marked-up notation stays visible behind it. Width up to 480px; tiles go two-up when the card is narrow (the card is the size container, under 400px inside). Taller than the score, it scrolls inside itself.
