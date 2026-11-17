# Heatmap

A strip of piano keys colored by how well each note is read: where on the keyboard the trouble is.

- **Use** in Progress, one strip per clef, and as the optional heat layer on the on-screen keyboard (a `.key-heat` bar with the same band class; see Keyboard).
- **You provide** per-note accuracy; the component sorts it into five bands, `heat-1` (under 60%) to `heat-5` (95% and up), by the whole percentage shown for the note. A note with too few attempts stays blank.
- One `.heat-key` per white key. A black key with data is a `.heat-sharp` inside the white key before it; one without data is not drawn.
- Five steps, not a continuous hue sweep. The ends differ in more than red against green, and the legend states each band.
- The strip is a picture: give it `role="img"` and an `aria-label` that says the range and the weakest note. The numbers themselves live in the weak-spots list next to it.
- Octave labels sit under the strip in `caption`, never inside a colored key: `.heat-axis` has one cell per white key and only the Cs carry a name, so each label stays under its key whatever the range.
- One legend for all strips in a section, every band with its numbers and the percent sign.
