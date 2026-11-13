import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateEarExercise } from '../../core/ear/generator';
import type { ExerciseResult } from '../../core/eval/types';
import { InputBus } from '../../input/inputBus';
import type { AudioEngine } from '../../platform/audio/audioEngine';
import { EarController } from './EarController';

function setup(level = 15, reference: 'auto' | 'key-only' = 'auto') {
  vi.useFakeTimers();
  const played: unknown[] = [];
  const audio = { playSequence: (events: unknown[]) => (played.push(events), () => played.push('stop')) } as unknown as AudioEngine;
  const exercise = generateEarExercise({ level, length: 'auto', reference, keyId: 'auto' }, 21);
  const bus = new InputBus();
  const c = new EarController({ exercise, graceMs: 75, sustainCountsAsHeld: false, volume: 0.8 }, bus, audio);
  c.attach();
  const press = (m: number) => {
    bus.publish({ kind: 'noteOn', midi: m, velocity: 80, time: performance.now(), source: 'midi' });
    bus.publish({ kind: 'noteOff', midi: m, time: performance.now(), source: 'midi' });
  };
  const listenFully = () => {
    c.start();
    vi.advanceTimersByTime(exercise.ear.totalMs + 200);
  };
  return { c, exercise, press, played, listenFully };
}

afterEach(() => vi.useRealTimers());

describe('EarController', () => {
  it('shows only the given first note, ignores input until the phrase has played', () => {
    const { c, exercise, press, played } = setup();
    expect(c.state.get().visibleSteps).toBe(1);
    expect(c.state.get().revealed).toEqual(exercise.steps[0].midis);
    press(exercise.steps[0].midis[0]); // before listening
    expect(c.state.get().stepIndex).toBe(0);
    c.start();
    expect(played).toHaveLength(1);
    expect(c.isActive).toBe(true);
    press(exercise.steps[0].midis[0]); // while playing
    expect(c.state.get().live.wrong + c.state.get().live.correct).toBe(0);
  });

  it('reveals notes as they are found, counts replays and hints, and reports an ear result', () => {
    const { c, exercise, press, listenFully } = setup();
    const results: ExerciseResult[] = [];
    c.finished.on((r) => results.push(r));
    listenFully();
    listenFully(); // one replay
    press(exercise.steps[0].midis[0]);
    expect(c.state.get().visibleSteps).toBe(1);
    expect(c.state.get().revealed).toEqual([]); // next note stays secret
    press(1); // a wrong guess
    c.hint();
    expect(c.state.get().revealed).toEqual(exercise.steps[1].midis);
    expect(c.state.get().visibleSteps).toBe(2);
    for (const step of exercise.steps.slice(1)) step.midis.forEach(press);
    const s = c.state.get();
    expect(s.status).toBe('finished');
    expect(s.visibleSteps).toBe(exercise.steps.length);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ lesson: 'ear', mode: 'ear', replays: 1, hints: 1, wrongNotes: 1 });
    expect(results[0].pitchAccuracy).toBeLessThan(1);
    c.dispose();
  });

  it('hides the first note in key-only mode and plays the cadence', () => {
    const { c, exercise } = setup(85, 'key-only');
    expect(c.state.get().visibleSteps).toBe(0);
    expect(c.state.get().revealed).toEqual([]);
    expect(exercise.ear.cadence.length).toBe(4);
  });
});
