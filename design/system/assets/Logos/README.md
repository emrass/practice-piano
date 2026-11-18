# Logos

- `practice-piano-keys.svg`: the keys, the one drawing of the brand. Two black keys on paper in an oxblood outline, 28px. The file carries the light theme's colors; inlined, its four parts (`logo-keys-field`, `-lines`, `-black`, `-edge`) take `surface-sheet`, `border`, `text` and `accent`, so it follows the theme. See the Logo component.
- Everything is drawn from it: the logo in the top bar and on the splash screen, the favicon (`public/favicon.svg`, redrawn on a 16px grid with the same parts and colors) and the installed-app icon (`pwa/icons` and the native asset catalog, rendered by `scripts/pwa-icons.ts`).
- There is no wordmark file. The name is set live in Newsreader; see the Logo component.
- Smallest size 20px, except the favicon, which is drawn for 16px. Clear space on every side: a quarter of the logo's width.
