/**
 * Tap-along latency calibration.
 *
 * The player taps a key in time with a steady pulse. For every counted pulse we take the
 * offset between when the pulse was scheduled and when the tap arrived. With an audible
 * click, that offset is the whole chain the scoring has to compensate for: audio output
 * (incl. Bluetooth audio) + MIDI input (incl. Bluetooth MIDI) + the player's own habit.
 * With a silent, visual pulse the audio part drops out, so the difference between the two
 * runs estimates how late the click is heard — which is how much the playhead should lag.
 */

export const CALIBRATION_BPM = 80;
export const CALIBRATION_BEAT_MS = 60000 / CALIBRATION_BPM;
export const CALIBRATION_WARMUP = 4;
export const CALIBRATION_COUNTED = 16;
export const MAX_LATENCY_MS = 300;

export type CalibrationQuality = 'good' | 'fair' | 'poor' | 'insufficient';

export interface TapAnalysis {
  /** Median tap offset (ms, positive = late). */
  offsetMs: number;
  /** Robust standard deviation (1.4826 × MAD), ms. */
  spreadMs: number;
  /** Pulses matched by a tap. */
  used: number;
  /** Counted pulses. */
  total: number;
  quality: CalibrationQuality;
}

export interface AnalyzeOptions {
  warmup?: number;
  minTaps?: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Times of the pulses of a calibration run. */
export function pulseTimes(start: number, beatMs = CALIBRATION_BEAT_MS, count = CALIBRATION_WARMUP + CALIBRATION_COUNTED): number[] {
  return Array.from({ length: count }, (_, i) => start + i * beatMs);
}

/**
 * Match taps to pulses (nearest pulse within ±45 % of a beat, one tap per pulse — the
 * closest wins), skip the warm-up pulses, and summarise robustly.
 */
export function analyzeTaps(pulses: readonly number[], taps: readonly number[], beatMs: number, opts: AnalyzeOptions = {}): TapAnalysis {
  const warmup = opts.warmup ?? CALIBRATION_WARMUP;
  const minTaps = opts.minTaps ?? 8;
  const total = Math.max(0, pulses.length - warmup);
  const best = new Map<number, number>();
  for (const tap of taps) {
    let idx = -1;
    let delta = Infinity;
    pulses.forEach((p, i) => {
      if (Math.abs(tap - p) < Math.abs(delta)) {
        delta = tap - p;
        idx = i;
      }
    });
    if (idx < warmup || Math.abs(delta) > beatMs * 0.45) continue;
    const prev = best.get(idx);
    if (prev === undefined || Math.abs(delta) < Math.abs(prev)) best.set(idx, delta);
  }
  const offsets = [...best.values()];
  if (offsets.length < minTaps) {
    return { offsetMs: offsets.length ? median(offsets) : 0, spreadMs: 0, used: offsets.length, total, quality: 'insufficient' };
  }
  const med = median(offsets);
  const spreadMs = 1.4826 * median(offsets.map((o) => Math.abs(o - med)));
  const quality: CalibrationQuality = spreadMs <= 20 ? 'good' : spreadMs <= 40 ? 'fair' : 'poor';
  return { offsetMs: med, spreadMs, used: offsets.length, total, quality };
}

export interface LatencyEstimate {
  /** Input-time compensation used for Flow-mode scoring. */
  latencyMs: number;
  /** How far the playhead should lag so it matches the heard click; null = not measured. */
  playheadDelayMs: number | null;
}

/** Below this, an audio-vs-visual difference is within measurement noise. */
const PLAYHEAD_NOISE_MS = 30;

export function deriveLatency(audio: TapAnalysis, visual: TapAnalysis | null): LatencyEstimate {
  const clamp = (v: number) => Math.round(Math.min(MAX_LATENCY_MS, Math.max(0, v)));
  const latencyMs = clamp(audio.offsetMs);
  if (!visual || visual.quality === 'insufficient') return { latencyMs, playheadDelayMs: null };
  const diff = audio.offsetMs - visual.offsetMs;
  return { latencyMs, playheadDelayMs: diff < PLAYHEAD_NOISE_MS ? 0 : clamp(diff) };
}
