import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './audioEngine';

/** Just enough of an AudioContext for the engine: nodes record what was scheduled on them. */
class FakeContext {
  state: AudioContextState = 'suspended';
  onstatechange: (() => void) | null = null;
  currentTime = 0;
  resumeCalls = 0;
  closed = false;
  oscillators = 0;
  readonly destination = this.node();

  resume(): Promise<void> {
    this.resumeCalls++;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }

  /** What the system does: change the state and say so. */
  set(state: AudioContextState): void {
    this.state = state;
    this.onstatechange?.();
  }

  createGain() {
    return this.node();
  }

  createBiquadFilter() {
    return { ...this.node(), type: 'lowpass', frequency: param(), Q: param() };
  }

  createOscillator() {
    this.oscillators++;
    return { ...this.node(), type: 'sine', frequency: param(), start() {}, stop() {} };
  }

  private node() {
    const node = {
      context: this,
      gain: param(),
      connect: (target: unknown) => target,
      disconnect() {},
    };
    return node;
  }
}

function param() {
  return {
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
}

function setup() {
  const contexts: FakeContext[] = [];
  let clock = 1000;
  const lines: string[] = [];
  const engine = new AudioEngine({
    createContext: () => {
      const ctx = new FakeContext();
      contexts.push(ctx);
      return ctx as unknown as AudioContext;
    },
    now: () => clock,
    log: (m) => lines.push(m),
  });
  return {
    engine,
    contexts,
    lines,
    current: () => contexts[contexts.length - 1],
    advance: (ms: number) => (clock += ms),
    at: () => clock,
  };
}

/** Creates the context and lets it start running, as after the first tap. */
function started() {
  const t = setup();
  t.engine.ensure();
  t.current().set('running');
  return t;
}

describe('AudioEngine recovery', () => {
  it('asks a new context to run and reports it unlocked once it does', () => {
    const t = setup();
    expect(t.engine.isRunning).toBe(false);
    t.engine.ensure();
    expect(t.contexts).toHaveLength(1);
    expect(t.current().resumeCalls).toBe(1);
    t.current().set('running');
    expect(t.engine.isRunning).toBe(true);
  });

  it('resumes right away when the system interrupts or suspends the context', () => {
    const t = started();
    t.current().set('interrupted');
    expect(t.current().resumeCalls).toBe(2);
    t.current().set('running');
    t.current().set('suspended');
    expect(t.current().resumeCalls).toBe(3);
    expect(t.lines).toContain('context interrupted');
    expect(t.lines).toContain('resuming from suspended');
  });

  it('resumes an interrupted context before a click, not only a suspended one', () => {
    const t = started();
    t.current().onstatechange = null; // as if the state changed without an event
    t.current().state = 'interrupted';
    const before = t.current().resumeCalls;
    t.engine.click(t.at(), true, 0.7);
    expect(t.current().resumeCalls).toBe(before + 1);
  });

  it('keeps treating audio as unlocked while it is brought back', () => {
    const t = started();
    t.current().set('interrupted');
    expect(t.engine.isRunning).toBe(true);
  });

  it('plays a click into a running context', () => {
    const t = started();
    t.engine.click(t.at(), false, 0.7);
    expect(t.current().oscillators).toBe(1);
  });

  it('drops clicks into a context that has not come back for a while, so they cannot pile up', () => {
    const t = started();
    t.current().set('interrupted');
    t.advance(1000);
    t.engine.click(t.at(), false, 0.7);
    expect(t.current().oscillators).toBe(0);
    expect(t.contexts).toHaveLength(1);
  });

  it('builds a new context when a resume does not take, and plays into it', () => {
    const t = started();
    const first = t.current();
    first.set('interrupted');
    t.advance(2000);
    t.engine.click(t.at(), true, 0.7);
    expect(t.contexts).toHaveLength(2);
    expect(first.closed).toBe(true);
    expect(t.current().resumeCalls).toBe(1);
    // A fresh resume: the click goes in and sounds once the context runs.
    expect(t.current().oscillators).toBe(1);
    expect(t.lines.some((l) => l.startsWith('new context (still interrupted'))).toBe(true);
  });

  it('builds new contexts at most every 5 s, so a long interruption cannot loop', () => {
    const t = started();
    t.current().set('interrupted');
    t.advance(2000);
    t.engine.click(t.at(), true, 0.7);
    expect(t.contexts).toHaveLength(2);
    t.current().set('interrupted');
    t.advance(2000);
    t.engine.click(t.at(), true, 0.7);
    expect(t.contexts).toHaveLength(2);
    t.advance(3500);
    t.engine.click(t.at(), true, 0.7);
    expect(t.contexts).toHaveLength(3);
  });

  it('ignores state changes of a context it replaced', () => {
    const t = started();
    const first = t.current();
    first.set('interrupted');
    t.advance(2000);
    t.engine.ensure();
    const calls = first.resumeCalls;
    first.onstatechange?.();
    expect(first.resumeCalls).toBe(calls);
  });

  it('does not rebuild a context that never ran (it waits for a tap in a browser)', () => {
    const t = setup();
    t.engine.ensure();
    t.advance(10_000);
    t.engine.ensure();
    expect(t.contexts).toHaveLength(1);
  });

  it('replaces a closed context', () => {
    const t = started();
    t.current().state = 'closed';
    t.engine.ensure();
    expect(t.contexts).toHaveLength(2);
  });

  it('does not play a passage into a bus of the context it replaced', () => {
    const t = started();
    const stop = t.engine.playSequence([{ at: 0, dur: 500, midis: [60] }], t.at());
    expect(t.current().oscillators).toBe(4); // the voice's partials
    t.current().set('interrupted');
    t.advance(2000);
    expect(() => t.engine.playNotes([62], t.at(), 500, 0.8, undefined)).not.toThrow();
    expect(t.contexts).toHaveLength(2);
    expect(() => stop()).not.toThrow();
  });
});

describe('AudioEngine and the native audio session', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resumes when an interruption ends, the route changes or the app is active again', () => {
    for (const event of ['interruptionEnded', 'routeChanged', 'becameActive'] as const) {
      const t = started();
      t.current().onstatechange = null;
      t.current().state = 'suspended';
      const before = t.current().resumeCalls;
      t.engine.handleNativeEvent(event);
      expect(t.current().resumeCalls).toBe(before + 1);
      expect(t.lines).toContain(`native: ${event}, context suspended`);
    }
  });

  it('waits out an interruption that has just begun', () => {
    const t = started();
    t.engine.handleNativeEvent('interruptionBegan');
    expect(t.current().resumeCalls).toBe(1);
  });

  it('builds one new context once the output settles, though the old one says running', () => {
    vi.useFakeTimers();
    const t = started();
    // The piano's Bluetooth audio comes along with MIDI and leaves again (#82).
    t.engine.handleNativeEvent('outputChanged');
    vi.advanceTimersByTime(200);
    t.engine.handleNativeEvent('outputChanged');
    vi.advanceTimersByTime(499);
    expect(t.contexts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.contexts).toHaveLength(2);
    expect(t.contexts[0].closed).toBe(true);
    expect(t.lines).toContain('new context (the audio output changed), suspended');
  });

  it('builds a new context when the app comes back from an interruption that never ended', () => {
    vi.useFakeTimers();
    const t = started();
    t.engine.handleNativeEvent('interruptionBegan');
    t.engine.handleNativeEvent('becameActive');
    vi.advanceTimersByTime(500);
    expect(t.contexts).toHaveLength(2);
    // Once is enough: the next return to the app finds nothing pending.
    t.current().set('running');
    t.engine.handleNativeEvent('becameActive');
    vi.advanceTimersByTime(500);
    expect(t.contexts).toHaveLength(2);
  });

  it('keeps the context when an interruption ended normally', () => {
    vi.useFakeTimers();
    const t = started();
    t.engine.handleNativeEvent('interruptionBegan');
    t.engine.handleNativeEvent('interruptionEnded');
    t.engine.handleNativeEvent('becameActive');
    vi.advanceTimersByTime(1000);
    expect(t.contexts).toHaveLength(1);
  });

  it('ends up with a fresh context after the sequence logged on the iPad in #82', () => {
    vi.useFakeTimers();
    const t = started();
    for (const event of ['outputChanged', 'outputChanged', 'interruptionBegan', 'becameActive', 'interruptionBegan', 'becameActive'] as const) {
      t.engine.handleNativeEvent(event);
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(500);
    expect(t.contexts).toHaveLength(2);
    t.current().set('running');
    t.engine.click(t.at(), true, 0.7);
    expect(t.current().oscillators).toBe(1);
  });

  it('builds a new context when media services were reset', () => {
    const t = started();
    t.engine.handleNativeEvent('mediaServicesReset');
    expect(t.contexts).toHaveLength(2);
  });

  it('never creates the first context from a native event (that needs a tap in a browser)', () => {
    const t = setup();
    t.engine.handleNativeEvent('becameActive');
    t.engine.handleVisible();
    t.engine.click(t.at(), true, 0.7);
    expect(t.contexts).toHaveLength(0);
  });
});
