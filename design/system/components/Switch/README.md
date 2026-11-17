# Switch

An on/off setting that takes effect at once, with its label on the left and the switch on the right.

- **Use** for a single independent option. Two exclusive options ("Wait" or "Flow") are a SegmentedControl.
- **You provide** a label that names the thing switched on ("Note names on the keys"), an optional one-line hint, the state and the handler.
- `role="switch"` with `aria-checked`, labeled through `for`. Space and Enter toggle it. The whole row is the pointer target.
- On is an `accent` track with the knob at the right; off is a `border-strong` track with the knob at the left. Position carries the state.
- Write the label positively and never flip its meaning: no "Disable hints".
- A switch that cannot be used stays visible, disabled, with the reason as its hint.
