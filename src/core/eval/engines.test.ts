import { describe, expect, it } from 'vitest';
import { buildSteps, type Measure, type NoteEvent } from '../exercise';
import { makePitch } from '../music/pitch';
import { FlowEngine, timingGrade, timingScore, timingWindows } from './flowEngine';
import { WaitEngine } from './waitEngine';

const ctx = { exerciseId: 'x', level: 10, tierId: 't04', completedAt: 0 };

function ev(hand: 'rh' | 'lh', startTick: number, durationTicks: number, midis: [string, number][]): NoteEvent {
  return {
    id: `${hand}-${startTick}`,
    hand,
    startTick,
    durationTicks,
    measureIndex: Math.floor(startTick / 16),
    pitches: midis.map(([l, o]) => makePitch(l as 'C', 0, o)),
  };
}

/** Bar 1: RH C4 E4 | chord C4-E4-G4 (quarter each) + LH C3 under the chord. */
function fixture(): Measure[] {
  return [
    {
      index: 0,
      startTick: 0,
      rh: [
        ev('rh', 0, 4, [['C', 4]]),
        ev('rh', 4, 4, [['E', 4]]),
        ev('rh', 8, 8, [
          ['C', 4],
          ['E', 4],
          ['G', 4],
        ]),
      ],
      lh: [ev('lh', 0, 8, [['C', 3]]), ev('lh', 8, 8, [['C', 3]])],
    },
  ];
}

describe('WaitEngine', () => {
  const opts = { graceMs: 75, sustainCountsAsHeld: false };

  it('waits for every note of a step, merging both hands', () => {
    const e = new WaitEngine(buildSteps(fixture()), opts);
    e.start(0);
    e.noteOn(60, 100);
    expect(e.stepIndex).toBe(0); // LH C3 still missing
    const fb = e.noteOn(48, 120);
    expect(fb.some((f) => f.type === 'advance')).toBe(true);
    expect(e.stepIndex).toBe(1);
  });

  it('penalises wrong notes without advancing', () => {
    const e = new WaitEngine(buildSteps(fixture()), opts);
    e.start(0);
    const fb = e.noteOn(62, 50);
    expect(fb).toEqual([{ type: 'wrong', midi: 62, stepIndex: 0 }]);
    expect(e.stepIndex).toBe(0);
    expect(e.liveStats().streak).toBe(0);
    expect(e.liveStats().wrong).toBe(1);
  });

  it('accepts a slightly rolled chord within the grace window even if keys are released', () => {
    const e = new WaitEngine(buildSteps(fixture()), opts);
    e.start(0);
    e.noteOn(60, 0);
    e.noteOn(48, 0);
    e.noteOn(64, 500); // step 1
    expect(e.stepIndex).toBe(2);
    // Staccato roll: each key released immediately, all within 75 ms.
    for (const [m, t] of [
      [60, 1000],
      [64, 1030],
      [48, 1050],
    ]) {
      e.noteOn(m, t);
      e.noteOff(m, t + 5);
    }
    e.noteOn(67, 1070);
    expect(e.done).toBe(true);
  });

  it('rejects a released chord note that is outside the grace window', () => {
    const steps = buildSteps(fixture());
    const e = new WaitEngine(steps, opts);
    e.start(0);
    e.noteOn(60, 0);
    e.noteOn(48, 0);
    e.noteOn(64, 100);
    e.noteOn(60, 1000);
    e.noteOff(60, 1010);
    e.noteOn(64, 1300);
    e.noteOn(67, 1310);
    e.noteOn(48, 1320);
    expect(e.stepIndex).toBe(2); // C4 was released 300 ms earlier
    e.noteOn(60, 1330);
    expect(e.done).toBe(true);
  });

  it('treats sustained keys as held only when configured', () => {
    const run = (sustainCountsAsHeld: boolean) => {
      const e = new WaitEngine(buildSteps(fixture()), { graceMs: 75, sustainCountsAsHeld });
      e.start(0);
      e.noteOn(60, 0);
      e.noteOn(48, 0);
      e.noteOn(64, 100);
      e.setSustain(true, 900);
      e.noteOn(60, 1000);
      e.noteOff(60, 1010);
      e.noteOn(64, 1500);
      e.noteOn(67, 1500);
      e.noteOn(48, 1500);
      return e.done;
    };
    expect(run(true)).toBe(true);
    expect(run(false)).toBe(false);
  });

  it('counts hinted (assisted) steps as not found unaided', () => {
    const e = new WaitEngine(buildSteps(fixture()), opts);
    e.start(0);
    e.assist();
    e.assist(); // a second hint on the same step changes nothing
    e.noteOn(60, 10);
    e.noteOn(48, 10);
    e.noteOn(64, 200);
    [60, 64, 67, 48].forEach((m) => e.noteOn(m, 400));
    const r = e.result(ctx);
    expect(r.hints).toBe(1);
    expect(r.pitchAccuracy).toBeCloseTo(5 / 7);
    expect(r.notes.filter((n) => n.step === 0).every((n) => !n.correct)).toBe(true);
  });

  it('produces accuracy, reaction times and per-note results', () => {
    const e = new WaitEngine(buildSteps(fixture()), opts);
    e.start(0);
    e.noteOn(60, 10);
    e.noteOn(48, 20);
    e.noteOn(65, 300); // wrong
    e.noteOn(64, 500);
    [60, 64, 67, 48].forEach((m) => e.noteOn(m, 1500));
    const r = e.result(ctx);
    expect(r.totalSteps).toBe(3);
    expect(r.wrongNotes).toBe(1);
    expect(r.pitchAccuracy).toBeCloseTo(7 / 8);
    expect(r.cleanSteps).toBe(2);
    expect(r.medianReactionMs).toBe(740); // steps 2 & 3: 480 ms and 1000 ms
    expect(r.notes.find((n) => n.midi === 64 && n.reactionMs === 480)?.correct).toBe(false);
    expect(r.notes.filter((n) => n.clef === 'bass')).toHaveLength(2);
  });
});

