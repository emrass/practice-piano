# Accessibility

The target is WCAG 2.2 level AA. The context raises the bar in two places: the screen is far away, and the player's hands are full.

## Contrast

- Text: at least 4.5:1 on the surfaces its token names, in both themes. Large text (24px and up, or 19px bold) at least 3:1.
- Things that carry meaning without words (control edges, focus rings, icons, noteheads, the cursor): at least 3:1.
- These hold today for every token pair the components use. Check a new pair before using it; do not pick colors by eye.
- Known limits: `reward` gold is a graphic color only in the light theme (3.2 to 3.5:1); `text-subtle` is not for `surface-canvas`; heat bands are told apart by the legend and the list beside them, not by contrast.

## Color is never the only cue

| Meaning | Color | Second cue |
|---|---|---|
| Selected option | `accent` tint or raised card | thumb shape, radio mark, underline |
| Switch on | `accent` track | knob position |
| Piano connected | `success` dot | filled against hollow, and the device name |
| Note right, nearly, wrong, missed | `score-good`, `score-ok`, `score-bad` | nothing, a tilde, a cross, a cross and faded |
| Key to play, wrong key | gold tint, carmine tint | a dot, a cross and a shake |
| Run passed | `success` ribbon | a check and the words |
| Mastered | gold | the star and the word |
| Early, late | `warning` badge | the word and the milliseconds |

Success leans blue and danger is carmine so the pair stays apart for the common forms of color blindness. Test new states in grayscale.

## Keyboard and focus

- Everything works without a pointer. Tab order follows the screen: top bar, sidebar, stage.
- Focus is always visible: 2px `focus-ring`, 2px offset; `keyboard-accent` on the piano case. Never remove an outline without replacing it.
- Use the native element first (`button`, `select`, `input type="range"`, `details`), then ARIA patterns: `radiogroup`, `tablist`, `switch`, `dialog`.
- Dialogs trap focus, close on Esc, and return focus to their opener. Popovers close on Esc and on focus leaving.
- Shortcuts are single keys because the hands are on a piano: Space, N, R, Backspace, ?. They are off while a text field or select has focus, and every one is shown as a keycap on its button.
- No shortcut acts mid-run from the note rows of the computer-keyboard piano (Q to P, A to '): a missed note must never end a run. R restarts only after a run; Backspace (Delete on Apple keyboards) restarts at any time.
- The same actions can be played on marked piano keys after a run.

## Touch

- Targets are at least 44 by 44px on coarse pointers (`size-target-min`), reached with a hit area rather than a bigger control. At least 8px between neighboring targets.
- Nothing needs a drag, a long press or two fingers that a tap cannot also do, except playing the on-screen keys.

## Screen readers

- The practice-bar message is a live region (`role="status"`). Announce outcomes there, briefly; do not announce every note.
- Icons are `aria-hidden`; icon buttons have an `aria-label` that says what pressing does.
- Pictures of data (heat strip, beat dots, the score) carry a text alternative that states the takeaway.
- Hidden-but-reserved elements (`visibility: hidden`) are also `aria-hidden`.

## Motion and sound

- Honor `prefers-reduced-motion`: drop transitions and the shake; keep the playhead, cursor and beat dots.
- Nothing flashes more than three times a second.
- Sound never starts on its own. The metronome and key sound each have a visible control and a visual twin (beat dots, key tints).

## Text size and reflow

- Type is in rem. The layout holds at 200% browser zoom and reflows at 320px wide without horizontal scrolling of the page.
- Text never truncates a number. Sentences wrap; names truncate with an ellipsis and a `title`.

## Before shipping a screen

1. Tab through it. Is focus always visible, and is the order sensible?
2. View it in the dark theme and in grayscale.
3. Read it from two arm's lengths. Can you tell what to do next?
4. Drag every slider and switch every option. Did anything else move?
5. Turn on reduced motion. Is every state still clear?
6. Use it with touch on a tablet at the piano.
