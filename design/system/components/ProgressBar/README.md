# ProgressBar

A thin bar that shows how far along something is, always beside the number it draws.

- **Use** for progress toward a known total: passes in a tier, accuracy per clef, steps of a calibration.
- **You provide** the value, the total and the text beside the bar ("3 of 5 passes", "96%"). The bar alone is never the readout.
- `role="progressbar"` with `aria-valuenow`, `-min`, `-max` and a label.
- Fill is `reward` gold while in progress and `success` once complete (`.is-complete`), and the text changes too ("Mastered"). `.progress-accent` for neutral progress such as a running test.
- 6px tall, 4px with `.progress-sm` inside list rows. The fill eases over `duration-slow`.
- For time left in a run, use the playhead, not a bar.
