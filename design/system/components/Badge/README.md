# Badge

One or two words of state, as a pill. The tag is its square cousin for note names.

| Tone | Class | Means |
|---|---|---|
| Neutral | `.badge` | A fact with no judgment: "Second try". |
| Accent | `.badge-accent` | What this exercise is about: "Focus: F♯". |
| Reward | `.badge-reward` | Something earned or at stake: "First sight". |
| Mastered | `.badge-mastered` | Solid gold, with the star. Mastery only. |
| Success / warning / danger | `.badge-success` … | A judgment of the last note: Perfect, Good, Early, Late, Missed. |

- **You provide** the words. The word carries the meaning; the tone repeats it. Never a bare colored pill.
- A badge that comes and goes keeps its box: give it a fixed width and hide it with `.is-hidden` (`visibility`), so the row does not shift.
- `.tag` shows a held note name (E3); `.tag-sustained` marks one held only by the pedal.
- Not interactive. Something to press is a Button or a Chip.
