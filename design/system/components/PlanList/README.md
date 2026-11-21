# PlanList

Today's blocks as a list on the plan page: one row per block with the reason it is there, the next one carrying the way on.

- **Use** on the plan page of Today's practice, inside its one Card. It is read from the bench between blocks, so names are `title` and sentences `body-lg`. For rows a player compares down a column in a panel, use DataList.
- **You provide** for each block the lesson's name, one or two sentences, and its length. Before a block is played the sentences say why it is in the plan and what it features ("Level 45. Featuring F2 and B2, your weakest notes."); afterwards they say what it came to ("3 of 3 passed. One tempo went up.").
- **Row anatomy:** the mark (the same `.step-mark` as PlanSteps), the name (`.plan-block-name`), on the right the length in minutes before the block is played and its runs as dots once it is (`.plan-block-side`), and the sentences under the name (`.plan-block-why`).
- **The block that is next** has `aria-current="step"`: a card fill and an `accent` outline that does not change the row's size, the number filled in `accent`. It alone has an action row (`.plan-go`): one `primary` Button that names the lesson ("Start sight reading", "Continue sight reading" once a run is played) with its shortcut, the same action as a piano keycap, and a ghost "Skip block". The primary button has the focus when the page opens, so Enter takes it.
- **States, each with a second cue.** Done (`.is-done`): the check, the outcome in words, dots for the runs. Skipped (`.is-skipped`): a dashed ring, the name struck through, "Skipped." To come: the number in a ring and the length.
- **A skip can be taken back.** A skipped row has a small quiet Button on the right, "Bring back", in the place of the length. It puts the block back in its place in the order, with the runs it already has. Its accessible name includes the lesson ("Bring back sight reading"). There is no confirmation before a skip: undoing it is one tap.
- **One accent.** Only the block that is next is outlined and has a primary button. A finished plan has neither.
- Rows keep their height when the plan moves on, except the one that gains or loses the action row. The list never reorders.
- An ordered list. Each name carries its state in words for screen readers ("Sight reading, next").

```html
<ol class="plan-list">
  <li class="is-done"><svg class="icon step-mark is-done">…</svg><span class="plan-block-name">Scales &amp; arpeggios</span>
    <span class="plan-block-side"><span class="pips" role="img" aria-label="3 of 3 exercises">…</span></span>
    <span class="plan-block-why">3 of 3 passed. One tempo went up.</span></li>
  <li aria-current="step"><span class="step-mark" aria-hidden="true">2</span><span class="plan-block-name">Sight reading</span>
    <span class="plan-block-side num">8 min</span>
    <span class="plan-block-why">Level 45. Featuring F2 and B2, your weakest notes.</span>
    <div class="plan-go"><button class="btn btn-primary">Start sight reading <kbd>Enter</kbd></button>…<button class="btn btn-ghost">Skip block</button></div></li>
</ol>
```
