# Logo

The keys and the wordmark: two black keys on paper inside an oxblood outline, and the site's own address set in Newsreader with the top-level domain in `accent`.

- **Use** the full lockup in the top bar and the site header. Drop to the mark alone below `bp-lg` or wherever the name would crowd the lesson switcher.
- **You provide** nothing: the name is always `practice-piano.com`, lowercase, hyphenated, never "Practice Piano" in the lockup.
- **Inside the app** (top bar, splash screen) the drawing is the keys, `assets/Logos/practice-piano-keys.svg`, inlined so it follows the theme: `surface-sheet` field, `text` keys, `border` lines, a 2px `accent` outline. Keep it at 28px, never under 20px, with 8px of clear space.
- **The installed-app icon** (web and native) is drawn from the keys too. Today it is still an older drawing; redrawing it is the next step.
- **The favicon** is the mark, `assets/Logos/practice-piano-mark.svg`: the filled one, which holds up at 16px on a browser tab of any color. Do not recolor it. Do not show the two side by side.
- Do not rebuild either drawing in CSS; use the files.
- Wordmark: Newsreader 600, 1.25rem, 0.01em tracking, `text`; `.com` in `accent`.
- As a link it carries `aria-label="practice-piano.com home"`; the image itself is decorative.

```html
<a class="logo" href="/" aria-label="practice-piano.com home">
  <svg class="logo-mark" viewBox="0 0 28 28" aria-hidden="true"><!-- the shapes of practice-piano-keys.svg --></svg>
  <span class="logo-name">practice-piano<span class="logo-tld">.com</span></span>
</a>
```
