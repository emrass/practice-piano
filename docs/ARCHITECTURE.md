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
                       platform/midi/backends.ts (WebMIDI | CoreMIDI bridge | none)
                       platform/audio/audioEngine.ts (metronome; NoteSynth hook for later)
                       input/inputBus.ts (every input source publishes NoteInput events)
```

`core/` has no DOM, React or VexFlow dependency, which is why most tests are fast Node tests.

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
   recovery, run limits, tritone avoidance, centre pull, cadential approach and tonic ending,
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
by pitch class: C retry, D next, E close results, F easier, G harder. A short sustain-pedal tap
starts Flow mode from the ready state.

## Progress & gamification

`applyResult(progress, result, now)` is pure and returns the new state plus an `Award`:

- XP = notes × level multiplier × accuracy factor ((acc − 0.5)/0.5)² × Flow timing factor;
  repeats earn 40 %; the level multiplier is capped at the top of the second tier above the
  highest mastered one.
- First-sight bonus: +50 % (+5) on a first attempt with ≥ 90 % pitch accuracy.
- Tier mastery: N distinct passages passed at ≥ 90 % pitch accuracy.
- Stats are stored as `stats[dimension][key] → Aggregate` (attempts, correct, recent reaction
  times, timing sum). v1 records `note` (`treble:60`) and `clef`; adding `interval`,
  `accidental`, `keySignature` or `rhythm` later needs no schema change. `findWeakSpots`
  ranks notes by miss rate and slowness; weak-spot practice feeds them back into the generator.

## Persistence & identity (v1 → v2)

- `StorageAdapter` (async KV) — `LocalStorageAdapter` / `MemoryStorageAdapter` today; a
  Firestore / Supabase adapter can implement the same four methods.
- `IdentityProvider` — `LocalIdentityProvider` creates an anonymous `local-<uuid>` user. A
  Google-sign-in provider can implement the same interface.
- `ProfileRepository` scopes every key as `users/<userId>/…`, validates and migrates data
  (`normalizeSettings`, `normalizeProgress`, versioned backup format) and handles
  export / import / reset. On first sign-in in v2, local data can be copied to the account id.

Lesson logic never touches storage or identity directly — the UI passes plain objects in and
gets plain objects back.

## Ear training

- `core/ear/tiers.ts`, `core/ear/generator.ts` — `earProfile(level)` maps 1–100 to phrase length,
  range, leap limit, keys, content (melody / dyads / triads / mixed), whether the first note is
  shown and whether an I–IV–V–I cadence sets the key. `generateEarExercise` returns a normal
  `Exercise` (quarter notes, chords as halves, last note fills the bar) plus a playback timeline.
- `ui/practice/EarController.ts` implements the shared `Session` interface on top of
  `WaitEngine`: input is ignored while the phrase plays; found steps become visible
  (`visibleSteps`), `hint()` marks the step as assisted (it no longer counts as correct).
- `platform/audio/audioEngine.ts` gained a small synthesised piano voice (`simplePiano`) and
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
- Progress: `isPass` adds the timing rule for rhythm (≥ 70 %); stats `rhythmFigure`,
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
  carries the run's tempo, goal and the step size (4 bpm × notes per beat).
  `ProgressState.repertoire` stores it; `ladderRun(result)` in progress.ts maps a lesson's result
  onto it. Repertoire lessons (`LESSONS.x.repertoire`) skip level tiers and first-sight logic in
  `computeAward`/`applyResult`.
- UI: the sight-reading `PracticeController` is reused (Wait / Flow) with a `decorate` hook that
  turns the raw result into a scale result; `ScalesPanel` (picker, ladder, review, display),
  fingering rows in `renderScore`, `MemoryCard` for playing from memory. The layout now fills
  lines for odd bar counts.

## Extending with new lesson types

A lesson type needs (1) an entry in `core/lessons.ts` with its tier list, (2) a generator producing
an `Exercise` (scales, chord progressions and rhythm drills fit the same measures/steps model),
and (3) a controller implementing `ui/practice/session.ts` (usually a thin layer over
`WaitEngine` or `FlowEngine`) plus a settings panel. Its settings get their own group in
`core/settings.ts` (`settings.<lesson>`, validated by a `normalize<Lesson>` function); shared
settings (display, audio, input) stay at the top level. Changes go through
`applySettingsPatch`, which merges lesson groups field by field
(`update({ chords: { mode: 'flow' } })`). Controllers extend `SessionBase`
(`ui/practice/sessionBase.ts`), which holds the shared plumbing: state store and finished
event, input subscription, self-clearing flashes, the frame loop, metronome and count-in
(`startCountIn` / `showCountIn`), and `StepMarks` for Flow step marks. The renderer, keyboard, input, piano
shortcuts, results, persistence and progress are shared.
