import {
  Accidental,
  Barline,
  Beam,
  Dot,
  ModifierContext,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Stem,
  TickContext,
} from 'vexflow/bravura';
import { HAND_CLEF, type Clef, type Exercise, type Hand, type NoteEvent } from '../../core/exercise';
import { MeasureAccidentals } from '../../core/music/keys';
import { pitchLabel, pitchToStep, vexKey } from '../../core/music/pitch';
import { beamLevel, durationCode, isDotted } from '../../core/music/rhythm';
import { chooseScale, computeLayout, measureX, type ScoreLayout, tickToX } from './layout';

export interface RenderedScore {
  layout: ScoreLayout;
  /** CSS pixels per layout pixel. */
  scale: number;
  svg: SVGSVGElement | null;
  /** SVG groups of each step's noteheads (both hands), for colouring. */
  stepElements: Map<number, SVGGElement[]>;
  /** Engraved notehead x (layout px) per event id — used by tests to verify alignment. */
  noteX: Map<string, number>;
}

export interface RenderOptions {
  width: number;
  /** Visible height; used to zoom short exercises. 0 = no zoom. */
  height: number;
  showNoteNames: boolean;
  /** Draw a "?" marker at every step, shown while that step's notes are hidden (ear training). */
  placeholders?: boolean;
  /** Print fingering numbers where events carry them (scales): RH above, LH below the staff. */
  showFingering?: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Middle staff line as a diatonic step: B4 (treble), D3 (bass). */
const MIDDLE_LINE_STEP: Record<Clef, number> = { treble: 34, bass: 22 };
const REST_KEY: Record<Clef, string> = { treble: 'b/4', bass: 'd/3' };
/** Rhythm exercises are written on one-line percussion staves, every note on the line. */
const PERCUSSION_KEY = 'b/4';
const PERCUSSION_LINES = [false, false, true, false, false].map((visible) => ({ visible }));

export function isPercussion(ex: Exercise): boolean {
  return 'rhythm' in ex;
}
const WHOLE_REST_KEY: Record<Clef, string> = { treble: 'd/5', bass: 'f/3' };

let headerCache: { key: string; width: number } | null = null;

/** Width of clef + key signature + time signature, the widest a system header gets. */
export function measureHeaderWidth(ex: Exercise): number {
  const percussion = isPercussion(ex);
  const cacheKey = `${ex.staves.join()}|${ex.key.vexKey}|${ex.timeSignature.id}|${percussion}`;
  if (headerCache?.key === cacheKey) return headerCache.width;
  let width = 0;
  for (const clef of ex.staves) {
    const stave = new Stave(0, 0, 500);
    if (percussion) stave.addClef('percussion').addTimeSignature(ex.timeSignature.id);
    else stave.addClef(clef).addKeySignature(ex.key.vexKey).addTimeSignature(ex.timeSignature.id);
    width = Math.max(width, stave.getNoteStartX() - stave.getX());
  }
  headerCache = { key: cacheKey, width: Math.ceil(width + 6) };
  return headerCache.width;
}

/** Beam groups: consecutive beamable notes inside one beat. */
function beamGroups(events: NoteEvent[], beatTicks: number): NoteEvent[][] {
  const groups: NoteEvent[][] = [];
  let current: NoteEvent[] = [];
  let currentBeat = -1;
  const flush = () => {
    if (current.length >= 2) groups.push(current);
    current = [];
  };
  for (const e of events) {
    const beat = Math.floor(e.startTick / beatTicks);
    const endBeat = Math.floor((e.startTick + e.durationTicks - 1) / beatTicks);
    const beamable = e.pitches.length > 0 && beamLevel(e.durationTicks) > 0 && beat === endBeat;
    if (!beamable || beat !== currentBeat) flush();
    if (beamable) {
      current.push(e);
      currentBeat = beat;
    } else {
      currentBeat = -1;
    }
  }
  flush();
  return groups;
}

function stemDirectionFor(events: NoteEvent[], clef: Clef): number {
  const steps = events.flatMap((e) => e.pitches.map((p) => pitchToStep(p)));
  const avg = steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length);
  return avg >= MIDDLE_LINE_STEP[clef] ? Stem.DOWN : Stem.UP;
}

