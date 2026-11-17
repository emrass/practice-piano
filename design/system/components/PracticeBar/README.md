# PracticeBar

The strip between the score and the keyboard: what to do now, what just happened, and how the run is going.

- **Order, always:** actions on the left, status in the middle, stats on the right. The primary action comes first and keeps its width when it turns from Start into Stop.
- **You provide** the actions for the mode, the message, the beat (Flow), the last grade (Flow) and three stats.
- **The message** is one sentence in `body-lg`, read from the bench: what to do next ("Play along with the playhead"), or what went wrong (`.is-wrong`: a `danger` tint, `danger` semibold text, and the words). It may wrap to two lines; it never truncates. It is a live region (`role="status"`).
- **Nothing in the bar moves when values change.** Stats have a fixed width, the grade badge keeps its box when empty, the beat dots keep theirs when stopped.
- **It adapts to its own width,** not the screen's (a container query): under 860px the status takes a full row above and the actions and stats share the row below. A status that also carries beat dots and a grade, or sits beside a third button, is `.is-wide` and takes its row under 1040px.
- Buttons here are `.btn-lg` (44px). Shortcut caps hide below `bp-sm`.
- Stats: at most three, the ones that change during a run. Everything else waits for the results.
