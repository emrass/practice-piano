# Architecture

## Layers

```
 UI (React)            ui/App.tsx, ui/components/*, ui/notation/renderScore.ts (VexFlow)
   │  subscribes to stores, never re-renders at frame rate
 Session               ui/practice/PracticeController.ts — routes input → engine, metronome, marks
   │
 Domain (pure TS)      core/generator · core/eval · core/progress · core/music · core/settings
   │
 Ports                 persistence/{storage,identity,profileRepository}.ts
                       platform/midi/backends.ts (WebMIDI | native bridge: CoreMIDI, Android MIDI | none)
                       platform/audio/audioEngine.ts (metronome; NoteSynth hook for later)
                       input/inputBus.ts (every input source publishes NoteInput events)
```

`core/` has no DOM, React or VexFlow dependency, which is why most tests are fast Node tests.

## Styles

`src/styles` has one stylesheet per feature, imported in layers by `src/main.tsx`. They are built
on the design system in `design/` (see `design/README.md`): `design/vitePlugin.ts` compiles
`design/system/tokens.json` into `design/dist/tokens.css` whenever `vite` starts or builds and
whenever the file changes, and `main.tsx` imports it before everything else, followed by the
components (`design/system/components/bundle.css`). The React side of the components lives in
`ui/components/controls.tsx` (segmented control, tabs, choice cards, slider, switch, select,
progress bar, callout, stat), `ui/components/Dialog.tsx` and `ui/components/Icon.tsx` (the icon set,
inlined from `design/system/assets/Icons`, and the Logo); state is ARIA (`aria-checked`,
`aria-selected`, `aria-pressed`), not classes. The stage is the system's too: `MetaStrip`, `KeyboardDock` and
`PianoKeyboard` (Keyboard), `PracticeBar` (PracticeBar, BeatDots), `ResultsCard` and `ui/results`
(Results), `ChordChart`, the Progress heatmap (`ui/progress/sight.tsx`, bands from `heatBand()` in
`ui/progress/format.ts`), and the score: `ui/notation/renderScore.ts` tags each note group `.note`
and draws the labels and, under each note, an empty `.score-mark` that `drawStepMark()` fills from
the step's state (a tilde for nearly, a cross for wrong or missed), the same state `ScoreView` turns
into the note's color class. The stylesheets in `src/styles` for these hold only arrangement: the stage
grid, the score's scrolling frame, how the cursor and playhead are placed, and what the shell
changes by window size.
Every color, text
style, radius, spacing step, shadow, duration and z-index is a token; `npm run design:check`
fails on a literal color, duration or type size in `src/styles`, or on a variable that is not a
token. The theme is `data-theme` on `<html>`, set from the settings in `App.tsx`, which also sets
the theme-color meta from the `--surface-sheet` token.

## Exercise model

- **Ticks**: 4 per quarter note (1 tick = a sixteenth). Bars, beats and durations are integers.
- **Diatonic steps**: `octave * 7 + letterIndex` (C4 = 28). Melodic intervals, staff position and
  ledger lines are all natural in this space; MIDI numbers are derived with the key signature.
- `Exercise` = measures × hands of `NoteEvent`s (note / chord / rest), plus `Step`s — every
  distinct onset across both hands, which is what Wait mode advances through.
- `Exercise.id` is a content fingerprint, so "have I seen this passage?" (first-sight bonus) works
  without storing passages.

## Generator

`generateExercise(settings, seed)` is deterministic (seeded mulberry32):

1. `difficultyProfile(level)` maps 1–100 to ranges, leap limit, interval weights, rhythm
   complexity, polyphony, chromaticism, key/time pools and BPM. Levels 1–15 are a hand-written
   micro-progression (1 → 2 → 3 → 4 → 5 notes in C position); later values are interpolated
   between anchors.
2. A chord progression per 4-bar phrase (half cadence / authentic cadence).
3. Rhythm per bar from weighted cells (beat-aligned, new figures fade in over ~12 levels), with
   motif repetition and long notes at phrase ends.
4. Melody by weighted choice: steps ≫ skips ≫ leaps (decaying), chord tones on strong beats, leap
   recovery, run limits, tritone avoidance, center pull, cadential approach and tonic ending,
   occasional melodic sequence of an earlier bar.
