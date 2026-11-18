# MetaStrip

The first card of the stage: which exercise this is, and its facts, read in one glance before the first note.

- **Order, always:** a lead cell, up to six stats, then the badges.
- **You provide** the lead (the level with the tier's name, or an item's title alone for a scale or a chord progression), the stats as a label of one word over a text value ("Tempo" over "83 bpm"), and the badges.
- **Lead** (`.meta-lead`): the level as a `numeral` in `accent` (`.meta-level`, with room for "L100"), then the name in `title-sm` (`.meta-title`). A name that does not fit ends in an ellipsis and carries a `title`.
- **Stats** are Stat with a text value (`.stat-value.is-text`). Each has a hairline on its left, the first one too: it parts the stats from the lead.
- **Badges** (`.meta-badges`) sit at the right in a reserved 190px, room for two. A badge that comes and goes keeps its box (`.is-hidden`).
- **Nothing in it moves when values change.** It is 56px tall, and the cells share the width by fixed shares (the lead takes 1.3 shares, 2 once only two stats are left), so a cell's width depends on the strip's width and never on what the cell says. A long value ends in an ellipsis.
- **It adapts to its own width,** not the screen's (a container query). A stat needs about 100px. Trailing stats drop first, then the badges: six stats in a strip of 960px or more, four from 770px, two under that, the badges go under 610px, one stat under 440px. So put the stats in order of importance.
- It is a Card: write `class="card meta-strip"`. The lead is its first child.

```html
<div class="card meta-strip">
  <div class="meta-lead"><span class="meta-level">L44</span><span class="meta-title">Key Signatures</span></div>
  <div class="stat"><span class="stat-label">Key</span><span class="stat-value is-text">A minor</span></div>
  <div class="meta-badges"><span class="badge badge-reward">First sight</span></div>
</div>
```
