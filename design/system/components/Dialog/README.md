# Dialog

A modal surface for a task that has to be finished or left: setup, Piano & audio, Your data, calibration, a destructive confirmation.

- **Use** sparingly. Practice never happens in a dialog, and results are a card over the score, not a dialog.
- **You provide** a title that names the task ("Connect your piano"), the body, and the actions. An optional eyebrow shows the step ("Step 2 of 4").
- Structure: `.dialog-head` (title left, close right), `.dialog-body` (scrolls if it must), `.dialog-actions` (right-aligned; the way forward last and `primary`; a ghost way out pushed to the far left). A head that holds more than the close button groups its buttons in `.dialog-head-actions`.
- With tabs, add `.dialog-tabbed`: the Tabs sit between head and body, the dialog is 560px wide and takes the height of its tallest tab.
- With steps (a guide), add `.dialog-stepped`: the dialog is 560px tall, the eyebrow counts the steps, and a step taller than that scrolls in `.dialog-body`. One action row for every step: a ghost Skip at the far left, Back, then the step's own way on and the way forward. A step that reveals more below what was tapped scrolls it into view.
- Behavior: focus moves into the dialog and is trapped; Esc and the close button leave it; focus returns to the control that opened it. `role="dialog"`, `aria-modal="true"`, labeled by its title.
- Width up to 520px (560px with tabs). **Fix the height** of a dialog with tabs or steps to its tallest state so it never resizes mid-task.
- Below 600px a dialog with `.is-sheet` on its scrim fills the screen, edge to edge, padded by the safe-area insets. Below 480px the actions stack, the way forward on top.
- One dialog at a time. A confirmation replaces the content; it does not stack on top. Its question becomes the title ("Erase all progress and settings?"), the body says what is lost, and the actions are Cancel and the danger button that names the act ("Erase everything").