describe('FlowEngine', () => {
  // 120 bpm quarter = 500 ms → 125 ms per tick.
  const msPerTick = 125;

  function engine(latencyMs = 0, sustainCountsAsHeld = false) {
    const e = new FlowEngine(buildSteps(fixture()), { msPerTick, latencyMs, sustainCountsAsHeld });
    e.setStartTime(1000);
    return e;
  }

  it('scales timing windows with tempo', () => {
    const slow = timingWindows(250);
    const fast = timingWindows(60);
    expect(slow.hitMs).toBeGreaterThan(fast.hitMs);
    expect(timingScore(0, slow)).toBe(1);
    expect(timingScore(slow.hitMs + 1, slow)).toBe(0);
    expect(timingGrade(-slow.hitMs + 5, slow)).toBe('early');
  });

  it('matches notes to the nearest beat and grades timing', () => {
    const e = engine();
    const [hit] = e.noteOn(60, 1010);
    expect(hit).toMatchObject({ type: 'hit', grade: 'perfect' });
    const [late] = e.noteOn(64, 1500 + 200);
    expect(late.type).toBe('hit');
    if (late.type === 'hit') expect(late.deltaMs).toBe(200);
  });

  it('counts extra and missed notes', () => {
    const e = engine();
    expect(e.noteOn(71, 1000)[0].type).toBe('extra');
    const misses = e.update(1000 + 4000);
    expect(misses.filter((m) => m.type === 'miss')).toHaveLength(7);
    expect(e.isFinished(6000)).toBe(true);
    const r = e.result(ctx);
    expect(r.pitchAccuracy).toBe(0);
    expect(r.missedNotes).toBe(7);
    expect(r.wrongNotes).toBe(1);
  });

  it('keeps running until the last note has sounded for its full value', () => {
    // The final chord starts at tick 8 (2000 ms) and lasts a half note (until 3000 ms).
    const e = engine();
    for (const [midi, t] of [[60, 1000], [48, 1000], [64, 1500], [60, 2000], [64, 2000], [67, 2000], [48, 2000]]) e.noteOn(midi, t);
    e.update(2400);
    expect(e.isFinished(2400)).toBe(false);
    expect(e.isFinished(2999)).toBe(false);
    expect(e.isFinished(3001)).toBe(true);
  });

  it('runs to the end of the exercise when it ends in rests', () => {
    const e = new FlowEngine(buildSteps(fixture()), { msPerTick, latencyMs: 0, sustainCountsAsHeld: false, endTick: 32 });
    e.setStartTime(1000);
    e.update(3500);
    expect(e.isFinished(3500)).toBe(false);
    expect(e.isFinished(1000 + 32 * msPerTick + 1)).toBe(true);
  });

  it('never ends before the last onset can still be hit late', () => {
    const e = new FlowEngine(buildSteps(fixture()), { msPerTick, latencyMs: 0, sustainCountsAsHeld: false, endTick: 8 });
    e.setStartTime(1000);
    expect(e.endTime).toBe(2000 + e.timing.hitMs);
  });

  it('honours latency compensation', () => {
    const plain = engine(0);
    const compensated = engine(180);
    const a = plain.noteOn(60, 1180)[0];
    const b = compensated.noteOn(60, 1180)[0];
    expect(a.type === 'hit' && a.grade).not.toBe('perfect');
    expect(b.type === 'hit' && b.grade).toBe('perfect');
  });

  it('a perfect run scores 100 %', () => {
    const e = engine();
    const plays: [number, number][] = [
      [60, 1000],
      [48, 1000],
      [64, 1500],
      [60, 2000],
      [64, 2000],
      [67, 2000],
      [48, 2000],
    ];
    for (const [m, t] of plays) e.noteOn(m, t);
    e.update(4000);
    const r = e.result(ctx);
    expect(r.pitchAccuracy).toBe(1);
    expect(r.timingAccuracy).toBe(1);
    expect(r.cleanSteps).toBe(3);
  });

  it('flags clipped notes unless the sustain pedal holds them (when enabled)', () => {
    const run = (sustainCountsAsHeld: boolean) => {
      const e = engine(0, sustainCountsAsHeld);
      e.setSustain(true, 900);
      e.noteOn(48, 1000); // half note = 1000 ms
      const off = e.noteOff(48, 1100);
      const up = e.setSustain(false, 2000);
      return [...off, ...up].some((f) => f.type === 'early-release');
    };
    expect(run(false)).toBe(true);
    expect(run(true)).toBe(false);
  });
});
