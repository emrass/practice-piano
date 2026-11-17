# Callout

A boxed note inside a panel, dialog or card: one thing the player should know right here.

- **Use** for a status that stays until it changes: what this run counts for, whether the piano was heard, the outcome of a step. For a passing message while playing, use the practice bar.
- **You provide** an optional title and one or two sentences. Lead with what is true, then what to do. Where the next step has alternatives ("on a computer…", "on an iPad…"), a short list of two or three items can take the place of the sentences.
- Tones: neutral, `.callout-success`, `.callout-warning`, `.callout-danger`. A toned callout always has a title with an icon that says the same thing as the color. There is no accent tone: an oxblood box reads as an error.
- **An action** that belongs to the note ("Calibrate…" beside "Not calibrated") sits inside it on the right: `.callout-with-action`, the title and sentences in `.callout-text`, then one `.btn-sm`. One button at most; anything more is a section with its own controls.
- One callout per section. Two stacked warnings means the section needs rethinking.
- Reserve its height if it can appear while a control is being dragged.
