# Card

The three ways to group things: a card on the canvas, a well inside a card, and a ruled section inside a panel.

- **Card** (`.card`): `surface-card`, hairline `border`, `radius-lg`, `shadow-1`. One job per card: the meta strip, the practice bar. The score is a card on `surface-sheet`.
- **Well** (`.well`): `surface-well`, `radius-md`, no border. Groups related things inside a card or dialog. Wells do not nest.
- **Section** (`.section` with `.section-title`): inside the sidebar, a title in `title-sm` and 12px between fields, split from the next section by `border-subtle`.
- **You provide** the content. A card has no title bar of its own; if it needs a heading, it is probably a section or a dialog.
- Do not put a card in a card. Do not give every block a card: on the stage there are exactly four, in a fixed order, at fixed heights.
- Radius nests by subtraction: 12px card, 8px well and controls, 6px inside a control.
