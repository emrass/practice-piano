# practice-piano.com

An interactive **sight-reading, ear-training, rhythm and scales studio** for your digital piano. It generates
fresh, musical passages for any level from "first note ever" to advanced, engraves them with
VexFlow, listens to your piano over MIDI and scores pitch, timing and reaction time.

Lessons:

- **Sight reading** — read and play generated passages (Wait or Flow mode).
- **Ear training** — listen to a phrase played by the built-in piano sound and play it back;
  the notes appear on the staff as you find them.
- **Rhythm** — rhythms without pitch on one designated key per hand: read them, echo them
  back, or keep the pulse while the metronome falls silent. With both hands it trains hand
  independence.
- **Scales & arpeggios** — a fixed repertoire with standard fingering, a tempo ladder per item
  and spaced review.

The didactic concept behind the lessons (and the planned ones) is in
[docs/DIDACTICS.md](docs/DIDACTICS.md).

It runs in two ways:

| | Desktop browser | iPadOS / macOS app |
|---|---|---|
| MIDI | Web MIDI (Chrome / Edge) — USB and macOS-paired Bluetooth MIDI | CoreMIDI — USB, Bluetooth LE MIDI, network |
| Bluetooth pairing | via macOS *Audio MIDI Setup* | **in-app** “Pair Bluetooth MIDI…” button |
| Install | none — open the site | build with Xcode, free Apple ID |

No account, no backend: everything is stored locally, with JSON export / import / reset.

## Quick start (web)

```bash
npm install
npm run dev          # http://localhost:5173 — open in Chrome, allow MIDI
```

No piano nearby? Every exercise can be played with the **on-screen keyboard** (mouse/touch)
or the **computer keyboard** (`A`–`'` white keys, `W E T Y U O P` black keys, `Z`/`X` octave,
`Shift` = sustain pedal).

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest unit + integration tests |
| `npm run typecheck` | `tsc -b` (strict) |
| `npm run lint` | ESLint (typescript-eslint, react-hooks) |
| `npm run build` | type-check + production build → `dist/` |
| `npm run build:native` | production build into `native/PracticePiano/Web` |
| `npm run check` | all of the above, in order |

## iPadOS & macOS app

See **[docs/NATIVE.md](docs/NATIVE.md)**. In short:

1. `npm install`
2. Open `native/PracticePiano.xcodeproj` in Xcode 16 or later.
3. *Signing & Capabilities* → Team → your (free) Personal Team.
4. Choose your iPad, or **My Mac (Mac Catalyst)**, and press Run.

The Xcode build runs `npm run build:native` itself and embeds the result, so the app always
contains the current web code.

## Features

- **Generator (levels 1–100)** — micro-steps for absolute beginners (one note → C D E →
  five-finger C position), then wider ranges, key signatures (incl. minor), 3/4 2/4 6/8, eighths,
  dotted rhythms, sixteenths, syncopation, dyads → 4-note chords and chromatic notes. Passages are
  built on a chord progression with phrase cadences, stepwise motion, leap recovery, motif
  repetition and a final tonic, so they sound like music, not random notes.
- **Controls** — Hands (RH / LH / Alternating / Both; never changed by the difficulty slider),
  4 / 8 / 16 bars, overrides for key, time, rhythm complexity, max notes per hand and tempo,
  keyboard size (49 / 61 / 73 / 76 / 88).
- **Engraving** — VexFlow single staff or grand staff, uniform measure widths and a linear time
  axis (both hands align exactly), optional note-name labels, light / dark themes, automatic zoom
  for short pieces.
- **Wait mode** — the cursor waits for the right notes; chords may be rolled within a
  configurable grace window (75 ms default); wrong notes are penalised but don't advance.
- **Flow mode** — count-in with beat lights and clicks, a smooth constant-speed playhead,
  pitch + timing scoring with latency compensation, `Space` (or a sustain-pedal tap) to start / stop.
- **Latency calibration** — tap along with a click on your piano to measure your exact setup
  (Bluetooth MIDI, Bluetooth audio, speakers); an optional silent pass with a flashing circle
  separates out how late you *hear* the click, which sets the playhead delay. Quick presets
  (*device speakers* ~15 ms, *headphones on the piano* ~180 ms) and manual sliders remain.