5. Decoration: harmonic-minor leading tones, chromatic approach notes, consonant chord tones
   (span ≤ an octave), weak-spot focus weighting.
6. Hands: LH in *Both* is an accompaniment (bass role, simpler rhythm, roots on downbeats) kept
   below the RH; *Alternating* swaps hands in 1–2 bar blocks with full-bar rests.

Overrides (key, time, rhythm, polyphony, BPM) replace profile values; **hands are never derived
from difficulty**.

## Engraving

VexFlow's proportional formatter is deliberately not used. `layout.ts` computes a grid where all
measures share one width and every tick has the same width, then each `StaveNote` gets its own
`TickContext` positioned so its notehead lands exactly on `tickToX(tick)`. Consequences:

- horizontal position = musical time inside a system → constant-speed Flow playhead;
- RH and LH notes at the same tick have identical x (tested);
- the system header (clef/key/time) has a fixed width, so every system lines up.

Fingering is a row of numbers above the treble staff and below the bass staff (scales: one per
note). A chord's numbers are a stack, away from the staff, in the order of its notes; a system
has place for one row, so `fingeringRoom()` (`renderScore.ts`) asks `computeLayout` for the rows
beyond it (`SystemRoom`: above the first staff, below the last), and the chord symbols sit on top
of the stack. A bar with more than one chord symbol is at least as wide as its symbols.

Measures per line depend only on available width and the shortest note value; the score area
is a fixed-height scroller, so changing exercises never moves the controls or keyboard. The
difficulty slider previews while dragging and regenerates only on release.

## Evaluation

- **WaitEngine** — a step completes when all its notes are pressed within `graceMs` of each other,
  *or* are all held down together (sustain-held keys count when enabled). Wrong keys add to the
  error count and reset the streak without moving the cursor.
  Pitch accuracy = expected notes ÷ (expected notes + wrong presses).
- **FlowEngine** — every expected note has a due time; a key press (minus latency compensation)
  is matched to the nearest pending note of the same pitch within a tempo-scaled hit window.
  Unmatched presses are extras, expired notes are misses. Timing score: 1.0 inside the "perfect"
  window, falling linearly to 0.25 at the edge; clipped notes cost 20 % unless held by the pedal
  (when enabled).

## Latency calibration

`core/calibration/latency.ts` (pure, tested). The player taps along to 4 lead-in + 16 counted
pulses at 80 bpm. Each counted pulse is matched to its nearest tap within ±45 % of a beat (one
tap per pulse); the estimate is the **median** offset, with a robust spread (1.4826 × MAD) that
grades the run (good ≤ 20 ms, fair ≤ 40 ms, otherwise "retry"). During a run
`InputBus.capture()` routes all input to the calibration so it can't affect the exercise.

- Audible clicks → `latencyMs` (what Flow scoring subtracts from note times). It deliberately
  includes the player's own small habitual offset, as rhythm games do.
- Silent flashes → the same chain minus audio output. `audio − visual` (if above 30 ms of noise)
  becomes `playheadDelayMs`, so the playhead moves in sync with the click you actually hear.

## Piano shortcuts

`core/input/pianoShortcuts.ts`: `PianoShortcutGate` sees every input event. Once the exercise
has finished, a note-on that starts from silence (no key held) at least 600 ms after the end maps
by pitch class: C repeat, D next, E close results, F easier, G harder. A short sustain-pedal tap
starts Flow mode from the ready state.

What "repeat" and "next" mean comes from the exercise's `continuation` (`ui/lessons/types.ts`):
a label for each, `next: null` when there is nothing to move on to, and which of the two is
suggested (`primary`). The practice bar, the results card (main button and focus, so Enter), R /
N and piano C / D all read it. On the computer keyboard R sits among the black keys, so it only
restarts after a run, with the same 600 ms delay; Backspace restarts at any time
(`ui/hooks/useComputerKeyboard.ts`). `ui/lessons/continuation.ts` builds it: generated material (sight
reading, ear, rhythm, chord drills) suggests something new; fixed repertoire (scales,
progressions, inversions) suggests "Again", has no next for a specific key, and suggests the next due item in
review. Restart in Wait is off while the run is untouched (`isUntouched`, `ui/practice/session.ts`).

