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

## Extending with new lesson types

A lesson type needs (1) an entry in `core/lessons.ts` with its tier list, (2) a generator producing
an `Exercise` (scales, chord progressions and rhythm drills fit the same measures/steps model),
and (3) a controller implementing `ui/practice/session.ts` (usually a thin layer over
`WaitEngine` or `FlowEngine`) plus a settings panel. The renderer, keyboard, input, piano
shortcuts, results, persistence and progress are shared.
