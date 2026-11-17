# Select

A native select inside a field: label above, optional hint below.

- **Use** for one choice out of six or more, or options with long names. Fewer and shorter: SegmentedControl.
- **You provide** the label, the options and the value. The first option may be an "Auto" that names its rule: "Auto (by level)".
- `.field` is the wrapper for every labeled input: `.field-label` (uppercase `overline`, tied with `for`), the control, then `.field-hint`.
- The select has a `border-strong` outline: an input must be findable by its edge alone.
- Hints say what the setting does to the music, in one sentence. Errors replace the hint, in `danger`, and say how to fix it.
- Keep the native control. It brings the platform picker on iPad and full keyboard support for free.

```html
<div class="field">
  <label class="field-label" for="key">Key</label>
  <select class="select" id="key">…</select>
  <p class="field-hint">Match the piano you play on.</p>
</div>
```