function createNote(
  e: NoteEvent,
  clef: Clef,
  ticksPerBar: number,
  stemDir: number | null,
  acc: MeasureAccidentals,
  percussion = false,
): StaveNote {
  const isRest = e.pitches.length === 0;
  const wholeBarRest = isRest && e.durationTicks === ticksPerBar;
  const duration = wholeBarRest ? 'w' : durationCode(e.durationTicks);
  let keys: string[];
  if (percussion) keys = [PERCUSSION_KEY];
  else if (isRest) keys = [wholeBarRest ? WHOLE_REST_KEY[clef] : REST_KEY[clef]];
  else keys = e.pitches.map((p) => vexKey(p));
  const note = new StaveNote({
    keys,
    duration: isRest ? `${duration}r` : duration,
    clef: percussion ? 'treble' : clef,
    ...(percussion ? { stem_direction: Stem.UP } : stemDir === null ? { auto_stem: true } : { stem_direction: stemDir }),
  });
  if (!isRest && !percussion) {
    e.pitches.forEach((p, i) => {
      const code = acc.accidentalFor(p);
      if (code) note.addModifier(new Accidental(code), i);
    });
  }
  if (isDotted(e.durationTicks) && !wholeBarRest) Dot.buildAndAttach([note], { all: true });
  return note;
}

function addText(svg: SVGSVGElement, parent: SVGElement, x: number, y: number, text: string, cls: string, step?: number) {
  const el = document.createElementNS(SVG_NS, 'text');
  if (step !== undefined) el.setAttribute('data-step', String(step));
  el.setAttribute('x', x.toFixed(1));
  el.setAttribute('y', y.toFixed(1));
  el.setAttribute('class', cls);
  el.setAttribute('text-anchor', 'middle');
  el.textContent = text;
  (parent ?? svg).appendChild(el);
}

/**
 * Engrave an exercise with VexFlow. Notes are positioned manually on a linear time grid
 * (see layout.ts) rather than with VexFlow's proportional Formatter, so that beat position
 * maps exactly to x and both hands share identical x for simultaneous notes.
 */
