# Stat

A number with its name. The one pattern for every figure in the app: the meta strip, the practice bar, results, progress tiles.

- **You provide** a label of one or two words and a value with its unit ("83 bpm", "96%", "10 ms").
- Figures are Newsreader with tabular lining numerals (`numeral`); a value that is a word ("A minor", "Both hands") is `label` in the UI face (`.is-text`).
- Three sizes: `.stat-lg` for the one figure a dialog is about, default on the stage and results, `.stat-sm` in panel tiles.
- `.is-key` turns the value `accent`. One per group: the figure that decides pass or fail.
- Layouts: label over value (live readouts, as `<dl>`; the cells of a MetaStrip), or value over a sentence-case note in a `.stat-tile` well (results).
- **Tiles in a row line up.** They share a height, with 12px above and below. The figures share one line across the row, whatever their notes do. The notes are centered against each other in the room below: a one-line note sits level with the middle of a neighbor's two-line note. Keep notes in a row to the same number of lines where the wording allows. On a panel, where a well has the panel's own color, add `.stat-tile-card` to give tiles a card fill.
- **Fixed width per stat.** Give each one the width of its longest value so digits changing never move a neighbor. Truncate words with an ellipsis; never truncate a number.
- An empty value is an en dash, not "0" and not blank.