- **Piano shortcuts** — after an exercise, play C to retry, D for the next exercise, E to close
  the results, F for one level easier, G for one level harder (any octave; ignored until all keys
  are released, so final notes never trigger them).
- **Sustain pedal** — CC 64 indicator, and an option to count pedalled notes as held.
- **Ear training (levels 1–100)** — two-note echoes from middle C, stepwise tunes, five-finger
  melodies, octave-wide leaps, new keys introduced by an I–IV–V–I cadence, minor keys, harmonic
  intervals, triads, "key only" phrases with no starting note, then inversions, sevenths and
  chromatic notes. `Space` or a sustain-pedal tap replays (each replay costs a little XP), `?`
  reveals the next note (counts as a miss); the keyboard stays a fixed C3–C6 window so it never
  gives the phrase away. Interval accuracy is tracked and weak intervals can be practised.
- **Rhythm (levels 1–100)** — quarters and halves → rests and 3/4, 2/4 → eighths → off-beats →
  dotted rhythms → syncopation → sixteenths → 6/8 → dotted sixteenths → interlocking hands →
  polyrhythms (3:2, 4:3). Tasks: *Read* (percussion staves, count-in, playhead), *Echo* (the app
  plays a bar, you answer in the next; notation is revealed afterwards) and *Pulse* (silent
  metronome bars, no playhead — measures your drift). Each hand taps its own key (default C5 / C3,
  “Change” learns a new one; `J` / `F` on a computer keyboard); other keys are ignored. With both
  hands, one texture per exercise: unison, LH or RH pulse, interlocking, polyrhythm. Passing needs
  ≥ 90 % hits *and* ≥ 70 % timing; results show tendency (rushing / dragging), steadiness and, in
  Pulse, the drift in silent bars. Weak rhythm figures are shared with Flow-mode sight reading.
- **Scales & arpeggios** — major, three minors, chromatic, pentatonics, blues; major/minor,
  dominant-7th and diminished-7th arpeggios; all 12 keys; RH, LH, together or contrary motion;
  1–2 octaves in quarters, eighths or sixteenths. Pick an item, shuffle keys, or review what's
  due (spaced repetition). *Wait* to learn with fingering, *Flow* to play on the item's tempo
  ladder (+4 bpm after a clean run, −4 after a messy one; mastered at your goal speed). Results
  show timing steadiness, touch evenness, thumb accents, hand sync and timing bumps at thumb
  crossings. *Play from memory* hides the notation.
- **Progress** — XP that rewards accuracy (steep accuracy curve, reduced XP for repeats, level
  multiplier capped until tiers are mastered), a first-sight bonus, tier mastery at ≥ 90 % pitch
  accuracy on distinct passages, daily streaks, median reaction time, timing accuracy,
  per-note / per-clef heatmaps and weak-spot practice.

## Project layout

```
src/
  core/          pure TypeScript domain logic (no DOM) — fully unit tested
    music/       pitch, keys, accidentals, rhythm
    generator/   difficulty profiles, tiers, rhythm cells (figures), harmony, melody generator
    ear/         ear-training tiers and phrase generator
    rhythm/      rhythm tiers, generator (tasks, textures), analysis (tendency, drift)
    scales/      scale catalogue, fingering, generator, analysis (evenness, bumps), ladder & review
    eval/        Wait / Flow scoring engines
    progress/    XP, mastery, streaks, weak spots, extensible stats
    midi/ input/ keyboard/ settings.ts
  persistence/   storage + identity ports, local adapters, backup format
  platform/      Web MIDI / CoreMIDI bridge backends, Web Audio metronome
  input/         input bus (MIDI, on-screen keys and QWERTY all publish here)
  ui/            React components, VexFlow renderer, practice controller
  styles/        vanilla CSS
native/          Xcode project (SwiftUI + WKWebView + CoreMIDI + CoreAudioKit)
docs/            architecture, native build guide, requirements
```

More detail: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.
