# DataList

Rows of the same shape in aligned columns: weak notes, the tier ladder, repertoire.

- **Use** for three to thirty short records in a panel. Anything a player compares down a column belongs here, not in prose.
- **You provide** the rows and a column template in `--cols`. Fixed widths for keys and numbers, one `1fr` column for the name.
- Cell roles: `.data-key` (the note or item, `accent`, bold), `.data-meta` (secondary), `.data-num` (right-aligned, tabular), `.data-state` (the outcome at the end of the row).
- A row can end with a `.progress.progress-sm` bar (a tempo ladder, say); it runs under the cells, across the whole row.
- `.data-list-cards` gives each row a card fill on a panel. The current row has `aria-current="true"`: a tint and semibold text.
- Numbers always have a unit and one precision per column. Sort by what the player should act on first (weakest note on top).
- An earned state shows the star icon with a text alternative, not a color change alone.
