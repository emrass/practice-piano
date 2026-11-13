import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Exercise } from '../../core/exercise';
import { useStore } from '../../lib/store';
import { systemForTick, tickToX } from '../notation/layout';
import { renderScore, type RenderedScore } from '../notation/renderScore';
import type { StepMark } from '../practice/PracticeController';
import type { Session } from '../practice/session';

const MARK_CLASSES: Record<StepMark, string> = {
  good: 'is-good',
  ok: 'is-ok',
  bad: 'is-bad',
  missed: 'is-missed',
};
const ALL_MARK_CLASSES = Object.values(MARK_CLASSES);

/**
 * VexFlow score + cursor / playhead overlay. The SVG is only re-engraved when the
 * exercise, width or label setting changes; per-note feedback is applied by toggling
 * classes, and the Flow playhead moves via requestAnimationFrame + transform.
 */
export function ScoreView(props: { exercise: Exercise; showNoteNames: boolean; controller: Session }) {
  const { exercise, showNoteNames, controller } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
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
        placeholders: controller.state.get().visibleSteps !== undefined,
      });
      renderedRef.current = rendered;
      setHeight(Math.round(rendered.layout.height * rendered.scale));
      setRenderError(null);
    } catch (err) {
      console.error(err);
      renderedRef.current = null;
      setRenderError(err instanceof Error ? err.message : String(err));
    }
  }, [exercise, width, viewHeight, showNoteNames, controller]);

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
    }
    r.svg?.querySelectorAll<SVGElement>('[data-step]').forEach((el) => {
      const hidden = Number(el.dataset.step) >= hiddenFrom;
      if (el.classList.contains('pp-placeholder')) el.classList.toggle('is-shown', hidden);
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
  }, [state.marks, state.stepIndex, state.status, state.mode, state.visibleSteps, exercise, width, viewHeight, showNoteNames, height]);

  // Wrong-note flash on the cursor.
  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor || !state.wrong) return;
    cursor.classList.remove('is-wrong');
    void cursor.offsetWidth; // restart the animation
    cursor.classList.add('is-wrong');
  }, [state.wrong]);

  // Flow-mode playhead: continuous motion at constant speed.
  useEffect(() => {
    const head = playheadRef.current;
    if (!head) return;
    if (state.mode !== 'flow' || (state.status !== 'countin' && state.status !== 'running')) {
      head.style.opacity = '0';
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
        head.style.transform = `translate(${(x + 5.5) * k - 1.5}px, ${system.bandTop * k}px)`;
        head.style.height = `${(system.bandBottom - system.bandTop) * k}px`;
        if (system.index !== lastSystem) {
          lastSystem = system.index;
          scrollRef.current?.scrollTo({ top: Math.max(0, system.top * k - 6), behavior: 'smooth' });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state.mode, state.status, controller, exercise]);

  return (
    <div className="score-scroll" ref={scrollRef}>
      <div className="score-canvas" style={{ height: height ?? undefined }}>
        <div className="score-host" ref={hostRef} />
        <div className="score-cursor" ref={cursorRef} aria-hidden="true" />
        <div className="score-playhead" ref={playheadRef} aria-hidden="true" />
        {renderError ? <div className="score-error">Could not engrave this exercise: {renderError}</div> : null}
      </div>
    </div>
  );
}
