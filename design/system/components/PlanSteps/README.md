# PlanSteps

Today's blocks along the top bar while one of them is played: what is done, which block this is, and how far into it.

- **Use** in the top bar, in the lesson switcher's place, while a block of Today's practice is on the stage. It has the SegmentedControl's box so the bar keeps its shape, but it is a readout: nothing in it is pressed. The way back to the plan is a Button before it ("Plan").
- **You provide** the blocks in order, each with a short lesson name (one word: Scales, Sight, Ear, Rhythm, Chords), its state, and for the block under way the runs played and asked for.
- **States, each with a second cue.** Done: a check in `success` and quieter text. Under way (`aria-current="step"`): the card fill, an `accent` underline, the number filled in `accent`, and the runs as dots. To come: the number in a ring. Skipped (`.is-skipped`): a dashed ring, the number and the name struck through.
- **The mark** (`.step-mark`) is the block's number in a 16px ring, or the check once done. PlanList uses the same mark, so a block looks the same in the bar and on the page.
- **Runs** (`.pips`) are one dot per run, filled once played, for up to five runs; above that the count itself ("3/8", `.pips-count`). They belong to the block under way only. Give them `role="img"` and a label ("1 of 3 exercises").
- **Nothing in it moves when a run ends.** The strip has a fixed width from the shell, the steps share it, and a dot fills in place.
- **It adapts to its own width** (a container query). Under 440px the other blocks keep their marks and give up their names; the block under way always shows its name and dots. The hidden names are still read out.
- An ordered list with a label ("Today's practice"). Each step's text carries its state in words for screen readers ("Scales, done"), since the check and the ring are decorative.
- Not for progress toward a number: that is a ProgressBar. Not for choosing: that is a SegmentedControl.

```html
<ol class="plan-steps" aria-label="Today's practice">
  <li class="is-done"><svg class="icon step-mark is-done">…</svg><span class="plan-step-name">Scales</span><span class="visually-hidden">, done</span></li>
  <li aria-current="step"><span class="step-mark" aria-hidden="true">2</span><span class="plan-step-name">Sight</span><span class="visually-hidden">, now</span>
    <span class="pips" role="img" aria-label="1 of 3 exercises"><i class="is-done"></i><i></i><i></i></span></li>
  <li class="is-next"><span class="step-mark" aria-hidden="true">3</span><span class="plan-step-name">Rhythm</span><span class="visually-hidden">, to come</span></li>
</ol>
```
