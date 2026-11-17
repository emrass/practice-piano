# Slider

A range input with its label and live value on one line above the track.

- **Use** for a number on a continuous scale where the feel of "more" and "less" matters: tempo, level, volume, latency.
- **You provide** label, min, max, step, value and a formatter that adds the unit ("83 bpm").
- Set `--fill` to the value's percentage; the filled part is a 6px `accent` bar over a 2px `border-strong` line.
- **Preview while dragging, commit on release.** Anything costly (a new exercise, a re-engraved score) waits for pointer-up, key-up or blur.
- **Reserve the space the value can need.** The value has a minimum width in `ch`, and any text that changes with it (a tier name and summary) sits in a block with a fixed minimum height, so dragging moves nothing else.
- Arrow keys step by one, Page Up and Down by ten. The thumb is 20px with a 2px `accent` ring.

```html
<div class="field">
  <div class="slider-head"><label class="field-label" for="tempo">Tempo</label><output class="slider-value" for="tempo">83 bpm</output></div>
  <input class="slider" id="tempo" type="range" min="40" max="160" value="83" style="--fill:36%">
</div>
```
