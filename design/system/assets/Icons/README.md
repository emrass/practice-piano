# Icons

Nineteen line icons drawn for the app on a 20-unit grid: 1.5 stroke, round caps and joins, solid fills only for parts that mean "on" or "earned". They replace the Unicode symbols the app used as icons.

- The files carry one fixed ink, `sepia-450` (`#8b7f71`), so they show on both themes when placed with `<img>`. In the product, inline the SVG and let it take `currentColor`; the Icon component has the markup.
- Render at 16px inside controls (`size-icon`) and 20px standing alone (`size-icon-lg`). Do not scale the stroke.
- `guide` / `guide-on` and `sound-on` / `sound-off` are pairs: a toggle swaps the drawing as well as the color.
- `star` is mastery, `streak` is the daily streak. Neither is used for anything else.
- `database` is Your data (backup, restore, erase) and nothing else; in the top bar it sits beside its label wherever the label fits.
