# SegmentedControl

Two to five choices of the same kind, one always selected, all visible at once.

- **Use** for a setting that changes what is on screen right away: lesson, Wait or Flow, hands, clef. More than five options, or long labels, go in a Select.
- **You provide** a group label (`aria-label`), the options and the value. Labels are one or two words, sentence case.
- Markup is a `radiogroup` of `radio` buttons; `aria-checked` drives the look. Arrow keys move the selection, Tab leaves the group.
- The selected option is a raised thumb, not just a color.
- Give the control a fixed or full width so switching never shifts its neighbors. Size options from their own label (`flex: 1 1 auto`): equal slices cut the longest one.
- When there is less room, shorten the labels ("Sight reading" to "Sight"); do not shrink the type.

```html
<div class="segmented" role="radiogroup" aria-label="Practice mode">
  <button role="radio" aria-checked="true">Wait</button>
  <button role="radio" aria-checked="false">Flow</button>
</div>
```