## Progress & gamification

`applyResult(progress, result, now)` is pure and returns the new state plus an `Award`:

- XP = notes × level multiplier × accuracy factor ((acc − 0.5)/0.5)² × Flow timing factor;
  repeats earn 40 %. The level multiplier (1 + level/50) is never capped: learners pick their
  level freely and the accuracy factor keeps sloppy runs at high levels cheap.
- First-sight bonus: +50 % (+5) on a first attempt with ≥ 90 % pitch accuracy.
- Tier mastery: N distinct passages passed at ≥ 90 % pitch accuracy.
- Stats are stored as `stats[dimension][key] → Aggregate` (attempts, correct, recent reaction
  times, timing sum). v1 records `note` (`treble:60`) and `clef`; adding `interval`,
  `accidental`, `keySignature` or `rhythm` later needs no schema change. `findWeakSpots`
  ranks notes by miss rate and slowness; weak-spot practice feeds them back into the generator.
- XP, streaks, history and tier / repertoire bookkeeping are shared (`progress.ts`); what differs
  per lesson lives in `core/progress/<lesson>.ts` behind `LessonProgressRules`
  (`core/progress/types.ts`): the pass rule, the stats a run records, and where needed replays
  (ear) or the repertoire ladder run and XP tempo. `progress.ts` looks them up in
  `PROGRESS_RULES` by the result's lesson. Each lesson's weak-spot finder sits in the same module.

## Persistence & identity (v1 → v2)

- `StorageAdapter` (async KV) — `LocalStorageAdapter` / `MemoryStorageAdapter` today; a
  Firestore / Supabase adapter can implement the same four methods.
- `IdentityProvider` — `LocalIdentityProvider` creates an anonymous `local-<uuid>` user. A
  Google-sign-in provider can implement the same interface.
- `ProfileRepository` scopes every key as `users/<userId>/…`, validates and migrates data
  (`normalizeSettings`, `normalizeProgress`, versioned backup format) and handles
  export / import / reset. On first sign-in in v2, local data can be copied to the account id.

## First-run setup

