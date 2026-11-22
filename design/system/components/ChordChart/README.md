# ChordChart

A lead-sheet grid: one cell per chord (a bar of a drill or a progression, half a bar of a sequence of inversions), the chord symbol large, its Roman numeral small beneath.

- **Use** in the Chords lesson when the notation is hidden and the player voices the chords themselves.
- **You provide** a title that says what the chart asks for, the bars per line (`--bars`), and per cell the symbol, the numeral and the state.
- **The chart** (`.chord-chart`) fills the score card and centers its parts: the title (`.chord-chart-title`, `label` in `text-subtle`), then the grid, never wider than 860px, then a hint when there is one.
- **A hint** under the grid is a Badge (`.badge.badge-accent`) of a few words: "E in the bass". A hint that is a sentence belongs in the practice-bar message.
- Symbols are Newsreader bold; numerals are `label` in `text-subtle`. Bar lines are 2px in `score-staff`: it is a chart, so it borrows the score's lines, not card borders.
- The current cell (`aria-current="true"`) has the cursor tint and a 3px underline in `score-cursor-edge`. Before a run starts it marks the cell that comes first.
- Outcomes color the symbol (`success`, `warning`, `danger`) **and** put a mark in the cell's corner: a check, a tilde for nearly (off the beat, or found after a wrong key), a cross for wrong or missed. The mark has `role="img"` and a name ("right", "nearly", "wrong", "missed").
- Write chord symbols the way a lead sheet does: `Cmaj7`, `Dm7`, `G7`, `B♭`, `F♯m`. Real flat and sharp signs, never "b" and "#".
- Cells keep a minimum height and equal width; a long symbol wraps inside its cell. In a grid under 480px wide (four bars on a phone) symbols step down to `title`, so C♯m stays on one line.
