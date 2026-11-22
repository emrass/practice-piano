import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Exercise } from '../../core/exercise';
import { useStore } from '../../lib/store';
import { coverBoxes, PLAYHEAD_OFFSET_PX, type ScoreLayout, systemForTick, tickToX } from '../notation/layout';
import { drawStepMark, renderScore, type RenderedScore } from '../notation/renderScore';
import type { StepMark } from '../practice/session';
import type { Session } from '../practice/session';

const MARK_CLASSES: Record<StepMark, string> = {
  good: 'is-good',
  ok: 'is-ok',
  bad: 'is-bad',
  missed: 'is-missed',
  call: 'is-call',
};
const ALL_MARK_CLASSES = Object.values(MARK_CLASSES);

/**
 * VexFlow score + cursor / playhead overlay. The SVG is only re-engraved when the
 * exercise, width or label setting changes; per-note feedback is applied by toggling
 * classes, and the Flow playhead moves via requestAnimationFrame + transform.
 */
export function ScoreView(props: {
  exercise: Exercise;
  showNoteNames: boolean;
  controller: Session;
  showFingering?: boolean;
  /** Flow: ticks of music just ahead of the playhead to cover (read-ahead training). */
  coverTicks?: number;
}) {
  const { exercise, showNoteNames, controller } = props;
  const coverTicks = props.coverTicks ?? 0;
  const showFingering = props.showFingering ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const coverRefs = useRef<(HTMLDivElement | null)[]>([]);
  const renderedRef = useRef<RenderedScore | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height: viewHeight } = size;
  const [height, setHeight] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const state = useStore(controller.state);

  // Track available width (ignore sub-pixel jitter).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      setSize((prev) => (Math.abs(prev.width - w) >= 8 || Math.abs(prev.height - h) >= 8 ? { width: w, height: h } : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Engrave.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || width < 100) return;
    try {
      const rendered = renderScore(host, exercise, {
        width,
        height: viewHeight,
        showNoteNames,
        placeholders: 'ear' in exercise,
        showFingering,
      });
      renderedRef.current = rendered;
      setHeight(Math.round(rendered.layout.height * rendered.scale));
      setRenderError(null);
    } catch (err) {
      console.error(err);
      renderedRef.current = null;
      setRenderError(err instanceof Error ? err.message : String(err));
    }
  }, [exercise, width, viewHeight, showNoteNames, showFingering, controller]);

  // Per-step feedback classes + current-step cursor (Wait mode).
  useLayoutEffect(() => {
    const r = renderedRef.current;
    if (!r) return;
    const hiddenFrom = state.visibleSteps ?? Infinity;
    const cursorMode = state.mode === 'wait' || state.mode === 'ear';
    for (const [index, groups] of r.stepElements) {
      const mark = state.marks[index];
      const current = state.status !== 'finished' && index === state.stepIndex && cursorMode;
      for (const g of groups) {
        g.classList.remove(...ALL_MARK_CLASSES);
        if (mark) g.classList.add(MARK_CLASSES[mark]);
        g.classList.toggle('is-current', current);
        g.classList.toggle('is-hidden', index >= hiddenFrom);
      }
      // The second cue under the note, from the same state as its color.
      for (const el of r.stepMarks.get(index) ?? []) drawStepMark(el, mark);
    }
    const barsFrom = state.visibleBars ?? Infinity;
    r.svg?.querySelectorAll<SVGElement>('[data-measure]').forEach((el) => {
      el.classList.toggle('is-hidden', Number(el.dataset.measure) >= barsFrom);
    });
    r.svg?.querySelectorAll<SVGElement>('[data-step]').forEach((el) => {
      const hidden = Number(el.dataset.step) >= hiddenFrom;
      if (el.classList.contains('score-placeholder')) el.classList.toggle('is-shown', hidden);
      else el.classList.toggle('is-hidden', hidden);
    });
    const cursor = cursorRef.current;
    if (!cursor) return;
    const step = exercise.steps[state.stepIndex];
    if ((state.mode !== 'wait' && state.mode !== 'ear') || !step || state.status === 'finished') {
      cursor.style.opacity = '0';
      return;
    }
    const { system, x } = tickToX(r.layout, step.tick);
    const k = r.scale;
    cursor.style.opacity = '1';
    cursor.style.width = `${Math.round(30 * k)}px`;
    cursor.style.transform = `translate(${(x - 9) * k}px, ${system.bandTop * k}px)`;
    cursor.style.height = `${(system.bandBottom - system.bandTop) * k}px`;
    // Keep the active system in view.
    const scroller = scrollRef.current;
    if (scroller) {
      const top = system.top * k;
      const bottom = (system.top + system.height) * k;
      if (top < scroller.scrollTop || bottom > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTo({ top: Math.max(0, top - 6), behavior: 'smooth' });
      }
    }
  }, [state.marks, state.stepIndex, state.status, state.mode, state.visibleSteps, state.visibleBars, exercise, width, viewHeight, showNoteNames, height]);

  // A wrong note turns the cursor red and shakes it once, for as long as the practice bar says so.
  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    cursor.classList.remove('is-wrong');
    if (!state.wrong) return;
    void cursor.offsetWidth; // restart the animation
    cursor.classList.add('is-wrong');
  }, [state.wrong]);

  // Flow-mode playhead: continuous motion at constant speed.
  useEffect(() => {
    const head = playheadRef.current;
    if (!head) return;
    const covers = coverRefs.current.filter((c): c is HTMLDivElement => !!c);
    const hideCovers = () => covers.forEach((c) => (c.style.opacity = '0'));
    if (state.mode !== 'flow' || (state.status !== 'countin' && state.status !== 'running')) {
      head.style.opacity = '0';
      hideCovers();
      // A fresh (or stopped) Flow run starts from the top.
      if (state.mode === 'flow' && state.status === 'ready') scrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    let raf = 0;
    let lastSystem = -1;
    const frame = () => {
      const r = renderedRef.current;
      const tick = controller.playheadTick();
      if (r && tick !== null) {
        const clamped = Math.max(0, Math.min(tick, exercise.totalTicks));
        const system = systemForTick(r.layout, clamped >= exercise.totalTicks ? exercise.totalTicks - 1 : clamped);
        const local = clamped - system.startTick;
        const x = system.measuresX + r.layout.leadPx + local * r.layout.pxPerTick;
        const k = r.scale;
        head.style.opacity = tick < 0 ? '0.45' : '1';
        head.style.transform = `translate(${(x + PLAYHEAD_OFFSET_PX) * k - 1.5}px, ${system.bandTop * k}px)`;
        head.style.height = `${(system.bandBottom - system.bandTop) * k}px`;
        // The cover shows from the first beat on: the count-in is for reading the opening.
        if (coverTicks > 0 && tick >= 0) placeCovers(covers, r.layout, r.scale, clamped, coverTicks);
        else hideCovers();
        if (system.index !== lastSystem) {
          lastSystem = system.index;
          scrollRef.current?.scrollTo({ top: Math.max(0, system.top * k - 6), behavior: 'smooth' });
        }
      } else {
        head.style.opacity = '0'; // e.g. Rhythm Pulse: no visual metronome in silent bars
        hideCovers();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state.mode, state.status, controller, exercise, coverTicks]);

  return (
    <div className="score-scroll" ref={scrollRef}>
      <div className="score-canvas" style={{ height: height ?? undefined }}>
        <div className="score-host" ref={hostRef} />
        <div className="score-cursor" ref={cursorRef} aria-hidden="true" />
        <div className="score-cover" ref={(el) => void (coverRefs.current[0] = el)} aria-hidden="true" />
        <div className="score-cover" ref={(el) => void (coverRefs.current[1] = el)} aria-hidden="true" />
        <div className="score-playhead" ref={playheadRef} aria-hidden="true" />
        {renderError ? <div className="score-error">Could not engrave this exercise: {renderError}</div> : null}
      </div>
    </div>
  );
}

/** Places the read-ahead cover's boxes (one, or two across a line break); unused ones hide. */
function placeCovers(covers: HTMLDivElement[], layout: ScoreLayout, k: number, tick: number, span: number) {
  const boxes = coverBoxes(layout, tick, span);
  covers.forEach((c, i) => {
    const b = boxes[i];
    if (!b) {
      c.style.opacity = '0';
      return;
    }
    c.style.opacity = '1';
    c.style.transform = `translate(${b.left * k}px, ${b.top * k}px)`;
    c.style.width = `${(b.right - b.left) * k}px`;
    c.style.height = `${b.height * k}px`;
    // The staff and its bar lines run on through the cover: only the notes dissolve.
    const line = 'linear-gradient(var(--score-staff), var(--score-staff))';
    const w = Math.max(1, k);
    // Bar lines go from the top line to the bottom line of each staff (five lines a staff).
    const staffTops = b.staffLines.filter((_, i) => i % 5 === 0);
    const staffHeight = (b.staffLines[4] - b.staffLines[0]) * k + w;
    const layers = [
      ...b.staffLines.map((y) => ({ size: `100% ${w}px`, pos: `0 ${(y - b.top) * k - w / 2}px` })),
      ...staffTops.flatMap((y) => b.barLines.map((x) => ({ size: `${w}px ${staffHeight}px`, pos: `${(x - b.left) * k - w / 2}px ${(y - b.top) * k - w / 2}px` }))),
    ];
    c.style.backgroundImage = layers.map(() => line).join(',');
    c.style.backgroundSize = layers.map((l) => l.size).join(',');
    c.style.backgroundPosition = layers.map((l) => l.pos).join(',');
  });
}
