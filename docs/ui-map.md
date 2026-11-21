# UI map

Names for the parts of the screen, so issues, pull requests and conversations mean the same thing
by "the meta strip" or "the practice bar". The area names come from the layout guide
([design/system/guides/02-layout.md](../design/system/guides/02-layout.md)), which stays the
source for their sizes and rules. This page adds names for the parts inside them.

The images are taken from the real app (sight reading, Wait mode, a few notes in, 1440 × 900 px)
by `scripts/screenshots/ui-map.spec.ts`. Retake them after a layout change:

```bash
npm run ui-map       # → docs/ui-map/*.png
```

If you add, rename or remove a part, change the list in the script and the tables below together.

## Areas

![The app with its areas outlined: top bar, sidebar, and the stage with the meta strip, score, practice bar and keyboard](ui-map/ui-map-areas.png)

| Area | What it is | Code |
|---|---|---|
| **Top bar** | The strip across the top, on every screen. | `TopBar.tsx`, `.topbar` |
| **Sidebar** | The panel on the left: settings for the lesson and progress. Below 1080 px wide it becomes the **drawer**, opened from the top bar. | `App.tsx`, `.sidebar` |
| **Stage** | Everything right of the sidebar. It holds four cards, top to bottom. | `App.tsx`, `.stage` |
| **Meta strip** | First card: what this exercise is. | `MetaStrip.tsx`, `.meta-strip` |
| **Score** | Second card, the only one that grows: the music to play. | `ScoreView.tsx`, `.stage > .score` |
| **Practice bar** | Third card: buttons and live feedback for the current run. | `PracticeBar.tsx`, `.practice-bar` |
| **Keyboard** | Fourth card: the on-screen piano and its tools. | `KeyboardDock.tsx`, `.stage > .keyboard` |

## Parts

![The same screen with 22 numbered parts and a legend](ui-map/ui-map-parts.png)

| # | Part | What it is | Code |
|---|---|---|---|
| | **Top bar** | | |
| 1 | Logo | The wordmark; only the mark stays below 1280 px. | `Logo` in `Icon.tsx` |
| 2 | Today switch | Today (the plan) or Free practice (pick a lesson). | `.topbar-way` |
| 3 | Lesson switcher | Sight, Ear, Rhythm, Scales, Chords. | `.topbar-lesson` |
| 4 | Mode switch | Wait or Flow, for lessons that have both. | `.topbar-mode` |
| 5 | Streak chip | Days in a row with practice. | `.chip-streak` |
| 6 | XP chip | Experience points. | `.chip-xp` |
| 7 | Piano chip | MIDI status and the piano's name; opens the Piano & audio dialog. | `.chip-midi` |
| 8 | Theme toggle | Light or dark. | `.topbar-right .icon-btn` |
| | **Sidebar** | | |
| 9 | Sidebar tabs | Exercise and Progress (Plan and Progress on the plan page, This block and Progress while a block is played). | `Tabs` in `App.tsx` |
| 10 | Exercise panel | The lesson's settings: difficulty, hands, length and so on. One per lesson. | `ExercisePanel.tsx`, `EarPanel.tsx`, `RhythmPanel.tsx`, `ScalesPanel.tsx`, `ChordsPanel.tsx` |
| | **Meta strip** | | |
| 11 | Level and tier | The level number and the tier's name (or the scale or chord title). | `.meta-lead` |
| 12 | Exercise stats | Key, time, tempo, length, hands, rhythm. | `.meta-strip > .stat` |
| 13 | Badges | First sight, weak-spot focus. | `.meta-badges` |
| | **Score** | | |
| 14 | Staff | The engraved exercise, with note names when they are on. | `.score-host` |
| 15 | Cursor | The step to play now, in Wait mode. | `.score-cursor` |
| | **Practice bar** | | |
| 16 | Practice actions | Start or Stop, Hint, Restart, New exercise, Results. | `.practice-actions` |
| 17 | Beat dots | Count-in and the beat in Flow mode. | `.beat-dots` |
| 18 | Practice message | What to do now, and the grade after a run. | `.practice-message` |
| 19 | Practice stats | Live numbers for this run: accuracy, wrong notes, streak. | `.practice-stats` |
| | **Keyboard** | | |
| 20 | Input monitor | Sustain pedal and the notes held right now. | `InputMonitor.tsx` |
| 21 | Keyboard tools | Range, keyboard guide, keyboard display menu, key sound. | `KeyboardControls.tsx` |
| 22 | Keys | The on-screen piano. Guide keys light up the notes to play. | `PianoKeyboard.tsx`, `.keys` |

## Not in the picture

| Name | What it is | Code |
|---|---|---|
| Drawer | The sidebar below 1080 px wide, and at every width while a block of Today's practice is played, over the stage with a scrim behind it. | `.sidebar.is-open` |
| Drawer toggle | The menu button at the right end of the top bar, wherever the sidebar is a drawer. | `.drawer-toggle` |
| Plan page | Today's practice in the stage's place: the blocks with their reasons, the way on, and the summary once the plan is played. | `PlanPage.tsx`, `.plan-page` |
| Plan list | The blocks on the plan page, one row each. The block that is next is outlined and has the Start button. | `.plan-list` |
| Plan panel | The sidebar's first tab on the plan page: the plan's length and the lessons it draws from. | `PlanPanel.tsx` |
| Plan steps | The blocks in the top bar while one is played, in the lesson switcher's place: done, under way with a dot per run, to come. | `PlanSteps.tsx`, `.plan-steps` |
| Plan button | The way back to the plan page, before the plan steps. | `.topbar-plan .btn` |
| Progress panel | The sidebar's Progress tab: XP, mastery, streaks, heatmaps. | `ProgressPanel.tsx` |
| Playhead | The line that moves through the score in Flow mode. | `.score-playhead` |
| Results card | The card over the score after a run: verdict, numbers, piano shortcuts, actions. | `ResultsCard.tsx`, `.results` |
| Keyboard display menu | The popover from the keyboard tools: note names on the keys, computer-key hints, keyboard view. | `.keyboard-popover` |
| Piano & audio dialog | Piano connection, latency, metronome and scoring, opened from the piano chip. | `PianoAudioDialog.tsx` |
| Setup guide | The first-run dialog: connect a piano, calibrate, pick a starting stage. | `GuideDialog.tsx` |
