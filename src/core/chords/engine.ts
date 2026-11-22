import type { ChordTarget } from './generator';

/**
 * Chord judging. Read from the staff, a chord is right when exactly the written keys are down:
 * which hand plays which key does not matter (MIDI cannot tell). Read from a symbol, it is right
 * when the keys sounding together have exactly its pitch classes (any octave, any doubling) and,
 * where asked, the right note in the bass; other voicing choices are the player's.
 */
const pc = (m: number) => ((m % 12) + 12) % 12;

export interface ChordJudgment {
  index: number;
  correct: boolean;
  /** Wait: time from the chord being asked to it being played. */
  reactionMs?: number;
  /** Flow: average onset against the chord's beat (+ = late). */
  deltaMs?: number;
  /** Flow: time between the first and last key of the chord. */
  spreadMs?: number;
  timingScore?: number;
  /** Keys that made up the answer, low to high. */
  played: number[];
  /** Wrong keys pressed while this chord was asked (Wait). */
  wrongPresses: number;
  /** The right notes were down with the wrong one in the bass. */
  wrongBass: boolean;
  /** Wait: the player asked for a hint before finding it. */
  hinted?: boolean;
}

type Judged = Pick<ChordTarget, 'pcs' | 'bassPc'> & { written?: readonly number[] | null };

/**
 * Read from the staff: a key that is not written, but a chord tone below the written bass (G2
 * under C–E–G when C3 is written). Only a key that cannot be part of the written chord counts,
 * so keys on their way to it (the right hand landing before the left) never do.
 */
export function wrongBassKey(target: Judged, midi: number): boolean {
  const w = target.written;
  return !!w?.length && !w.includes(midi) && midi < w[0] && target.pcs.includes(pc(midi));
}

/**
 * The right notes over the wrong bass. Read from the staff: a chord tone that is not written sits
 * below the written bass. From a symbol: all the chord's notes (and nothing else) are down, but
 * another chord tone is lowest.
 */
export function bassOnlyWrong(target: Judged, keys: readonly number[]): boolean {
  if (target.written) return keys.some((k) => wrongBassKey(target, k));
  if (target.bassPc === null || !keys.length) return false;
  return matches({ pcs: target.pcs, bassPc: null }, keys) && !matches(target, keys);
}

/** A key that does not belong to the chord: not written (staff), or not one of its notes (symbol). */
export function wrongKey(target: Judged, midi: number): boolean {
  return target.written ? !target.written.includes(midi) : !target.pcs.includes(pc(midi));
}

export function matches(target: Judged, keys: readonly number[]): boolean {
  if (!keys.length) return false;
  if (target.written) {
    const have = [...new Set(keys)].sort((a, b) => a - b);
    return have.length === target.written.length && have.every((k, i) => k === target.written![i]);
  }
  const have = new Set(keys.map(pc));
  if (have.size !== target.pcs.length || target.pcs.some((p) => !have.has(p))) return false;
  if (target.bassPc !== null && pc(Math.min(...keys)) !== target.bassPc) return false;
  return true;
}

/** Self-paced: each chord waits until it is played. */
export class ChordWaitEngine {
  private readonly held = new Set<number>();
  private current = 0;
  private activeSince = 0;
  private wrong = 0;
  private wrongTotal = 0;
  private bassWrong = false;
  private hinted = false;
  private hints = 0;
  /** A key went down since the last match (so a repeated chord must be struck again). */
  private fresh = false;
  readonly results: ChordJudgment[] = [];

  constructor(private readonly targets: readonly ChordTarget[]) {}

  start(time: number): void {
    this.activeSince = time;
  }

  get index(): number {
    return this.current;
  }

  get finished(): boolean {
    return this.current >= this.targets.length;
  }

  get wrongPresses(): number {
    return this.wrongTotal;
  }

  get hintCount(): number {
    return this.hints;
  }

  /** The player asked to see the current chord: it no longer counts as right first time. */
  assist(): void {
    if (this.finished || this.hinted) return;
    this.hinted = true;
    this.hints++;
  }

  noteOn(midi: number, time: number): { type: 'wrong' | 'bass' | 'match' | 'none'; judgment?: ChordJudgment } {
    this.held.add(midi);
    this.fresh = true;
    const target = this.targets[this.current];
    if (!target) return { type: 'none' };
    if (wrongBassKey(target, midi)) {
      this.bassWrong = true;
      return { type: 'bass' };
    }
    if (wrongKey(target, midi)) {
      this.wrong++;
      this.wrongTotal++;
      return { type: 'wrong' };
    }
    const r = this.check(time);
    if (r.type === 'none' && !target.written && bassOnlyWrong(target, [...this.held])) {
      this.bassWrong = true;
      return { type: 'bass' };
    }
    return r;
  }

  noteOff(midi: number, time: number): { type: 'match' | 'none'; judgment?: ChordJudgment } {
    this.held.delete(midi);
    const r = this.check(time);
    return r.type === 'match' ? r : { type: 'none' };
  }

  private check(time: number): { type: 'match' | 'none'; judgment?: ChordJudgment } {
    const target = this.targets[this.current];
    const keys = [...this.held].sort((a, b) => a - b);
    if (!target || !this.fresh || !matches(target, keys)) return { type: 'none' };
    const judgment: ChordJudgment = {
      index: target.index,
      correct: this.wrong === 0 && !this.bassWrong && !this.hinted,
      reactionMs: Math.max(0, time - this.activeSince),
      played: keys,
      wrongPresses: this.wrong,
      wrongBass: this.bassWrong,
      hinted: this.hinted,
    };
    this.results.push(judgment);
    this.current++;
    this.activeSince = time;
    this.wrong = 0;
    this.bassWrong = false;
    this.hinted = false;
    this.fresh = false;
    return { type: 'match', judgment };
  }
}

