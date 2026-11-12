# Part 1: Product & Technical Requirements

## 1. Product Goal & Scope

Build **`practice-piano.com`**, an interactive piano practice application focused on **sight reading** in v1, designed so additional lesson types (e.g., scales/arpeggios, chord progressions, rhythm drills, ear training) can be added in future versions.

## 2. Tech Stack & Platform Constraints

- **Web Stack (Required):** Vite, React, TypeScript, Vanilla CSS, and VexFlow for music notation engraving.
- **Target Platforms:**
  1. **Desktop Browser:** Chrome on macOS (USB-MIDI and macOS Bluetooth MIDI).
  2. **iPadOS & macOS App:** Because Apple WebKit restricts Web MIDI in iPad browsers and Bluetooth MIDI pairing is awkward through separate OS utilities, the project must also support packaging/running as an installable iPadOS app (compatible with Apple Silicon / macOS as well) using Apple `CoreMIDI` and native in-app Bluetooth MIDI pairing (`CoreAudioKit`), buildable locally in Xcode with a free Apple ID (no paid developer account required for local testing).
- **Persistence & Accounts (v1 vs. Future):**
  - **v1:** Single-user, zero authentication, zero cloud setup required. All user settings and practice progress persist locally on the device, with JSON export/import backup and reset support.
  - **Future readiness:** Keep persistence and identity concerns cleanly separable so user accounts (e.g., Google login) and a cloud database (such as Firebase or Supabase) can be introduced in v2 without rewriting lesson logic.

## 3. Electric Piano MIDI, Audio & Input Requirements

- **Real Piano Input:**
  - Support MIDI note-on, note-off (including velocity `0` note-on as note-off), and sustain pedal (`CC 64`).
  - Device connection UI: auto-connect or select specific MIDI inputs, rescan devices, live input monitor (currently held notes + sustain state), and an in-app Bluetooth MIDI pairing trigger when running inside the Apple native wrapper.
  - Sustain pedal (`CC 64`) should show a visual indicator on screen and include a user option to ignore or factor sustain during exercise scoring.
- **Fallback Inputs:**
  - Interactive on-screen piano keyboard (mouse/touch) and computer QWERTY keyboard mapping so every lesson can be practiced or tested without a physical MIDI instrument.
- **Audio & Wireless Latency Workflows:**
  - **No piano note synthesizer required in v1** (the user hears the electric piano directly), though audio handling should not prevent adding synthetic piano audio later.
  - **Built-in metronome sound** for rhythm-driven practice (Flow Mode).
  - Must support two distinct user audio setups with configurable timing/latency compensation (`0–300 ms` slider plus quick presets):
    1. **Device Speakers (`~15 ms`):** Piano connects via Bluetooth MIDI; piano speakers play keys and laptop/iPad speakers play the metronome.
    2. **Headphones on Piano (`~180 ms`):** Headphones connect to the piano; laptop/iPad streams metronome audio back to the piano over Bluetooth audio while receiving Bluetooth MIDI.

## 4. Customizable Sight-Reading Generator

- **Difficulty Slider (`1–100`):** Smooth difficulty control spanning complete beginner to advanced sight reader.
  - **Beginner micro-progression (`Levels 1–15`):** Level `1` must feel welcoming to an absolute beginner with zero prior notation experience (e.g., repeating a single pitch in simple rhythms, gradually introducing `2–3` notes and `5`-finger C position) before expanding to wider ranges, key signatures, polyphony, and complex rhythms.
  - **Musicality constraints:** Generated passages must sound musical rather than purely random pitches (preference for stepwise motion, phrase/key coherence, controlled leaps scaled to difficulty).
- **User Controls & Overrides:**
  - **Hands:** `RH` (Treble), `LH` (Bass), `Alternating`, `Both` (Grand Staff). Changing the difficulty slider must **not** overwrite the user's explicitly chosen Hands setting.
  - **Length:** `4`, `8`, or `16` bars.
  - **Optional Overrides:** Key signature, time signature (`4/4`, `3/4`, `2/4`, `6/8`), rhythm complexity, maximum chord density/polyphony, and BPM (auto-derived from difficulty by default, adjustable by the user).
  - **Keyboard Range Configurability:** Support `49`, `61`, `73`, `76`, and `88` keys (default `88`).

## 5. Notation Rendering & On-Screen Keyboard UX

- **Engraved Sheet Music (VexFlow):**
  - Render single staff for `RH`/`LH` and Grand Staff for `Alternating`/`Both`.
  - Support toggleable beginner note-name labels (`C`, `E`, `G`, etc.) on the staff and on-screen keyboard.
  - **Timing & Visual Alignment Requirements:**
    - Measures within a system must maintain uniform width and linear beat spacing so horizontal position accurately reflects musical time.
    - Simultaneous notes across Left Hand and Right Hand (`Both` mode) must align vertically on the exact same beat position.
- **Interactive On-Screen Keyboard:**
  - Highlight pressed keys, expected keys (toggleable guide), and wrong-note feedback.
  - Support fitting the view to the exercise's pitch span (larger keys on desktop/tablet) or viewing the full keyboard (`49–88` keys).
- **Layout Stability:**
  - Adjusting sliders (especially dragging the `1–100` difficulty slider) or changing keys/exercises must **not** cause surrounding cards, metadata strips, keyboard height, or staff bounds to visually jitter, collapse, or jump across lines.
- **Aesthetic & Theme:**
  - Clean warm paper / sheet-music light aesthetic by default, with a light/dark theme toggle.

## 6. Practice & Evaluation Modes

- **Wait Mode (Self-Paced):**
  - Cursor/playhead highlights the current expected note or chord and waits until the player hits the target note(s).
  - Pressing notes in a chord slightly asynchronously (configurable grace window around `50–80 ms`, e.g. `75 ms` default) must count as simultaneous.
  - Wrong keypresses log an accuracy penalty toward the exercise score/streak and show immediate visual feedback without advancing the cursor.
- **Flow Mode (Metronome-Driven):**
  - Count-in phase with clear visual beat indicators and metronome clicks before bar 1 begins.
  - Smooth, continuous playhead indicator (moving at constant speed across evenly laid-out bars—never jumping awkwardly at bar boundaries) showing exact temporal position on the staff.
  - Evaluates both pitch and rhythmic timing accuracy relative to the beat (honoring Bluetooth latency compensation).
  - Support keyboard shortcut (`Space`) to start/stop Flow Mode.

## 7. Pedagogy-Grounded Gamification & Progress Tracking

- Progress and rewards should incentivize **musical accuracy and sight-reading habits** rather than simply cranking difficulty upward:
  - **Accuracy-gated mastery:** Passing a difficulty tier/band requires high pitch accuracy (`>= 90%`).
  - **First-sight bonus:** Extra XP when succeeding on an unseen generated passage on the first attempt.
  - **Metrics tracked:** Pitch accuracy %, timing accuracy % (Flow Mode), median reaction time per note/step, daily practice streak, tier mastery progress, and per-note/per-clef accuracy heatmaps.
  - **Weak-Spot Practice (v1):** Identify consistently missed or slow notes/clefs and allow generating exercises biased toward those weak spots.
  - **Broader Weakness Tracking (Future Direction — Not in v1):** Keep performance/history data cleanly extensible so future versions can also track weaknesses across intervals, accidentals, key signatures, and rhythmic patterns and recommend targeted drills—without building those extra dimensions in v1.
