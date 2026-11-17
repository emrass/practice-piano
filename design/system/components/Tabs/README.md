# Tabs

Underlined tabs that swap the panel below them.

- **Use** to split one surface into two to four peer views: Practice and Progress in the sidebar, the sections of Piano & audio. For a setting, use SegmentedControl.
- **You provide** tab names (a noun, one to three words) and one panel per tab.
- `tablist` / `tab` / `tabpanel` with `aria-selected`; arrow keys move between tabs.
- The selected tab has a 2px `accent` underline and `text` color; the rest are `text-subtle`.
- Keep the panel height fixed to the tallest tab so the surface does not jump. `.tabs-fill` spreads tabs across the full width (sidebar).

```html
<div class="tabs" role="tablist" aria-label="Sidebar">
  <button role="tab" aria-selected="true">Practice</button>
  <button role="tab" aria-selected="false">Progress</button>
</div>
```
