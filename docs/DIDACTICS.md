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
   on top of clean playing. XP scales with level and accuracy: harder material pays more per
   note, but only clean playing earns much of it. Learners choose their level freely; XP never
   penalises that choice.
5. **Measure what a teacher listens for**, and only what MIDI can really tell: pitch, timing,
   evenness (time and velocity), hand synchronisation, reaction time. Fingering is shown, never
   graded.
6. **Feedback that teaches.** Weak spots name the musical thing ("you rush the sixteenth after a
   dotted eighth", "timing bump at the thumb crossing"), not just a score.
7. **Help is asked for, and it counts.** Two kinds of help on the keyboard:
   - The *keyboard guide* (a setting, on or off for every lesson) lights the next keys where
     finding them from the notation is the exercise: sight reading, scales, rhythm Read and
     Pulse, chord progressions. Where the keys are the answer (ear training, chord drills,
     rhythm Echo) there is no guide.
   - A *hint* (`?`, Wait only) shows the keys of the current step once, until it is played. The
     step then no longer counts as first try. In Flow there is no time to ask, so there is no hint.

## 2. Two kinds of material

| | Open-ended skills | Fixed repertoire |
|---|---|---|
| Modes | Sight reading, Ear training, Rhythm | Scales & arpeggios, Chords & progressions |
| Goal | handle material you have never seen or heard | make a finite set of patterns automatic |
| Freshness from | **random generation** (musically constrained) | **shuffled order**, **variations**, **spaced repetition** |
| Difficulty control | one **1–100 level** (a real continuum) | **item picker** (what) × **tempo ladder** (how fast) |
| Mastery | tiers of levels, ≥ 90 % on distinct passages | per item: clean at target tempo, evenness thresholds |

**Unseen first.** Random generation alone can repeat itself where the space is small (a
two-note echo has only a handful of phrases). A new exercise therefore tries several seeds and
takes the first passage, phrase or rhythm you have not played yet (the least-played one once
everything has been met).

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
types. The first tiers start anywhere in their small range (C–E, then C–G); phrases end on the
tonic from Five-Finger Tunes on, when there are enough notes for that to leave variety.

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

### 4.4 Scales & arpeggios ✓ (v1 — fixed repertoire)

**Items.** An item is *type × key × hands*; range and rhythm are presentation.
- Scales: major; natural, harmonic, melodic minor (raised 6/7 up, natural down); chromatic
  (sharps up, flats down, no key signature); major and minor pentatonic; blues (♯4 up, ♭5 down).
- Arpeggios: major and minor triads (groups of three: 3/4 in quarters, 6/8 in eighths and
  sixteenths), dominant 7th *in a key* (G7 in C), diminished 7th *in a minor key* (on the leading
  note, B° 7 in C minor).
- Keys: all 12 per type (major F♯, D♭, A♭…; minor C♯, G♯, E♭, B♭…).
- Hands: RH, LH, together (parallel, one or two octaves apart so each staff stays readable),
  contrary motion (both start on the same key; that unison is one expected note).
- Range 1–2 octaves, up and back down; quarters, eighths or sixteenths; the last note fills its
  beat (or bar).

**Pick, shuffle or review.** Pick an item; *Shuffle keys* plays the same type in a different key
each run; *Review* plays the items that are due (below).

**Two modes.** *Wait* (learn): self-paced, cursor and fingering, counts as practice only. *Flow*
(play): count-in and metronome at the item's **tempo ladder**.

**Tempo ladder.** Stored per item in notes per minute (so switching eighths ↔ sixteenths keeps the
speed). A **clean run** (≥ 95 % notes and ≥ 80 % timing) adds 4 bpm in the note value played; a run
under 90 % takes 4 bpm off; anything in between keeps the tempo. − / + (and the piano's F / G after
a run) move it by hand. **Mastered** = a clean run at the goal speed (default 4 notes per second =
♩ 120 in eighths; adjustable 2–8).

**Spaced review.** Leitner boxes: each clean run doubles the interval (today → 1 → 2 → 4 → 8 → 16
days), a run under 90 % resets it to today. Review order: most overdue first, then least accurate.

**Fingering** is printed (RH above, LH below the staff, thumbs highlighted) where there is a settled
standard: major and harmonic-minor fingerings in every key (also used for natural and melodic minor),
chromatic (3 on black keys; RH 2 on F and C, LH 2 on E and B), triad arpeggios with white-key roots
(RH 1-2-3-5; LH 5-4-2-1, or 5-3-2-1 when the third is a black key), right-hand 2-1-2-4 for D♭, E♭,
A♭, B♭ major, and 1-2-3-4 / 5-4-3-2 sevenths on white-key roots. Pentatonic and blues: none.
*Play from memory* hides the notation completely.

**Measurements (Flow).** Notes and timing; **steadiness** (spread of timing); **touch evenness**
(spread of velocity) and **thumb accents** (thumb louder than the other fingers); **hand sync**
(average gap between the hands); **timing bumps** — a note late or early against its neighbours at
the same place in each octave, labelled with finger and crossing (thumb under / finger over).

**Weak spots.** Per item (accuracy, ladder, review schedule); the key is also recorded as a shared
tag (`scaleKey`) for future cross-mode suggestions with sight reading in that key.

**Not in v1:** 3–4 octaves (needs 8va / clef changes in the engraving), scales in thirds and broken
patterns, modes, exam-style stages, LH fingering for black-key arpeggios.

### 4.5 Chords & progressions ✓ (v1 — fixed repertoire)

**Items.** Two tasks, each a repertoire item with its own tempo ladder and review date:
- **Chord drill** — *set × prompt × voicing rule*. Sets: major & minor triads; all triads (+ °, +);
  suspended (sus2, sus4); sevenths (7, maj7, m7); all sevenths (+ ø7, °7). Every root, spelled
  with flats for major-type chords and sharps for minor-type ones (D♭, F♯m). The *order* is
  random (no immediate repeats), the vocabulary is fixed. Prompt: the **symbol** (Cm7, shown as a
  lead-sheet chart, since the staff would give the answer) or the **notation** (a close voicing on
  the staff, no symbol — reading it is the task). Voicing rule: *root position* (root lowest),
  *inversions* (the bass note asked for, written as a slash chord C/E), or *any voicing*.
- **Progression** — *progression × key × hands*. Library: I–IV–V–I, I–V–vi–IV, I–vi–IV–V,
  ii7–V7–Imaj7, i–iv–V–i, iiø7–V7–i, Andalusian i–VII–VI–V, Pachelbel's canon, circle of fifths,
  12-bar blues (dominant sevenths). All 12 major or minor keys (minor dominants from harmonic
  minor); four-chord progressions go round twice so the turnaround is practised. Hands: right
  hand alone, or **+ LH root** (left hand plays the root in the bass staff, which becomes the
  required bass note). Symbols *and* Roman numerals are printed above the staff; *Play from the
  chord chart* hides the notation (voice it yourself).

**Judging.** A chord is right when the keys down together have exactly its pitch classes — any
octave, any doubling, nothing extra — and, where the rule asks, the right note lowest. Wait: the
chord counts the moment it is complete (or when a stray key is let go); wrong keys first make it
"not first time"; right notes over the wrong bass get a hint ("put E in the bass"). A repeated
chord must be struck again. Flow: one chord per 4/4 bar on beat 1; keys pressed around the bar
line (−0.3 / +0.4 of a bar, at most 300 / 450 ms) plus keys held over from before (common tones)
make the chord; holding the previous chord through the bar line does not count.

**Keyboard guide and hints.** In progressions the guide shows the suggested voicing, as it shows
the notes in sight reading. In drills it would give the answer away, so there is none: after 5 s
without the chord, or a wrong key, the Hint button is pointed out ("Stuck? Press ? for a hint"),
and a chord found after a hint is not right first time ("needed a hint").

**Voicings.** The suggested voicing is close position; progressions move to the nearest voicing
each time (smallest total semitone movement, kept between G3 and G5).

**Tempo ladder and review** as in §4.4, counted in bpm (one chord per bar, ladder step 4 bpm).
Starts at 48 bpm (drills) / 60 bpm (progressions); clean = ≥ 90 % chords and ≥ 75 % timing;
mastered at the goal tempo (default ♩ = 80, a chord every 3 s).

**Measurements.** Wait: right first time, median time to find a chord, slow chords (> 2× your
median). Flow: chords on the beat, timing tendency, **keys together** (median time from the first
to the last key of a chord; > 120 ms reads as rolled). Progressions: a **voice-leading score** —
average semitones the right hand moved per change against the smallest move possible (1 = as
smooth as the shown voicings). Results list the chords to look at (missed, wrong bass, slow,
early / late, rolled).

**Weak spots.** Shared tags `chordQuality`, `chordRoot` (pitch class) and `chordInversion`
(accuracy, reaction, timing). Weak-spot focus draws more of the weak qualities and roots in drills.

**Not in v1:** open / spread voicings and left-hand shells, extended chords (9, 11, 13) and
altered dominants, rule-based progressions generated from functions, Roman-numeral prompts in a
key for drills, rhythm patterns (comping) inside the bar.

## 5. Order of work

1. Sight reading ✓ 2. Ear training ✓ 3. Rhythm ✓ 4. Scales & arpeggios ✓ (introduced the
fixed-repertoire infrastructure: item picker, tempo ladder, spaced review, evenness metrics)
5. Chords & progressions ✓ (reuses it: tempo ladder in bpm, review, pitch-class judging).
