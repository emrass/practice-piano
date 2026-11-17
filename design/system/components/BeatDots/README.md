# BeatDots

The metronome you can see: one dot per beat of the bar, the current one filled.

- **Use** in the practice bar in Flow, during the count-in and the run.
- **You provide** beats per bar and the current beat, updated from the audio clock, not from a timer.
- The first dot has a darker ring: it is the downbeat. The current beat fills and grows slightly. During the count-in the fill is `reward` gold instead of `accent`, and the message beside it says "Count-in".
- The change takes `duration-instant` (60 ms) and nothing longer: a dot that eases in is late.
- The row has a fixed width for the longest bar it will show, so the message beside it never moves: set `--beats` on the row to that number of beats (4 if unset).
- Stopped, the row is `.is-idle`: the dots stay, dimmed.
- Reduced motion keeps the dots: they are information, not decoration.
