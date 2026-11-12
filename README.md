# practice-piano.com

An interactive **sight-reading studio** for your digital piano. It generates fresh, musical
passages for any level from "first note ever" to advanced, engraves them with VexFlow, listens
to your piano over MIDI and scores pitch, timing and reaction time.

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
- **Progress** — XP that rewards accuracy (steep accuracy curve, reduced XP for repeats, level
  multiplier capped until tiers are mastered), a first-sight bonus, tier mastery at ≥ 90 % pitch
  accuracy on distinct passages, daily streaks, median reaction time, timing accuracy,
  per-note / per-clef heatmaps and weak-spot practice.

## Project layout

```
src/
  core/          pure TypeScript domain logic (no DOM) — fully unit tested
    music/       pitch, keys, accidentals, rhythm
    generator/   difficulty profiles, tiers, rhythm cells, harmony, melody generator
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