const RELEASE_GRACE_MS = 150;

interface Played {
  midi: number;
  on: number;
  off?: number;
}

export interface ChordFlowOptions {
  tickMs: number;
  /** Where the run ends, in ticks: the end of the last chord's note value. */
  endTick: number;
  latencyMs: number;
}

/**
 * In time: each chord on its own beat (`tick`): the downbeat of every bar, or beats 1 and 3 in a
 * sequence. A chord counts if the keys pressed around its beat (plus any held over from before)
 * make exactly that chord. The windows scale with the shortest gap between two chords.
 */
export class ChordFlowEngine {
  private readonly notes: Played[] = [];
  private t0 = 0;
  private judged = 0;
  readonly results: ChordJudgment[] = [];
  readonly preMs: number;
  readonly postMs: number;
  readonly perfectMs: number;

  constructor(
    private readonly targets: readonly ChordTarget[],
    private readonly opts: ChordFlowOptions,
  ) {
    const ticks = targets.map((t) => t.tick);
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
    const gapMs = (gaps.length ? Math.min(...gaps) : opts.endTick - (ticks[0] ?? 0)) * opts.tickMs;
    this.preMs = Math.min(300, 0.3 * gapMs);
    this.postMs = Math.min(450, 0.4 * gapMs);
    this.perfectMs = Math.min(90, 0.08 * gapMs);
  }

  setStartTime(t0: number): void {
    this.t0 = t0;
  }

  get startTime(): number {
    return this.t0;
  }

  expectedTime(index: number): number {
    return this.t0 + this.targets[index].tick * this.opts.tickMs;
  }

  /**
   * The chord being asked for at `time` (not latency-corrected: what the player sees): the last
   * one whose window has opened, a little before its beat. Past the end, the number of chords.
   */
  askedAt(time: number): number {
    if (time + this.preMs >= this.endTime) return this.targets.length;
    let index = 0;
    for (let i = 1; i < this.targets.length && time + this.preMs >= this.expectedTime(i); i++) index = i;
    return index;
  }

  noteOn(midi: number, time: number): void {
    this.notes.push({ midi, on: time - this.opts.latencyMs });
  }

  noteOff(midi: number, time: number): void {
    const t = time - this.opts.latencyMs;
    for (let i = this.notes.length - 1; i >= 0; i--) {
      if (this.notes[i].midi === midi && this.notes[i].off === undefined) {
        this.notes[i].off = t;
        break;
      }
    }
  }

  /** Index of the chord whose window contains `time` (input time), or null. */
  windowAt(time: number): number | null {
    const t = time - this.opts.latencyMs;
    for (let i = 0; i < this.targets.length; i++) {
      const e = this.expectedTime(i);
      if (t >= e - this.preMs && t <= e + this.postMs) return i;
    }
    return null;
  }

  /** Judge every chord whose window has closed. */
  update(now: number): ChordJudgment[] {
    const t = now - this.opts.latencyMs;
    const out: ChordJudgment[] = [];
    while (this.judged < this.targets.length && t >= this.expectedTime(this.judged) + this.postMs) {
      out.push(this.judge(this.judged));
      this.judged++;
    }
    this.results.push(...out);
    return out;
  }

  /** When the run is over: the end of the last chord's note value, once every chord is judged. */
  get endTime(): number {
    return this.t0 + this.opts.endTick * this.opts.tickMs;
  }

  isFinished(now: number): boolean {
    return this.judged >= this.targets.length && now - this.opts.latencyMs >= this.endTime;
  }

  private judge(i: number): ChordJudgment {
    const target = this.targets[i];
    const e = this.expectedTime(i);
    const fresh = this.notes.filter((n) => n.on >= e - this.preMs && n.on <= e + this.postMs);
    // Keys held into the chord count (common tones), unless they are let go just after its beat.
    const heldOver = this.notes.filter((n) => n.on < e - this.preMs && (n.off === undefined || n.off > e + RELEASE_GRACE_MS));
    const keys = [...new Set([...fresh, ...heldOver].map((n) => n.midi))].sort((a, b) => a - b);
    // A chord must be struck: holding the previous one through the beat does not count.
    const correct = fresh.length > 0 && matches(target, keys);
    const onsets = fresh.map((n) => n.on).sort((a, b) => a - b);
    const judgment: ChordJudgment = { index: i, correct, played: keys, wrongPresses: 0, wrongBass: !correct && bassOnlyWrong(target, keys) };
    if (onsets.length) {
      const mid = onsets[Math.floor(onsets.length / 2)];
      judgment.deltaMs = Math.round(mid - e);
      judgment.spreadMs = Math.round(onsets[onsets.length - 1] - onsets[0]);
    }
    if (correct) {
      const off = Math.abs(judgment.deltaMs ?? 0);
      judgment.timingScore =
        off <= this.perfectMs ? 1 : Math.max(0.4, 1 - (0.6 * (off - this.perfectMs)) / Math.max(1, this.postMs - this.perfectMs));
    }
    return judgment;
  }

  /** Keys pressed outside every chord's window. */
  extraPresses(): number {
    return this.notes.filter((n) => {
      for (let i = 0; i < this.targets.length; i++) {
        const e = this.expectedTime(i);
        if (n.on >= e - this.preMs && n.on <= e + this.postMs) return false;
      }
      return true;
    }).length;
  }
}
