import { allEvents, type Clef, type Exercise } from '../../core/exercise';

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

export function systemHeight(staves: readonly Clef[]): number {
  return staves.length > 1 ? GRAND_SYSTEM_HEIGHT : SINGLE_SYSTEM_HEIGHT;
}

export function computeLayout(ex: Exercise, width: number, headerWidth: number, maxPerSystem = 4): ScoreLayout {
  const tpb = ex.timeSignature.ticksPerBar;
  const shortest = shortestDuration(ex);
  const available = Math.max(120, width - SCORE_MARGIN_X * 2 - headerWidth);
  const minMeasure = Math.max(110, tpb * minPxPerTick(shortest));
  const maxFit = Math.max(1, Math.floor(available / minMeasure));
  const candidates = [4, 3, 2, 1].filter((m) => m <= maxPerSystem && ex.bars % m === 0);
  const measuresPerSystem = candidates.find((m) => m <= maxFit) ?? 1;
  const measureWidth = Math.floor(available / measuresPerSystem);
  const pxPerTick = measureWidth / tpb;
  const leadPx = Math.max(10, Math.min(26, pxPerTick * shortest * 0.45));

  const h = systemHeight(ex.staves);
  const systems: SystemLayout[] = [];
  const count = Math.ceil(ex.bars / measuresPerSystem);
  for (let i = 0; i < count; i++) {
    const top = i * h;
    const staveY: Partial<Record<Clef, number>> = {};
    ex.staves.forEach((clef, k) => (staveY[clef] = top + FIRST_STAVE_Y + k * GRAND_STAFF_GAP));
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

export function measureX(layout: ScoreLayout, measureIndex: number): { system: SystemLayout; x: number } {
  const system = layout.systems[Math.floor(measureIndex / layout.measuresPerSystem)] ?? layout.systems[layout.systems.length - 1];
  return { system, x: system.measuresX + (measureIndex - system.firstMeasure) * layout.measureWidth };
}

/**
 * Largest zoom (1–1.5) at which the whole exercise fits the available height, so short
 * beginner pieces are engraved large while long ones keep a normal size and scroll.
 */
export function chooseScale(ex: Exercise, width: number, height: number, headerWidth: number): number {
  const base = computeLayout(ex, width, headerWidth);
  for (let scale = 1.5; scale > 1.001; scale -= 0.1) {
    const layout = computeLayout(ex, width / scale, headerWidth);
    // Zoom only when it fits and doesn't cost measures per line.
    if (layout.height * scale <= height - 8 && layout.measuresPerSystem >= base.measuresPerSystem) return Math.round(scale * 10) / 10;
  }
  return 1;
}
