# Chip

A small outlined pill in the top bar that reads out one live value: streak, XP, the connected piano.

- **Use** for a standing readout that is always there. A passing judgment is a Badge.
- **You provide** the value with its unit ("6 days", "12,480 XP") and a `title` that names it. A chip that opens something is a `<button>` with `aria-haspopup`.
- The connection dot is hollow when off and filled `success` when on, and the text says which ("No piano connected"). The dot never stands alone.
- Digits are tabular. Give a chip whose text can grow a `max-width`; the text truncates with an ellipsis.
- Below `bp-lg` chips drop their text before the top bar wraps: reward chips go first, the piano chip keeps its dot.
