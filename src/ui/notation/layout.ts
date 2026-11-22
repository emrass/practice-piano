import { allEvents, type Clef, type Exercise } from '../../core/exercise';
import { keyAlters } from '../../core/music/keys';

/**
 * Pure score geometry. Every measure in the score has the same width and every tick the
 * same horizontal size, so x position is a linear function of musical time within a
 * system (playhead speed is constant, and simultaneous notes in both hands line up).
 */
export interface SystemLayout {
  index: number;
  firstMeasure: number;
  measureCount: number;
  top: number;
  height: number;
  /** y passed to the VexFlow Stave constructor, per clef. */
  staveY: Partial<Record<Clef, number>>;
  /** Region to highlight for cursors (top of first staff line … bottom of last). */
  bandTop: number;
  bandBottom: number;
  headerX: number;
  /** x of the first measure's left barline. */
  measuresX: number;
  startTick: number;
  endTick: number;
}

export interface ScoreLayout {
  width: number;
  height: number;
  headerWidth: number;
  measureWidth: number;
  measuresPerSystem: number;
  pxPerTick: number;
  /** Distance from a barline to a note on the downbeat. */
  leadPx: number;
  systems: SystemLayout[];
}

export const SCORE_MARGIN_X = 12;
const STAFF_LINE_SPAN = 40; // 5 lines, 10 px apart
const STAVE_TOP_OFFSET = 40; // VexFlow draws the top line 4 spaces below stave.y
const SINGLE_SYSTEM_HEIGHT = 170;
const GRAND_SYSTEM_HEIGHT = 280;
const GRAND_STAFF_GAP = 110;
const FIRST_STAVE_Y = 22;

/** Minimum horizontal pixels per tick, by the shortest note value in the piece. */
export function minPxPerTick(shortestTicks: number): number {
  if (shortestTicks <= 1) return 22; // sixteenths
  if (shortestTicks <= 2) return 14; // eighths
  if (shortestTicks <= 3) return 14;
  return 10; // quarters and longer
}

export function shortestDuration(ex: Exercise): number {
  const durs = allEvents(ex)
    .filter((e) => e.pitches.length > 0)
    .map((e) => e.durationTicks);
  return durs.length ? Math.min(...durs) : 4;
}

/** Share of notes that need an accidental (roughly): chromatic passages need more room. */
export function accidentalDensity(ex: Exercise): number {
  const alters = keyAlters(ex.key.fifths);
  const pitches = allEvents(ex).flatMap((e) => e.pitches);
  if (!pitches.length) return 0;
  return pitches.filter((p) => p.alter !== alters[p.letter]).length / pitches.length;
}

/** Rough width of the widest chord symbol with the gap after it: 11.5 px a character at the `chord` type size. */
function symbolWidth(ex: Exercise): number {
  const longest = Math.max(0, ...allEvents(ex).map((e) => e.symbol?.length ?? 0));
  return longest * 11.5 + 12;
}

/** Chord symbols in the fullest bar, when a bar has more than one (inversions): each needs room for its width. */
function symbolsPerBar(ex: Exercise): number {
  const most = Math.max(0, ...ex.measures.map((m) => [...m.rh, ...m.lh].filter((e) => e.symbol).length));
  return most > 1 ? most : 0;
}

export function systemHeight(staves: readonly Clef[]): number {
  return staves.length > 1 ? GRAND_SYSTEM_HEIGHT : SINGLE_SYSTEM_HEIGHT;
}

/**
 * Room a system needs beyond its usual height, above its first staff and below its last: for
 * rows of text the usual height has no place for (a stack of chord fingering, see `fingeringRoom`).
 */
export interface SystemRoom {
  top: number;
  bottom: number;
}
const NO_ROOM: SystemRoom = { top: 0, bottom: 0 };

export function computeLayout(ex: Exercise, width: number, headerWidth: number, maxPerSystem = 4, room: SystemRoom = NO_ROOM): ScoreLayout {
  const tpb = ex.timeSignature.ticksPerBar;
  const shortest = shortestDuration(ex);
  const available = Math.max(120, width - SCORE_MARGIN_X * 2 - headerWidth);
  const minMeasure = Math.max(110, tpb * minPxPerTick(shortest) * (1 + 0.8 * accidentalDensity(ex)), symbolsPerBar(ex) * symbolWidth(ex));
  const maxFit = Math.max(1, Math.floor(available / minMeasure));
  const candidates = [4, 3, 2, 1].filter((m) => m <= maxPerSystem && ex.bars % m === 0);
  let measuresPerSystem = candidates.find((m) => m <= maxFit) ?? 1;
  // Odd lengths (scales: 3, 5 bars…): fill lines and leave the last one short.
  if (measuresPerSystem === 1 && ex.bars > 1) measuresPerSystem = Math.max(1, Math.min(maxFit, maxPerSystem, ex.bars));
  const measureWidth = Math.floor(available / measuresPerSystem);
  const pxPerTick = measureWidth / tpb;
  // Chords (one stacked chord per bar) need room after the bar line for columns of accidentals.
  const leadPx = 'chords' in ex ? 44 : Math.max(10, Math.min(26, pxPerTick * shortest * 0.45));

  const h = systemHeight(ex.staves) + room.top + room.bottom;
  const systems: SystemLayout[] = [];
  const count = Math.ceil(ex.bars / measuresPerSystem);
  for (let i = 0; i < count; i++) {
    const top = i * h;
    const staveY: Partial<Record<Clef, number>> = {};
    ex.staves.forEach((clef, k) => (staveY[clef] = top + room.top + FIRST_STAVE_Y + k * GRAND_STAFF_GAP));
    const firstY = staveY[ex.staves[0]]!;
    const lastY = staveY[ex.staves[ex.staves.length - 1]]!;
    const firstMeasure = i * measuresPerSystem;
    const measureCount = Math.min(measuresPerSystem, ex.bars - firstMeasure);
    systems.push({
      index: i,
      firstMeasure,
      measureCount,
      top,
      height: h,
      staveY,
      bandTop: firstY + STAVE_TOP_OFFSET - 14,
      bandBottom: lastY + STAVE_TOP_OFFSET + STAFF_LINE_SPAN + 14,
      headerX: SCORE_MARGIN_X,
      measuresX: SCORE_MARGIN_X + headerWidth,
      startTick: firstMeasure * tpb,
      endTick: (firstMeasure + measureCount) * tpb,
    });
  }
  return {
    width,
    height: count * h,
    headerWidth,
    measureWidth,
    measuresPerSystem,
    pxPerTick,
    leadPx,
    systems,
  };
}

