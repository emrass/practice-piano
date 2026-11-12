import { describe, expect, it } from 'vitest';
import { analyzeTaps, CALIBRATION_BEAT_MS, CALIBRATION_WARMUP, deriveLatency, pulseTimes } from './latency';
import { Rng } from '../generator/rng';

const BEAT = CALIBRATION_BEAT_MS;

/** Simulated player: constant system latency + human jitter (± jitterMs). */
function simulate(latency: number, jitterMs: number, seed = 1, opts: { skip?: number[]; extra?: number[] } = {}) {
  const rng = new Rng(seed);
  const pulses = pulseTimes(1000);
  const taps = pulses
    .map((p, i) => (opts.skip?.includes(i) ? null : p + latency + (rng.next() * 2 - 1) * jitterMs))
    .filter((t): t is number => t !== null);
  return { pulses, taps: [...taps, ...(opts.extra ?? [])] };
}

describe('analyzeTaps', () => {
  it('recovers the latency of a steady player', () => {
    for (const latency of [0, 15, 95, 180, 290]) {
      const { pulses, taps } = simulate(latency, 15, latency + 1);
      const r = analyzeTaps(pulses, taps, BEAT);
      expect(r.offsetMs).toBeGreaterThan(latency - 8);
      expect(r.offsetMs).toBeLessThan(latency + 8);
      expect(r.quality).toBe('good');
      expect(r.used).toBe(16);
    }
  });

  it('ignores warm-up taps, stray double taps and wild outliers', () => {
    // Sloppy second taps near pulses 5 and 10: the tap closest to each pulse wins.
    const { pulses, taps } = simulate(120, 10, 3, { extra: [1000 + 5 * BEAT + 300, 1000 + 10 * BEAT + 330, 1000 + 1 * BEAT] });
    const r = analyzeTaps(pulses, taps, BEAT);
    expect(Math.abs(r.offsetMs - 120)).toBeLessThan(8);
    expect(r.used).toBe(16);
  });

  it('flags inconsistent tapping and too few taps', () => {
    const sloppy = simulate(100, 120, 4);
    expect(analyzeTaps(sloppy.pulses, sloppy.taps, BEAT).quality).toBe('poor');
    const sparse = simulate(100, 5, 5, { skip: Array.from({ length: 14 }, (_, i) => i + CALIBRATION_WARMUP) });
    expect(analyzeTaps(sparse.pulses, sparse.taps, BEAT).quality).toBe('insufficient');
    expect(analyzeTaps(sparse.pulses, [], BEAT).used).toBe(0);
  });

  it('reports early (anticipating) players as negative offsets', () => {
    const { pulses, taps } = simulate(-30, 5, 6);
    expect(analyzeTaps(pulses, taps, BEAT).offsetMs).toBeLessThan(-20);
  });
});

describe('deriveLatency', () => {
  const a = (offsetMs: number) => ({ offsetMs, spreadMs: 10, used: 16, total: 16, quality: 'good' as const });

  it('uses the audio pass for scoring and clamps to 0–300 ms', () => {
    expect(deriveLatency(a(172.4), null)).toEqual({ latencyMs: 172, playheadDelayMs: null });
    expect(deriveLatency(a(-25), null).latencyMs).toBe(0);
    expect(deriveLatency(a(420), null).latencyMs).toBe(300);
  });

  it('derives the playhead delay from audio minus visual, ignoring noise', () => {
    expect(deriveLatency(a(200), a(40)).playheadDelayMs).toBe(160); // Bluetooth headphones
    expect(deriveLatency(a(45), a(30)).playheadDelayMs).toBe(0); // speakers: within noise
    expect(deriveLatency(a(45), { ...a(30), quality: 'insufficient' }).playheadDelayMs).toBeNull();
  });
});
