import { describe, expect, it } from 'vitest';
import { generateExercise } from '../../core/generator/generator';
import type { ExerciseResult } from '../../core/eval/types';
import { InputBus } from '../../input/inputBus';
import type { AudioEngine } from '../../platform/audio/audioEngine';
import { PracticeController } from './PracticeController';

const fakeAudio = { ensure: () => null, click: () => {}, toContextTime: () => 0 } as unknown as AudioEngine;

function setup(mode: 'wait' | 'flow' = 'wait') {
  const exercise = generateExercise(
    { level: 20, hands: 'both', bars: 4, keyId: 'auto', timeSignature: 'auto', rhythmComplexity: 'auto', maxPolyphony: 'auto', bpm: null, keyboardSize: 88 },
    77,
  );
  const bus = new InputBus();
  const controller = new PracticeController(
    { exercise, mode, graceMs: 75, sustainCountsAsHeld: false, latencyMs: 0, playheadDelayMs: 0, metronomeVolume: 0, countInBars: 1 },
    bus,
    fakeAudio,
  );
  controller.attach();
  return { exercise, bus, controller };
}

describe('PracticeController (Wait mode)', () => {
  it('walks through the exercise from input bus events and reports a result', () => {
    const { exercise, bus, controller } = setup();
    const results: ExerciseResult[] = [];
    controller.finished.on((r) => results.push(r));
    expect(controller.state.get().status).toBe('running');
    expect(controller.state.get().expected).toEqual(exercise.steps[0].midis);

    let t = 0;
    bus.publish({ kind: 'noteOn', midi: 1, velocity: 80, time: (t += 100), source: 'qwerty' }); // wrong
    expect(controller.state.get().wrong?.midi).toBe(1);
    for (const step of exercise.steps) {
      t += 400;
      for (const m of step.midis) bus.publish({ kind: 'noteOn', midi: m, velocity: 80, time: t, source: 'screen' });
      for (const m of step.midis) bus.publish({ kind: 'noteOff', midi: m, time: t + 50, source: 'screen' });
    }
    const s = controller.state.get();
    expect(s.status).toBe('finished');
    expect(s.marks[0]).toBe('ok'); // had a wrong note
    expect(s.marks[1]).toBe('good');
    expect(results).toHaveLength(1);
    expect(results[0].wrongNotes).toBe(1);
    expect(results[0].exerciseId).toBe(exercise.id);
    controller.dispose();
  });

  it('restarts cleanly', () => {
    const { exercise, bus, controller } = setup();
    bus.publish({ kind: 'noteOn', midi: exercise.steps[0].midis[0], velocity: 80, time: 1, source: 'qwerty' });
    controller.start();
    expect(controller.state.get().stepIndex).toBe(0);
    expect(controller.state.get().live.correct).toBe(0);
    controller.dispose();
  });
});
