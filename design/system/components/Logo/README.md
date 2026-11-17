# Logo

The mark and the wordmark: three black keys on an oxblood field, and the site's own address set in Newsreader with the top-level domain in `accent`.

- **Use** the full lockup in the top bar and the site header. Drop to the mark alone below `bp-lg` or wherever the name would crowd the lesson switcher.
- **You provide** nothing: the name is always `practice-piano.com`, lowercase, hyphenated, never "Practice Piano" in the lockup.
- The mark is the file in `assets/Logos`. Keep it at 28px in the app, never under 20px, and give it 8px of clear space. Do not recolor it, outline it or redraw it in CSS.
- Wordmark: Newsreader 600, 1.25rem, 0.01em tracking, `text`; `.com` in `accent`.
- As a link it carries `aria-label="practice-piano.com home"`; the image itself is decorative.

```html
<a class="logo" href="/" aria-label="practice-piano.com home">
  <img class="logo-mark" src="practice-piano-mark.svg" alt="">
  <span class="logo-name">practice-piano<span class="logo-tld">.com</span></span>
</a>
```
