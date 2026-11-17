# Agent instructions

- Use American English everywhere: UI text, code, comments, tests and docs ("practice", "color", "center", "canceled", "normalize"), never British spelling.

## UI and design

The design system in `design/` is the source of truth for how the app looks, behaves and reads.
Read `design/README.md` and `design/system/README.md` before changing UI.

- Use tokens (`var(--…)`) for every color, type size, spacing step, radius, shadow and duration.
  Do not add literal values; if no token fits, add one in `design/system/tokens.json` with a
  usage note.
- Use an existing component from `design/system/components` before writing new CSS. Its README
  says when to use it and what it needs. A new or changed component gets its styles, README and
  preview in `design/system` in the same change.
- Fix gaps in the system itself, never around it in `src/styles`.
- Never signal a state by color alone: add a shape, mark, position or word. Drive state from
  ARIA attributes where one exists.
- Nothing but the score may move when values change. Never loosen or skip a layout test to make
  a change pass; if a size changes on purpose, update the test and say so.
- UI text follows `design/system/guides/01-writing.md`: sentence case, no em dashes, a unit on
  every number, no emoji or Unicode symbols as icons.
- Check UI changes in both themes, at tablet-landscape, laptop and phone widths.
- After changing anything in `design/system`, say so in the pull request: the published
  reference has to be republished.
- `src/styles` is still moving onto the system (`design/system/guides/05-adoption.md`). Follow
  these rules for new work; do not restyle untouched code in passing.