- Two guides share one dialog. `GuideDialog` (`ui/components/GuideDialog.tsx`) is the design
  system's Dialog with `.dialog-stepped`: "Setup · step x of y", the step's title and body, one
  action row (Skip, Back, the step's own way on, the way forward) and a fixed height. It knows
  nothing about pianos or levels. The parts supply their steps (`ui/components/guideSteps.tsx`):
  `useAudioSetupSteps()` (connect, or "playing without a piano", then the metronome, which is
  left out without a piano) and `useLevelSteps()` (how well you play). The step contents are in
  `AudioSetupSteps.tsx` and `LevelStep.tsx`.
- `FirstRunGuide` strings both parts into one guide: connect, metronome, level, "Start
  practicing". Skip in the piano & audio steps moves on to the level step; Skip there, Esc or ✕
  close it. `Settings.setupGuideSeen` (default `false`) decides whether it opens with the app;
  closing it by any route sets the flag. Because it is a setting, a reset or an imported backup
  without the flag shows the guide again.
- `AudioSetupGuide` is the piano & audio part alone, opened from *Setup guide* in the Piano &
  audio header. It has no Skip (✕ closes it), ends with "Done", and never shows the level step.
  The level step cannot be run again for now.
- While open, a guide takes all input with `inputBus.capture()`, like latency calibration, so
  the key played to check the connection is not scored by the exercise underneath. It steps
  aside (state kept) while the calibration dialog is open.
- `core/experience.ts` holds the five stages and, per skill (reading, ear, scales & chords), a
  list of statements with a `SettingsPatch` each. A stage is only a preset: it names one
  statement per skill. `experiencePatch()` merges the three patches; the chosen statements are
  saved as `Settings.experience` (only when the player picked something), for a future profile
  view. Tests check that every
  level is the first level of a tier and that every combination is a valid `Settings`.
- Connection texts and buttons are shared with Piano & audio (`ConnectionStatus` in
  `ui/components/MidiConnect.tsx`, `midiStatus.ts`); both dialogs take input with
  `useHeardNote()` (`ui/hooks/useHeardNote.ts`).

## Piano & audio

- `PianoAudioDialog` holds the settings every lesson shares, one tab each: Piano (connection,
  device, keyboard size), Audio & timing (calibration, latency, metronome, count-in) and Playing
  (sustain scoring, chord grace, piano shortcuts, key sound). It always opens on Piano, has a
  fixed height so switching tabs doesn't resize it, and keeps *Setup guide…* in the header so it
  is reachable from every tab. The latency presets live only in the setup guide; here the
  calibration result sits next to its button, above the sliders. The connection check ("We hear
  you") is its input check; held keys and the pedal show in the keyboard bar. It is not a
  sidebar tab: the sidebar is only about the current lesson (Exercise, Progress).
- The top-bar piano chip always opens it, connected or not; without a piano it shows the same
  connection help as the guide's first step. Like the guide, it captures input while open and
  steps aside (state kept) while the calibration dialog is on top.

Lesson logic never touches storage or identity directly — the UI passes plain objects in and
gets plain objects back.

### Keeping local data (web)

- `platform/storageProtection.ts` asks `navigator.storage.persist()` once per session, after a
  finished exercise (Firefox shows a permission pop-up; other browsers decide silently, so it is
  never asked while the page loads). *Your data* (top bar) shows whether the browser agreed. In an
  iPad/iPhone browser tab it explains WebKit's 7-day deletion and how to move to a Home Screen app,
  which is exempt but has its own, empty storage (Export → Import); there, and where storage is
  unavailable, the Progress tab also shows a note that opens Your data.
- `pwa/vitePwa.ts` (website build only — not `vite dev`, not `--mode native` or `--mode android`) adds the web app
  manifest, icons (`pwa/icons/`, rendered from the keys logo by `scripts/pwa-icons.ts` with the native app icon), the
  iOS home-screen tags and `sw.js` from `pwa/sw.js`. The worker precaches every file of the build
  under a content hash, so the app opens offline after one visit. The page itself is loaded
  network-first (revalidated past the HTTP cache, cached copy after 3 s or offline), so a launch
  after a deploy opens the new version; the hashed files are served cache-first.
- `platform/serviceWorker.ts` registers the worker and looks for a new version whenever the app
  comes back to the foreground (an installed iPad app is resumed, not relaunched). When a new
  worker takes over and the page runs other files than its build, the page reloads, but only
  while it is visible and App's reload guard says nothing is lost: no dialog open and the session
  `isIdle` (`ui/practice/session.ts`: no count-in, moving Flow/rhythm run, played-in Wait run or
  heard ear phrase). Otherwise it waits for the next return. `e2e/pwa.spec.ts` checks offline use
  against a production build (`vite preview`), and updates against two builds it serves itself
  (`dist-e2e`, `dist-e2e-next` from `e2e/next-build.config.ts`).

## Ear training

- `core/ear/tiers.ts`, `core/ear/generator.ts` — `earProfile(level)` maps 1–100 to phrase length,
  range, leap limit, keys, content (melody / dyads / triads / mixed), whether the first note is
  shown and whether an I–IV–V–I cadence sets the key. `generateEarExercise` returns a normal
  `Exercise` (quarter notes, chords as halves, last note fills the bar) plus a playback timeline.
- `ui/practice/EarController.ts` implements the shared `Session` interface on top of
  `WaitEngine`: input is ignored while the phrase plays; found steps become visible
  (`visibleSteps`), `hint()` marks the step as assisted (it no longer counts as correct).
- `platform/audio/audioEngine.ts` gained a small synthesized piano voice (`simplePiano`) and
  `playSequence()` with a stop handle (replay cancels the previous playback).
- Results carry `lesson: 'ear'`, `replays`, `hints`; progress records `interval` / `harmony`
  stats instead of reading stats, ear tiers have their own mastery and XP ceiling, and each
  replay scales XP by 1 / (1 + 0.2 × replays).

## Rhythm

- `core/generator/rhythm.ts` is the shared **figure library**: every cell (e.g. `6,2` = dotted
  quarter + eighth) has a key (`figureKey`) and a name. `barRhythmCells` keeps the figures, so
  generated `NoteEvent`s carry `figure` — in sight reading and in Rhythm mode alike. Options can
  feature weak figures (`focusFigures`) or replace the complexity ramp with an explicit
  curriculum (`figureWeight`).
- `core/rhythm/tiers.ts`, `core/rhythm/generator.ts` — `rhythmProfile(level)` (figure intro
  levels, meter pool, tempo, Echo length, Pulse pattern, texture pool) and
  `generateRhythmExercise` → `RhythmExercise` (= `Exercise` + `rhythm: {task, texture, keys,
  callBars, mutedBars}`). Pitches are the designated keys, so steps, scoring and rendering work
  unchanged. Textures: unison, LH/RH pulse, interlocking (one rhythm distributed between the
  hands, rests re-spelled by `restSlots`), polyrhythms (forced 3/4).
- `core/rhythm/analysis.ts` annotates judged notes with figure, beat position and silent-bar
  flag, and computes tendency (mean offset), steadiness (SD), Pulse drift and per-hand rates.
- `ui/practice/RhythmController.ts` implements `Session` on top of `FlowEngine`
  (`judgeReleases: false`): only designated keys reach the engine (others just flash); Echo
  plays the call bars with `playSequence`, judges only response steps, ignores tapping along and
  reveals bars via `visibleBars`; Pulse mutes metronome beats (`MetronomePlan.muted`) and hides
  the playhead, beat dots and key guide in silent bars.
- Rendering: `renderScore` draws rhythm exercises on one-line percussion staves (lines hidden
  with `setConfigForLines`, all notes on `b/4`, stems up) and wraps each measure in a
  `data-measure` group for Echo's reveal.
- Progress (`core/progress/rhythm.ts`): the pass rule adds timing (≥ 70 %); stats `rhythmFigure`,
  `beatPosition`, `rhythmHand`, `rhythmTexture` keep signed offsets (`offsetSum`,
  `offsetSqSum`) for tendency / steadiness; `findWeakFigures` drives weak-spot practice in both
  lessons. Sight reading records figures in Flow mode only (Wait mode has no timing).

## Scales & arpeggios (fixed repertoire)

- `core/scales/catalog.ts` — every type as degrees `(letter steps, semitones)` relative to the key
  tonic, so spelling is always right (F𝄪 in G♯ harmonic minor, B♭♭ where needed); separate
  descending degrees for melodic minor and blues; item ids `type/tonic/hands`.
- `core/scales/fingering.ts` — standard patterns per degree with first/last overrides, chromatic
  rule, `crossingAt()` (thumb under / finger over).
- `core/scales/generator.ts` — `ScaleExercise` (= `Exercise` + `scale` info): up and down in
  the chosen octaves, per-hand registers chosen for readable staves, triad arpeggios in 3/4 or
  6/8, events carry `fingers`. Tempo comes from the ladder in notes per minute.
- `core/scales/analysis.ts` — clean-run rule, steadiness, velocity spread and thumb accents,
  hand sync, timing bumps grouped by place in the octave cycle. `FlowEngine` now records key
  velocity and merges duplicate keys in a step (contrary-motion unison).
- `core/repertoire/repertoire.ts` — pure ladder + Leitner review shared by scales and chords
  (`applyRepertoireRun`, `dueItems`, `setLadder`, `normalizeRepertoire`). Tempo is in the
  lesson's unit (`ladderTempo`: notes per minute for scales, bpm for chords); a `LadderRun`
  carries the run's tempo, goal and the step size (4 bpm × notes per beat), and may say itself
  when a run is `messy` (moves the ladder down) instead of the ladder's 90 % rule: a sequence of
  inversions has seven chords and counts misses.
  `ProgressState.repertoire` stores it; the lesson's progress rules (`ladderRun`) map its result
  onto it. Repertoire lessons (`LESSONS.x.repertoire`) skip level tiers and first-sight logic in
  `computeAward`/`applyResult`.
- UI: the sight-reading `PracticeController` is reused (Wait / Flow) with a `decorate` hook that
  turns the raw result into a scale result; `ScalesPanel` (picker, ladder, review, display),
  fingering rows in `renderScore`, `MemoryCard` for playing from memory. The layout now fills
  lines for odd bar counts.

## Chords & progressions (fixed repertoire)

- `core/chords/catalog.ts` — chord qualities, sets, the progression library, and the three kinds
  of `ChordItem` with their ids: `drill`, `progression` and `sequence` (the Inversions task: one
  chord through its inversions, `chords/seq/<chord>/<key>/<hands or chart>`).
- `core/chords/generator.ts` — `ChordExercise` (= `Exercise` + `chords` info). Every `ChordTarget`
  has its own onset `tick`: one per bar in drills and progressions, every half bar in a sequence
  (`beatsPerChord`). A sequence is placed per hand where it needs the fewest ledger lines and fits
  the player's keyboard (`opts.keyboard`), and its events carry `fingers` (one per note of the chord).
- `core/chords/engine.ts` — `ChordWaitEngine`, and `ChordFlowEngine`, which judges each chord
  against its own tick; the timing windows scale with the shortest gap between two chords.
- `core/chords/analysis.ts` — the result summary: `clean` and `messy` (what moves the tempo
  ladder; a share of the chords, or a count of misses in a sequence), and the chords to look at
  (with the `leg` of a sequence: going up, at the top, going down).
- UI: `ChordController` (Wait / Flow), `ChordsPanel`, `ChordChart` for everything shown as symbols.

## Extending with new lesson types

A lesson is a set of modules, one of each kind, and App.tsx only picks the active one:

- **Core** — an entry in `core/lessons.ts` (tiers, or `repertoire: true`), a generator producing an
  `Exercise` (scales, chords and rhythm drills fit the same measures/steps model), and analysis
  that turns the engine's `RawResult` into the lesson's variant of the `ExerciseResult` union
  (`lesson: 'chords'` plus its required `chords` summary; add a variant for a new lesson).
- **Progress rules** — `core/progress/<lesson>.ts` exports the lesson's `LessonProgressRules`
  (typed on its result variant): `isPass`, `recordObservations` (the stats dimensions it fills;
  add new ones to `StatDimension`), and for a repertoire lesson `ladderRun` and `tempoRatio`;
  add it to `PROGRESS_RULES` in `progress.ts`. Weak-spot finders for the lesson hook and the
  Progress tab live in the same module.
- **Settings** — a group in `core/settings.ts` (`settings.<lesson>`, validated by a
  `normalize<Lesson>` function); shared settings (display, audio, input) stay at the top level;
  the keyboard's display settings are switched in the bar above the keys
  (`ui/components/KeyboardControls.tsx`), not in the lesson panels.
  Changes go through `applySettingsPatch`, which merges lesson groups field by field
  (`update({ chords: { mode: 'flow' } })`).
- **Session** — a controller extending `SessionBase` (`ui/practice/sessionBase.ts`: state store
  and finished event, input subscription, self-clearing flashes, frame loop, metronome and
  count-in, `StepMarks`), usually a thin layer over `WaitEngine` / `FlowEngine` or the lesson's
  own engines. Its state keeps two kinds of keys for the keyboard: `expected` (what the keyboard
  guide lights while it is on) and `revealed` (shown whatever the setting: a hint asked for, a
  note the exercise gives). Wait sessions that offer a hint implement `hint()` and keep
  `state.hint` (count, and `nudge` when the player looks stuck).
- **Lesson hook** — `ui/lessons/<lesson>.tsx` returns a `LessonRuntime` (`ui/lessons/types.ts`): the
  current exercise and its session, `next` / `step` (easier / harder), its `continuation` (how to
  go on after a run, see Piano shortcuts), how it reacts to settings
  changes (`onPatch`), its settings panel, an optional stage that replaces the score (chord chart,
  play from memory), the Wait / Flow switch, keyboard span and mappings (and which keyboard
  display settings don't apply, grayed out in the bar above the keys), review and weak-spot
  actions for the Progress tab. Shared pieces live in `ui/lessons/shared.ts` (weak-spot focus,
  review queue and manual tempo ladder for repertoire lessons, the session options, and
  `useBuiltFor`, whose key lists the fields that make a new exercise or session). `useLesson` in
  `ui/lessons/index.ts` runs every lesson's hook (hooks can't be conditional); only the active one
  builds an exercise.
- **Results and Progress** — a `ResultsView` in `ui/results/` (ribbon, headline, measurements) and
  a `ProgressView` in `ui/progress/` (summary tile labels, the lesson's section).

The renderer, keyboard, input, piano shortcuts, persistence and progress bookkeeping (XP, streaks,
history, tier mastery) are shared.
