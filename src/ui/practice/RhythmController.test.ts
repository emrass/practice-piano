import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseResult } from '../../core/eval/types';
import { generateRhythmExercise, type RhythmSettings } from '../../core/rhythm/generator';
import { InputBus } from '../../input/inputBus';
import type { AudioEngine } from '../../platform/audio/audioEngine';
import { RhythmController } from './RhythmController';

let now = 0;
const played: { at: number; midis: readonly number[] }[][] = [];
const fakeAudio = {
  ensure: () => null,
  click: () => {},
  playSequence: (events: { at: number; midis: readonly number[] }[]) => {
    played.push(events);
    return () => {};
  },
} as unknown as AudioEngine;

const SETTINGS: RhythmSettings = {
  level: 20,
  task: 'read',
  hands: 'rh',
  texture: 'auto',
  bars: 4,
  timeSignature: '4/4',
  bpm: 100,
  rhKey: 72,
  lhKey: 48,
};

function setup(over: Partial<RhythmSettings>) {
  const exercise = generateRhythmExercise({ ...SETTINGS, ...over }, 11);
  const bus = new InputBus();
  const controller = new RhythmController(
    { exercise, latencyMs: 0, playheadDelayMs: 0, metronomeVolume: 0, countInBars: 1, synthVolume: 0.5 },
    bus,
    fakeAudio,
  );
  controller.attach();
  const results: ExerciseResult[] = [];
  controller.finished.on((r) => results.push(r));
  const tick = (controller as unknown as { loop: () => void }).loop;
  return { exercise, bus, controller, results, frame: () => tick() };
}

beforeEach(() => {
  now = 1000;
  played.length = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RhythmController', () => {
  it('judges the designated key on time and ignores other keys', () => {
    const { exercise, bus, controller, results, frame } = setup({ task: 'read' });
    controller.start();
    const t0 = controller.playheadTick()! * -controller.msPerTick + now; // start time of bar 1
    // A stray key flashes but is not counted.
    now = t0 + 10;
    bus.publish({ kind: 'noteOn', midi: 60, velocity: 80, time: now, source: 'midi' });
    expect(controller.state.get().wrong?.midi).toBe(60);
    for (const step of exercise.steps) {
      now = t0 + step.tick * controller.msPerTick + 12;
      frame();
      bus.publish({ kind: 'noteOn', midi: 72, velocity: 80, time: now, source: 'midi' });
      bus.publish({ kind: 'noteOff', midi: 72, time: now + 20, source: 'midi' });
    }
    now = t0 + exercise.totalTicks * controller.msPerTick + 1000;
    frame();
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.lesson).toBe('rhythm');
    expect(r.wrongNotes).toBe(0);
    expect(r.pitchAccuracy).toBe(1);
    expect(r.rhythm?.tendencyMs).toBe(12);
    expect(r.notes.every((n) => n.figure && n.beat)).toBe(true);
  });

  it('echo: plays the calls, ignores tapping along, judges answers and reveals bars', () => {
    const { exercise, bus, controller, results, frame } = setup({ task: 'echo' });
    expect(controller.state.get().visibleBars).toBe(0);
    controller.start();
    const t0 = controller.playheadTick()! * -controller.msPerTick + now;
    expect(played).toHaveLength(1);
    const callNotes = exercise.steps.filter((s) => exercise.rhythm.callBars.includes(s.measureIndex));
    expect(played[0]).toHaveLength(callNotes.length);
    const tpb = exercise.timeSignature.ticksPerBar;
    for (const step of exercise.steps) {
      now = t0 + step.tick * controller.msPerTick;
      frame();
      const isCall = exercise.rhythm.callBars.includes(step.measureIndex);
      expect(controller.state.get().rhythm?.phase).toBe(isCall ? 'call' : 'response');
      bus.publish({ kind: 'noteOn', midi: 72, velocity: 80, time: now, source: 'midi' }); // tap along / answer
    }
    // After the first answer the first pair is visible.
    now = t0 + (2 * tpb + 2) * controller.msPerTick;
    frame();
    expect(controller.state.get().visibleBars).toBeGreaterThanOrEqual(2);
    now = t0 + exercise.totalTicks * controller.msPerTick + 1000;
    frame();
    expect(results).toHaveLength(1);
    expect(results[0].totalNotes).toBe(exercise.steps.length - callNotes.length);
    expect(results[0].wrongNotes).toBe(0); // tapping along with the calls is not an error
    expect(results[0].pitchAccuracy).toBe(1);
    expect(controller.state.get().visibleBars).toBeUndefined();
  });

  it('pulse: hides the playhead and the beat in silent bars', () => {
    const { exercise, controller, frame } = setup({ task: 'pulse', level: 10 });
    expect(exercise.rhythm.mutedBars).toEqual([2, 3]);
    controller.start();
    const t0 = controller.playheadTick()! * -controller.msPerTick + now;
    const tpb = exercise.timeSignature.ticksPerBar;
    now = t0 + (tpb + 1) * controller.msPerTick;
    frame();
    expect(controller.playheadTick()).not.toBeNull();
    expect(controller.state.get().rhythm?.phase).toBe('click');
    now = t0 + (2 * tpb + 1) * controller.msPerTick;
    frame();
    expect(controller.playheadTick()).toBeNull();
    expect(controller.state.get().beat).toBeNull();
    expect(controller.state.get().expected).toEqual([]);
    expect(controller.state.get().rhythm?.phase).toBe('silent');
  });
});
