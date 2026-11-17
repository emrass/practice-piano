# ChoiceCard

A choice with a name and one line that explains it, stacked as a list of radio cards.

- **Use** when the options need a sentence each to be told apart: starting level, latency presets, ways to connect a piano.
- **You provide** for each option a short name and one line saying what it means for the player.
- `.choice-group` is the `radiogroup`: the cards stacked 6px apart. Each card is a `radio` button with `aria-checked`; arrow keys move the selection. Selected is an `accent` border, a tint, and a filled radio mark at the left.
- Two to five options. All the same length, parallel wording.