export function renderScore(container: HTMLDivElement, ex: Exercise, opts: RenderOptions): RenderedScore {
  container.replaceChildren();
  const percussion = isPercussion(ex);
  const fingered = 'scale' in ex;
  // Scales print fingering where note names would go; names stay on the keyboard.
  const showNames = opts.showNoteNames && !percussion && !fingered;
  const headerWidth = measureHeaderWidth(ex);
  const scale = opts.height > 0 ? chooseScale(ex, opts.width, opts.height, headerWidth) : 1;
  const layout = computeLayout(ex, Math.floor(opts.width / scale), headerWidth);
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(layout.width, layout.height);
  const ctx = renderer.getContext();
  const svg = container.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('width', String(Math.round(layout.width * scale)));
    svg.setAttribute('height', String(Math.round(layout.height * scale)));
    svg.style.width = `${Math.round(layout.width * scale)}px`;
    svg.style.height = `${Math.round(layout.height * scale)}px`;
    svg.setAttribute('class', 'score-svg');
    svg.dataset.scale = String(scale);
    svg.dataset.measuresPerSystem = String(layout.measuresPerSystem);
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      percussion
        ? `Rhythm exercise, ${ex.timeSignature.id}, ${ex.bars} bars`
        : `Sight-reading exercise in ${ex.key.label}, ${ex.timeSignature.id}, ${ex.bars} bars`,
    );
  }
  const stepByTick = new Map(ex.steps.map((s) => [s.tick, s.index]));
  const stepElements = new Map<number, SVGGElement[]>();
  const noteX = new Map<string, number>();
  const labelLayer = svg ? (document.createElementNS(SVG_NS, 'g') as SVGGElement) : null;
  labelLayer?.setAttribute('class', 'pp-labels');
  const tpb = ex.timeSignature.ticksPerBar;
  const lastMeasure = ex.bars - 1;

  for (const system of layout.systems) {
    const headers: Partial<Record<Clef, Stave>> = {};
    const measureStaves: Partial<Record<Clef, Stave[]>> = {};
    for (const clef of ex.staves) {
      const y = system.staveY[clef]!;
      const header = new Stave(system.headerX, y, headerWidth);
      if (percussion) header.addClef('percussion').setConfigForLines(PERCUSSION_LINES);
      else header.addClef(clef).addKeySignature(ex.key.vexKey);
      if (system.index === 0) header.addTimeSignature(ex.timeSignature.id);
      header.setEndBarType(Barline.type.NONE);
      if (ex.staves.length === 1) header.setBegBarType(Barline.type.NONE);
      header.setContext(ctx).draw();
      headers[clef] = header;
      const staves: Stave[] = [];
      for (let m = 0; m < system.measureCount; m++) {
        const index = system.firstMeasure + m;
        const { x } = measureX(layout, index);
        const stave = new Stave(x, y, layout.measureWidth);
        if (percussion) stave.setConfigForLines(PERCUSSION_LINES);
        if (m === 0) stave.setBegBarType(Barline.type.NONE);
        if (index === lastMeasure) stave.setEndBarType(Barline.type.END);
        stave.setContext(ctx).draw();
        staves.push(stave);
      }
      measureStaves[clef] = staves;
    }
    if (ex.staves.length > 1) {
      const top = headers.treble!;
      const bottom = headers.bass!;
      new StaveConnector(top, bottom).setType('brace').setContext(ctx).draw();
      new StaveConnector(top, bottom).setType('singleLeft').setContext(ctx).draw();
      measureStaves.treble!.forEach((t, i) => {
        const b = measureStaves.bass![i];
        const last = system.firstMeasure + i === lastMeasure;
        new StaveConnector(t, b).setType(last ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();
      });
    }
    if (percussion && labelLayer && svg && ex.staves.length > 1) {
      for (const clef of ex.staves) {
        const y = headers[clef]!.getYForLine(2);
        addText(svg, labelLayer, system.headerX + 13, y - 19, clef === 'treble' ? 'RH' : 'LH', 'pp-hand-label');
      }
    }
    if (labelLayer && system.index > 0 && svg) {
      const firstY = system.staveY[ex.staves[0]]!;
      addText(svg, labelLayer, system.measuresX + 6, firstY + 30, String(system.firstMeasure + 1), 'pp-bar-number');
    }

    // Notes, per staff and measure.
    for (const clef of ex.staves) {
      const hand: Hand = clef === 'treble' ? 'rh' : 'lh';
      const labelled: { note: StaveNote; event: NoteEvent }[] = [];
      let staveBottom = 0;
      measureStaves[clef]!.forEach((stave, m) => {
        staveBottom = stave.getYForLine(4);
        const measure = ex.measures[system.firstMeasure + m];
        const events = measure[hand];
        if (!events.length) return;
        const measureGroup = ctx.openGroup('pp-measure', `pp-m-${hand}-${measure.index}`) as SVGGElement | undefined;
        measureGroup?.setAttribute('data-measure', String(measure.index));
        const groups = beamGroups(events, ex.timeSignature.beatTicks);
        const stemFor = new Map<NoteEvent, number>();
        for (const g of groups) {
          const dir = stemDirectionFor(g, clef);
          g.forEach((e) => stemFor.set(e, dir));
        }
        const acc = new MeasureAccidentals(ex.key.fifths);
        const notes = new Map<NoteEvent, StaveNote>();
        for (const e of events) {
          const note = createNote(e, clef, tpb, stemFor.get(e) ?? null, acc, percussion);
          note.setStave(stave);
          const tc = new TickContext();
          tc.addTickable(note);
          note.addToModifierContext(new ModifierContext());
          tc.preFormat();
          tc.setX(0);
          const base = note.getAbsoluteX();
          const wholeBarRest = e.pitches.length === 0 && e.durationTicks === tpb;
          const target = wholeBarRest
            ? measureX(layout, measure.index).x + layout.measureWidth / 2 - 6
            : tickToX(layout, e.startTick).x;
          tc.setX(target - base);
          note.setContext(ctx);
          notes.set(e, note);
        }
        const beams = groups.map((g) => new Beam(g.map((e) => notes.get(e)!)));
        for (const e of events) {
          const note = notes.get(e)!;
          const isRest = e.pitches.length === 0;
          const group = ctx.openGroup(isRest ? 'pp-rest' : 'pp-note', `pp-${e.id}`) as SVGGElement | undefined;
          note.draw();
          ctx.closeGroup();
          if (isRest) continue;
          noteX.set(e.id, note.getAbsoluteX());
          const stepIndex = stepByTick.get(e.startTick);
          if (group && stepIndex !== undefined) {
            const list = stepElements.get(stepIndex) ?? [];
            list.push(group);
            stepElements.set(stepIndex, list);
          }
          labelled.push({ note, event: e });
        }
        beams.forEach((b) => b.setContext(ctx).draw());
        ctx.closeGroup();
      });

      // Fingering: one row per staff, above the treble staff and below the bass staff.
      if (opts.showFingering && svg && labelLayer && labelled.some((l) => l.event.fingers)) {
        const above = clef === 'treble';
        const staveTop = staveBottom - 40;
        let rowY = above ? staveTop - 10 : staveBottom + 20;
        for (const { note } of labelled) {
          const ys = note.getYs();
          if (above) {
            rowY = Math.min(rowY, ...ys.map((y) => y - 12));
            if (note.hasStem() && note.getStemDirection() === Stem.UP) {
              const ext = note.getStemExtents();
              rowY = Math.min(rowY, ext.topY - 8, ext.baseY - 8);
            }
          } else {
            rowY = Math.max(rowY, ...ys.map((y) => y + 18));
            if (note.hasStem() && note.getStemDirection() === Stem.DOWN) {
              const ext = note.getStemExtents();
              rowY = Math.max(rowY, ext.topY + 14, ext.baseY + 14);
            }
          }
        }
        for (const { note, event } of labelled) {
          const f = event.fingers?.[0];
          if (f === undefined) continue;
          const cx = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
          addText(svg, labelLayer, cx, rowY, String(f), `pp-finger ${f === 1 ? 'is-thumb' : ''}`, stepByTick.get(event.startTick));
        }
      }

      // Note-name labels share one baseline per staff line, below stems, beams and ledger notes.
      if (showNames && svg && labelLayer && labelled.length) {
        let lowest = staveBottom + 8;
        for (const { note } of labelled) {
          lowest = Math.max(lowest, ...note.getYs().map((y) => y + 6));
          if (note.hasStem() && note.getStemDirection() === Stem.DOWN) {
            const ext = note.getStemExtents();
            lowest = Math.max(lowest, ext.topY, ext.baseY);
          }
        }
        let rowY = Math.max(staveBottom + 22, lowest + 14);
        if (clef === 'treble' && ex.staves.length > 1) rowY = Math.min(rowY, staveBottom + 40);
        for (const { note, event } of labelled) {
          const cx = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
          let y = rowY;
          for (const p of [...event.pitches].reverse()) {
            addText(svg, labelLayer, cx, y, pitchLabel(p), `pp-label pp-label-${HAND_CLEF[hand]}`, stepByTick.get(event.startTick));
            y += 12;
          }
        }
      }
    }
  }
  if (svg && labelLayer) svg.appendChild(labelLayer);
  if (svg && opts.placeholders) {
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'pp-placeholders');
    for (const step of ex.steps) {
      const { system, x } = tickToX(layout, step.tick);
      const clef = step.notes[0].hand === 'lh' ? 'bass' : 'treble';
      const y = (system.staveY[clef] ?? system.staveY[ex.staves[0]]!) + 60; // middle staff line
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'pp-placeholder');
      g.setAttribute('data-step', String(step.index));
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', String(x - 4));
      r.setAttribute('y', String(y - 13));
      r.setAttribute('width', '20');
      r.setAttribute('height', '26');
      r.setAttribute('rx', '6');
      g.appendChild(r);
      addText(svg, g, x + 6, y + 5, '?', 'pp-placeholder-mark');
      layer.appendChild(g);
    }
    svg.appendChild(layer);
  }
  return { layout, scale, svg, stepElements, noteX };
}
