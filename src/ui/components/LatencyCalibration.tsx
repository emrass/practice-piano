import { useEffect, useRef, useState } from 'react';
import {
  analyzeTaps,
  CALIBRATION_BEAT_MS,
  CALIBRATION_BPM,
  CALIBRATION_COUNTED,
  CALIBRATION_WARMUP,
  deriveLatency,
  pulseTimes,
  type TapAnalysis,
} from '../../core/calibration/latency';
import type { LatencyCalibration as CalibrationRecord } from '../../core/settings';
import { inputBus } from '../../input/inputBus';
import { audioEngine, Metronome } from '../../platform/audio/audioEngine';

type Phase = 'intro' | 'audio' | 'visual-intro' | 'visual' | 'result' | 'failed';

export interface CalibrationOutcome {
  latencyMs: number;
  /** null = keep the current playhead delay (visual pass skipped). */
  playheadDelayMs: number | null;
  record: CalibrationRecord;
}

const QUALITY_TEXT = {
  good: 'Very consistent',
  fair: 'Reasonably consistent',
  poor: 'Inconsistent — consider retrying',
  insufficient: 'Not enough taps',
} as const;

const LEAD_IN_MS = 900;

/**
 * Tap-along latency calibration: first to clicks (measures what Flow-mode scoring must
 * compensate), then optionally to a silent flashing circle (to separate out how late the
 * audio is heard, which sets the playhead delay).
 */