export function systemForTick(layout: ScoreLayout, tick: number): SystemLayout {
  const { systems } = layout;
  for (const s of systems) if (tick < s.endTick) return s;
  return systems[systems.length - 1];
}

/** x of a note (its notehead's left edge) starting at `tick`. */
export function tickToX(layout: ScoreLayout, tick: number): { system: SystemLayout; x: number } {
  const system = systemForTick(layout, Math.max(0, tick));
  const local = Math.min(Math.max(0, tick - system.startTick), system.endTick - system.startTick);
  return { system, x: system.measuresX + layout.leadPx + local * layout.pxPerTick };
}

/** A box over the score, in layout pixels. */
export interface CoverBox {
  top: number;
  height: number;
  left: number;
  right: number;
  /** y of every staff line in the box's line, so the staff can run on through the cover. */
  staffLines: number[];
  /** x of the bar lines inside the box, drawn from the first staff line to the last. */
  barLines: number[];
}

/** y of the five lines of each staff in a system, top to bottom. */
export function staffLineYs(system: SystemLayout): number[] {
  return Object.values(system.staveY).flatMap((y) => Array.from({ length: 5 }, (_, i) => y! + STAVE_TOP_OFFSET + (i * STAFF_LINE_SPAN) / 4));
}

/** The read-ahead cover trails the playhead by about a notehead, so the note being played is hidden too. */
export const COVER_TRAIL_PX = 14;
/** The cover's edges fade over this width (`space-12` in its mask); the box reaches half of it past each edge, so the fade is centered on the edge. */
export const COVER_FEATHER_PX = 12;
/** Where the Flow playhead line is drawn, right of a note's x (the middle of its notehead). */
export const PLAYHEAD_OFFSET_PX = 5.5;

/**
 * Read-ahead cover: hides the music from just behind the playhead at `tick` to `span` ticks
 * ahead of it, over the whole height of the line. Past the end of a line it carries on at the
 * start of the next one (a second box); it stops at the end of the piece.
 */
export function coverBoxes(layout: ScoreLayout, tick: number, span: number): CoverBox[] {
  const last = layout.systems[layout.systems.length - 1];
  if (!last || span <= 0) return [];
  const total = last.endTick;
  const end = Math.min(tick + span, total);
  const boxes: CoverBox[] = [];
  let system = systemForTick(layout, Math.max(0, Math.min(tick, total - 1)));
  const half = COVER_FEATHER_PX / 2;
  let left = system.measuresX + layout.leadPx + (tick - system.startTick) * layout.pxPerTick + PLAYHEAD_OFFSET_PX - COVER_TRAIL_PX - half;
  for (;;) {
    const lineEnd = system.measuresX + system.measureCount * layout.measureWidth;
    // The note that starts right at the edge is not covered: that is where to read.
    const right = (end >= system.endTick ? lineEnd : system.measuresX + layout.leadPx + (end - system.startTick) * layout.pxPerTick - 2) + half;
    const boxLeft = Math.max(system.measuresX, left);
    const barLines = Array.from({ length: system.measureCount }, (_, i) => system.measuresX + (i + 1) * layout.measureWidth).filter((x) => x > boxLeft && x < right);
    if (right - boxLeft >= 1) boxes.push({ top: system.top + 4, height: system.height - 8, left: boxLeft, right, staffLines: staffLineYs(system), barLines });
    if (end <= system.endTick || system === last) break;
    system = layout.systems[system.index + 1];
    left = system.measuresX;
  }
  return boxes;
}

export function measureX(layout: ScoreLayout, measureIndex: number): { system: SystemLayout; x: number } {
  const system = layout.systems[Math.floor(measureIndex / layout.measuresPerSystem)] ?? layout.systems[layout.systems.length - 1];
  return { system, x: system.measuresX + (measureIndex - system.firstMeasure) * layout.measureWidth };
}

/**
 * Largest zoom (1–1.5) at which the whole exercise fits the available height, so short
 * beginner pieces are engraved large while long ones keep a normal size and scroll.
 */
export function chooseScale(ex: Exercise, width: number, height: number, headerWidth: number, room: SystemRoom = NO_ROOM): number {
  const base = computeLayout(ex, width, headerWidth, 4, room);
  for (let scale = 1.5; scale > 1.001; scale -= 0.1) {
    const layout = computeLayout(ex, width / scale, headerWidth, 4, room);
    // Zoom only when it fits and doesn't cost measures per line.
    if (layout.height * scale <= height - 8 && layout.measuresPerSystem >= base.measuresPerSystem) return Math.round(scale * 10) / 10;
  }
  return 1;
}
