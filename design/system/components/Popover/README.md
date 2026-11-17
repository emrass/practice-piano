# Popover

A small floating panel anchored to the control that opened it, for a handful of related settings.

- **Use** for two to four quick options that belong to one object (how the keyboard is shown). More than that is a dialog or a sidebar section.
- **You provide** the trigger (an IconButton with `aria-expanded` and `aria-controls`) and the content.
- `surface-overlay`, `border`, `radius-lg`, `shadow-2`, 300px wide and never wider than the screen minus 24px.
- Opens toward the free space (the keyboard menu opens upward), fades in over `duration-fast`. Closes on Esc, on a click outside, and when focus leaves; focus returns to the trigger.
- Not modal: the page behind stays live. No scrim.
- On the keyboard case the popover uses the page's own surface and text tokens, not the case's.