export function LatencyCalibration(props: {
  volume: number;
  midiConnected: boolean;
  onApply: (outcome: CalibrationOutcome) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [taps, setTaps] = useState(0);
  const [progress, setProgress] = useState(0);
  const [audio, setAudio] = useState<TapAnalysis | null>(null);
  const [visual, setVisual] = useState<TapAnalysis | null>(null);
  const [failedKind, setFailedKind] = useState<'audio' | 'visual'>('audio');
  const [sources, setSources] = useState<string[]>([]);
  /** First pulse time (performance clock), exposed as a data attribute for end-to-end tests. */
  const [runStart, setRunStart] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const { onClose } = props;

  useEffect(() => () => cleanupRef.current?.(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = (kind: 'audio' | 'visual') => {
    cleanupRef.current?.();
    audioEngine.ensure(); // inside the click gesture
    const start = performance.now() + LEAD_IN_MS;
    const pulses = pulseTimes(start);
    const shown = [...pulses];
    const tapTimes: number[] = [];
    const seen = new Set<string>();
    setTaps(0);
    setProgress(0);
    setRunStart(start);
    setPhase(kind);

    const release = inputBus.capture((ev) => {
      if (ev.kind !== 'noteOn') return;
      tapTimes.push(ev.time);
      seen.add(ev.source);
      setTaps((n) => n + 1);
    });

    const metronome = new Metronome(audioEngine);
    if (kind === 'audio') {
      metronome.start({
        startTime: start,
        beatMs: CALIBRATION_BEAT_MS,
        beatsPerBar: 4,
        totalBeats: pulses.length,
        volume: Math.max(0.5, props.volume),
      });
    }

    let raf = 0;
    let next = 0;
    const end = pulses[pulses.length - 1] + CALIBRATION_BEAT_MS * 0.6;
    const frame = () => {
      const now = performance.now();
      setProgress(Math.min(1, Math.max(0, (now - start) / (end - start))));
      const flash = flashRef.current;
      if (kind === 'visual' && flash) {
        if (next < pulses.length && now >= pulses[next]) {
          shown[next] = now; // when the flash actually went up
          flash.classList.add('is-on');
          next++;
        } else if (next > 0 && now - shown[next - 1] > 110) {
          flash.classList.remove('is-on');
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const timer = setTimeout(() => {
      cleanup();
      const result = analyzeTaps(kind === 'visual' ? shown : pulses, tapTimes, CALIBRATION_BEAT_MS);
      setSources((prev) => [...new Set([...prev, ...seen])]);
      if (result.quality === 'insufficient') {
        setFailedKind(kind);
        setPhase('failed');
        return;
      }
      if (kind === 'audio') {
        setAudio(result);
        setPhase('visual-intro');
      } else {
        setVisual(result);
        setPhase('result');
      }
    }, end - performance.now());

    const cleanup = () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      metronome.stop();
      release();
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
  };

  const estimate = audio ? deriveLatency(audio, visual) : null;
  const usedComputerInput = sources.some((s) => s !== 'midi');

  const apply = () => {
    if (!audio || !estimate) return;
    props.onApply({
      latencyMs: estimate.latencyMs,
      playheadDelayMs: estimate.playheadDelayMs,
      record: {
        at: Date.now(),
        latencyMs: estimate.latencyMs,
        spreadMs: Math.round(audio.spreadMs),
        taps: audio.used,
        playheadDelayMs: estimate.playheadDelayMs,
        source: sources.includes('midi') ? 'midi' : (sources[0] ?? 'midi'),
      },
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="calib-title">
      <div className="modal-card calib">
        <div className="modal-head">
          <h2 id="calib-title">Latency calibration</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>
            ✕
          </button>
        </div>

        {phase === 'intro' ? (
          <div className="calib-body">
            <p>
              Set up exactly as you practise — same piano connection, same speakers or headphones. You’ll hear {CALIBRATION_WARMUP} lead-in clicks, then{' '}
              {CALIBRATION_COUNTED} more at {CALIBRATION_BPM} bpm.
            </p>
            <p>
              <b>Play any key on your piano together with each click</b> — as if it were a rhythm exercise. Don’t try to compensate; just play with what you hear.
            </p>
            {!props.midiConnected ? <p className="calib-warn">No MIDI piano is connected. You can tap on the computer, but that measures the computer keyboard, not your piano.</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={props.onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => run('audio')}>
                Start listening test
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'audio' || phase === 'visual' ? (
          <div className="calib-body calib-running" data-pulse-start={runStart.toFixed(3)}>
            {phase === 'visual' ? (
              <div className="calib-flash" ref={flashRef} aria-hidden="true" />
            ) : (
              <div className="calib-ear" aria-hidden="true">
                ♪
              </div>
            )}
            <p className="calib-instruction">{phase === 'audio' ? 'Play a key on every click' : 'Play a key every time the circle lights up'}</p>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="muted calib-count">{taps} taps</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={props.onClose}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'visual-intro' && audio ? (
          <div className="calib-body">
            <p>
              Listening test done: your notes arrive <b>{Math.round(audio.offsetMs)} ms</b> after the click (±{Math.round(audio.spreadMs)} ms).
            </p>
            <p>
              Optional second pass: tap along to a <b>silent flashing circle</b>. The difference tells us how late you <i>hear</i> the click, so the Flow-mode playhead can be
              delayed to match — most useful with Bluetooth headphones or audio streamed to the piano.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPhase('result')}>
                Skip
              </button>
              <button type="button" className="btn btn-primary" onClick={() => run('visual')}>
                Calibrate playhead too
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'failed' ? (
          <div className="calib-body">
            <p className="calib-warn">Not enough taps lined up with the {failedKind === 'audio' ? 'clicks' : 'flashes'}. Play one key on every beat and try again.</p>
            {failedKind === 'audio' ? (
              <p className="muted">If you heard no clicks, check the volume and audio output.</p>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => (failedKind === 'visual' && audio ? setPhase('result') : props.onClose())}>
                {failedKind === 'visual' && audio ? 'Skip' : 'Cancel'}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => run(failedKind)}>
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'result' && audio && estimate ? (
          <div className="calib-body">
            <dl className="calib-results">
              <div>
                <dt>Latency compensation</dt>
                <dd>{estimate.latencyMs} ms</dd>
                <span className={`calib-quality is-${audio.quality}`}>
                  {QUALITY_TEXT[audio.quality]} · ±{Math.round(audio.spreadMs)} ms · {audio.used}/{audio.total} taps
                </span>
              </div>
              <div>
                <dt>Playhead delay</dt>
                <dd>{estimate.playheadDelayMs === null ? '—' : `${estimate.playheadDelayMs} ms`}</dd>
                <span className="calib-quality">
                  {estimate.playheadDelayMs === null
                    ? 'Not measured — current setting kept'
                    : visual
                      ? `Visual pass ${Math.round(visual.offsetMs)} ms · ±${Math.round(visual.spreadMs)} ms`
                      : ''}
                </span>
              </div>
            </dl>
            {audio.offsetMs < 0 ? <p className="muted">You played slightly ahead of the click, which is common; compensation is set to 0 ms.</p> : null}
            {usedComputerInput && props.midiConnected ? (
              <p className="calib-warn">Some taps came from the computer or screen, not the piano — retry using the piano for an accurate result.</p>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => run('audio')}>
                Retry
              </button>
              <button type="button" className="btn btn-primary" onClick={apply}>
                Apply
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
