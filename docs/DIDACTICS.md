# Didactic concept

practice-piano.com trains **isolated skills**. Someone who knows what they want to practise
should be able to open the app, pick exactly that, and get fresh material at the right level
in seconds. This document is the musical and didactic design that the code follows. Code
changes to a practice mode should start here.

## 1. Principles

1. **One skill per mode.** Every mode trains one thing: reading pitch, hearing, rhythm, scale
   technique, harmonic vocabulary. Combinations happen in real music; the app isolates.
2. **Pick or Auto.** Every mode has two ways in:
   - *Pick* — choose exactly the material ("E♭ harmonic minor, hands together, 2 octaves",
     "dotted rhythms, both hands"). First-class, never more than a few taps away.
   - *Auto* — the app chooses the level or the items that are due.
3. **Always new material**, but "new" means different things (§2).
4. **Accuracy before speed.** Mastery is gated on accuracy (≥ 90 %); tempo and level rise only
   on top of clean playing. XP never rewards just turning the difficulty up.
5. **Measure what a teacher listens for**, and only what MIDI can really tell: pitch, timing,
   evenness (time and velocity), hand synchronisation, reaction time. Fingering is shown, never
   graded.
6. **Feedback that teaches.** Weak spots name the musical thing ("you rush the sixteenth after a
   dotted eighth", "timing bump at the thumb crossing"), not just a score.

## 2. Two kinds of material

| | Open-ended skills | Fixed repertoire |
|---|---|---|
| Modes | Sight reading, Ear training, Rhythm | Scales & arpeggios, Chords & progressions |
| Goal | handle material you have never seen or heard | make a finite set of patterns automatic |
| Freshness from | **random generation** (musically constrained) | **shuffled order**, **variations**, **spaced repetition** |
| Difficulty control | one **1–100 level** (a real continuum) | **item picker** (what) × **tempo ladder** (how fast) |
| Mastery | tiers of levels, ≥ 90 % on distinct passages | per item: clean at target tempo, evenness thresholds |

Why not randomise everything? A C major scale is always a C major scale; random notes would
destroy what is being practised. Random *chord sequences* would be unmusical. For fixed
repertoire, research on practice favours **shuffled** (mixed-up) items over drilling one
item in a block, and **spaced repetition** (items you are weak at return sooner).

## 3. Weak spots and shared skill tags

Weak spots are analysed **per mode** (practice stays isolated). In addition, every observation
carries **shared tags** so patterns can be seen across modes:

| Tag | Example | Recorded by |
|---|---|---|
| key | E♭ major | sight reading, scales, chords, ear |
| interval | minor 6th | ear (melodic / harmonic), later sight reading |
| chord quality | dominant 7th on G | chords, ear, arpeggios |
| rhythm figure | dotted eighth + sixteenth | rhythm, sight reading (Flow mode) |
| register / clef | bass clef ledger lines | sight reading |

Stats are stored as `dimension → key → aggregate`, so new tags need no data migration.

Cross-mode use is **suggestion, never automatic mixing**: "E♭ major is weak in sight reading
and your E♭ scale is uneven → practise the E♭ major scale" (one click). Correlations are
hypotheses, so a suggestion needs evidence in both modes.

Implemented links:
- **Rhythm figures** are one shared vocabulary. The rhythm generator and the sight-reading
  generator draw from the same figure library; Flow-mode sight reading records timing per figure
  into the same statistics as Rhythm mode, and weak-spot practice in either mode features the
  weakest figures.
- Ear training records melodic and harmonic intervals; sight-reading note/clef stats stay
  separate (hearing an interval and reading a note are different skills).

## 4. The modes

### 4.1 Sight reading ✓

Decoding notation into keys. Open-ended → random passages with musical constraints (chord
progressions, phrase cadences, stepwise motion, leap recovery, motifs), level 1–100.
Wait mode isolates pitch reading; Flow mode adds time. Weak spots: note × clef; in Flow mode also
rhythm figures.

### 4.2 Ear training ✓

Audiation into keys ("listen and play back"). Open-ended → random phrases, level 1–100: two-note
echoes → five-finger tunes → leaps → new keys (set by an I–IV–V–I cadence) → minor → harmonic
intervals → triads → key-only → inversions, sevenths, chromatic notes. Notes appear as they are
found; replays cost a little XP, hints count as misses. Weak spots: melodic intervals and chord
types.

### 4.3 Rhythm ✓ (v1)

Time, independent of pitch. Open-ended → random rhythms from the shared figure library,
level 1–100.

**Designated keys.** Each hand taps its own key (defaults: right hand C5, left hand C3,
changeable by "press the key you want"). On a computer keyboard: `J` = right, `F` = left. Other
keys are ignored, so a stray note is never punished. Separate keys make **hand independence**
measurable.

**Hands.** Right, Left, or Both. With both hands the exercise has one *texture* — a single,
nameable independence skill:
- *Unison* — same rhythm in both hands (coordination).
- *Left-hand pulse* — LH keeps the beat, RH plays the rhythm (the basic accompaniment skill).
- *Right-hand pulse* — the reverse (usually harder; trains the weaker side).
- *Interlocking* — the hands fill each other's gaps (true independence).
- *Polyrhythm* — 3 against 2 (quarters vs dotted quarters in 3/4) and 4 against 3 (dotted
  eighths vs quarters in 3/4).

**Three tasks.**
1. **Read** — read a rhythm on percussion staves and play it with the metronome (count-in,
   constant-speed playhead).
2. **Echo** — call and response: the app plays a bar (later two) on your keys' sounds, you
   answer in the next bar while the pulse continues. Notation is revealed only after each
   answer. Trains rhythmic memory and hearing.
3. **Pulse** — simple rhythms, but the metronome falls silent for whole bars (2 on / 2 off →
   1 on / 3 off → 1 on / 7 off). Measures whether you keep the tempo by yourself: the **drift**
   in silent bars compared with clicked bars.

**Levels (tiers).**

| Levels | Tier | New material |
|---|---|---|
| 1–8 | Steady Beat | quarters, halves, wholes in 4/4 |
| 9–16 | Rests & Meters | quarter/half rests, 3/4, 2/4 |
| 17–26 | Eighth Notes | eighth pairs, runs of eighths |
| 27–36 | Off-beats | eighth rests, notes on "and" |
| 37–46 | Dotted Rhythms | dotted quarter + eighth |
| 47–56 | Syncopation | eighth–quarter–eighth across the beat |
| 57–66 | Sixteenths | four sixteenths, eighth + two sixteenths |
| 67–74 | Compound Time | 6/8 |
| 75–82 | Dotted Sixteenths | dotted eighth + sixteenth, mixed figures |
| 83–91 | Hand Independence | interlocking textures, faster tempos |
| 92–100 | Polyrhythms | 3:2 and 4:3 |

Hands, task, length (4/8 bars), meter and tempo can be overridden; the level never changes
them.

**Measurements.** Hit = the right key within the timing window (with the latency calibration
applied). Reported: hit rate, timing accuracy, **tendency** (average early/late in ms, i.e.
rushing or dragging), **steadiness** (spread of timing in ms), and in Pulse the **drift** in silent
bars.

**Passing.** ≥ 90 % hits *and* ≥ 70 % timing accuracy (rhythm is about time, so hitting the key
is not enough).

**Weak spots.** Per rhythm figure (hit rate, timing, tendency) and per beat position (downbeat,
beat, off-beat, sixteenth). Weak-spot practice features the weakest figures — in Rhythm mode and,
because the library is shared, in Flow-mode sight reading.

**Not in v1:** triplets (needs a finer time grid), swing feel, tempo changes, odd meters.

*Implementation notes (v1).* Echo uses 1-bar calls below level 37 and 2-bar calls above; tapping
along with a call is ignored. Pulse keeps the figures of level ≤ 46 at most, hides the playhead,
beat dots and key guide in silent bars, and with 4 bars shortens long silences so the click
returns once at the end. Interlocking distributes one rhythm between the hands (never more than
two notes in a row per hand, both hands in every bar). Polyrhythms are always written in 3/4.

### 4.4 Scales & arpeggios (planned — fixed repertoire)

- **Pick:** type (major; natural, harmonic, melodic minor; chromatic; pentatonic, blues; modes
  later), keys (one, a set, circle of fifths, all 12), hands (RH, LH, together, contrary motion),
  1–4 octaves, pattern (straight, in thirds, broken groupings), rhythm (quarters → sixteenths).
  Arpeggios: major/minor triads, dominant 7th, diminished 7th.
- **Auto:** optional stages (like exam grades) and a daily review queue of due items.
- **Difficulty:** a tempo ladder per item (+4 bpm after a clean run, back off after errors) instead
  of a level slider.
- **Display:** notation with standard fingering the first time, then from memory (guide off).
- **Measurements:** wrong notes, timing evenness, **velocity evenness** (thumb accents), hand
  synchronisation, highest clean tempo.
- **Weak spots:** key × type × hand, and position inside the scale (recurring timing bumps at the
  same degree = thumb crossing).
- **Links:** key familiarity ↔ sight reading in that key signature; arpeggios ↔ chord vocabulary.

### 4.5 Chords & progressions (planned — fixed repertoire)

- **Vocabulary:** play a chord on demand from a symbol (Cm7), a Roman numeral in a key, or notation;
  inversions. Draws are random in *order* only, from the chosen set.
- **Progressions:** library of standard progressions (I–IV–V–I, ii–V–I, I–vi–IV–V, 12-bar blues,
  circle of fifths, minor i–iv–V–i) transposed to all keys and shuffled; at advanced levels
  rule-based progressions (tonic → pre-dominant → dominant → tonic). No random chord chains.
- **Measurements:** correct chord (any voicing unless specified), inversion, reaction time, a
  **voice-leading score** (hand movement vs. the smallest possible).
- **Weak spots:** chord quality × root × inversion. Links: ear-training harmony, arpeggios.

## 5. Order of work

1. Sight reading ✓ 2. Ear training ✓ 3. Rhythm ✓ 4. Scales & arpeggios (introduces the
fixed-repertoire infrastructure: item picker, tempo ladder, spaced review, evenness metrics)
5. Chords & progressions (reuses it).
