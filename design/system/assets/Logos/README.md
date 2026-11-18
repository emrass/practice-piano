# Logos

- `practice-piano-mark.svg`: the mark. Three black keys over four white keys on a rounded oxblood field. Full color only; it is also the favicon. Its field is `#7a2e23`, a shade deeper than the `accent` token, and its keys are `#fbf6ec` and `#2b2622`. Use the file as it is; do not rebuild it from tokens.
- `practice-piano-keys.svg`: the keys, the drawing beside the name inside the app. Two black keys on paper in an oxblood outline, 28px. The file carries the light theme's colors; inlined, its four parts (`logo-keys-field`, `-lines`, `-black`, `-edge`) take `surface-sheet`, `border`, `text` and `accent`, so it follows the theme. See the Logo component.
- The mark is the favicon. The installed-app icon (`pwa/icons` and the native asset catalog) is still an older, different drawing: the black keys sit two and one, on a brighter field. It is to be redrawn from the keys, not from the mark; until then do not show it beside either.
- There is no wordmark file. The name is set live in Newsreader; see the Logo component.
- Smallest size 20px. Clear space on every side: a quarter of the mark's width.
