# Changing the system

The system is small on purpose. It grows when the product needs something three times, not when a design wants something once.

## Where the truth lives

- `tokens.json` is the only place a value is defined. Stylesheets read tokens; they do not restate them.
- `components/bundle.css` is the only place a component's look is defined. Feature styles arrange components; they do not restyle them.
- Each component's README is the contract: what it is for, what you provide, how it behaves.

## Token rules

- **Three layers.** Palette steps (`sepia-600`) hold raw values. Semantic tokens (`text-muted`) say what a value is for and point at a step per theme. Component tokens (`key-held`, `score-good`) exist only where a part has needs no semantic token meets.
- **Name by role, not by look.** `border-strong`, not `border-dark`; `reward`, not `gold`.
- **Use the highest layer that fits.** Components use semantic tokens. Reaching for a palette step means a semantic token is missing: add it.
- **Every color token has a light and a dark value and a usage note** that names the surfaces it works on.
- **Scales are closed.** A new spacing, radius, size or type step needs the same case as a new component. An in-between value is rounded to the scale.
- **Never rename in place.** Add the new name, move the uses, then remove the old one.

## Adding or changing a component

Add a component when the same pattern appears in three places, or when one place is important enough to be the reference (the score, the keyboard). Before that, compose existing ones.

A component is done when it has:

1. Styles in `bundle.css` using tokens only.
2. A preview showing its variants and states, legible in both themes.
3. A README: purpose, when to use it and when not, what you provide, behavior, accessibility.
4. Contrast checked for every text and background pair it paints.
5. Keyboard and screen-reader behavior stated, with native elements or a named ARIA pattern.
6. Nothing that shifts its neighbors when its content changes.

## Versions

- The system has one version number in `tokens.json`. Raise it when a token or class is removed or changes meaning; note what to change in the app.
- Additions and value tweaks that keep meaning need no version, only a line in the change note.
- The app and the landing page take the tokens as a built file. Neither edits its copy.

## Deciding

- Product rules beat taste: the principles in the overview settle most arguments.
- When a one-off is truly needed, write it in the feature's stylesheet with a comment saying why, using tokens. Three one-offs of the same kind are a component.
- Remove what is unused. A token or class with no use after a release is deleted.
