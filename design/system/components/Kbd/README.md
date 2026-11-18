# Kbd

A keycap for a shortcut: a computer key in running text or after a button label, or a piano key beside the action it plays.

- **Use** wherever a shortcut exists: the cap after the label is how players learn it.
- **You provide** the key as printed on the keyboard: `Space`, `N`, `?`, `Esc`. One cap per key; join a combination with a plus sign between caps.
- Inside a filled button the cap goes transparent with a border in the label color.
- Below `bp-sm` caps inside buttons are hidden: a phone has no keys.
- **Piano key** (`.kbd-piano`): the small white key with a note name, for an action played on the piano ("C" for Restart). It is built from the `key-*` tokens, so it is a white key in both themes, like the keyboard. You provide the note name without an octave: the shortcut works in every octave. Use it in the shortcuts row of Results and wherever a piano shortcut is spelled out; never inside a button.
