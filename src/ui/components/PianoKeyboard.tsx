import { memo, useMemo, useRef } from 'react';
import { isBlackKey } from '../../core/keyboard/range';
import { midiToQwertyLabel } from '../../core/input/qwerty';
import { type PcSpelling, pitchLabel, spellMidiIn } from '../../core/music/pitch';
import { inputBus } from '../../input/inputBus';

export interface PianoKeyboardProps {
  min: number;
  max: number;
  held: readonly number[];
  sustained: readonly number[];
  expected: readonly number[];
  wrong: number | null;
  showLabels: boolean;
  preferFlats: boolean;
  /** Pitch classes spelled by the music (chords: as the chord asked for), over preferFlats. */
  spelling?: PcSpelling;
  qwertyBase: number | null;
  heat?: Map<number, { attempts: number; accuracy: number }>;
  /** Piano-shortcut labels by pitch class (shown after an exercise). */
  actions?: Map<number, string>;
  /** Labels for specific keys (Rhythm mode's designated keys). */
  markers?: ReadonlyMap<number, string>;
}

interface KeyGeom {
  midi: number;
  black: boolean;
  /** left / width as % of the keyboard width */
  left: number;
  width: number;
}

function keyGeometry(min: number, max: number): KeyGeom[] {
  const whites: number[] = [];
  for (let m = min; m <= max; m++) if (!isBlackKey(m)) whites.push(m);
  const ww = 100 / Math.max(1, whites.length);
  const out: KeyGeom[] = [];
  whites.forEach((m, i) => out.push({ midi: m, black: false, left: i * ww, width: ww }));
  for (let m = min; m <= max; m++) {
    if (!isBlackKey(m)) continue;
    const leftWhite = whites.indexOf(m - 1);
    if (leftWhite < 0) continue;
    // Slight offsets mimic real key placement (C#/D# lean outwards, F#/A# vary).
    const pc = m % 12;
    const bias = pc === 1 || pc === 6 ? -0.12 : pc === 3 || pc === 10 ? 0.12 : 0;
    const bw = ww * 0.6;
    out.push({ midi: m, black: true, left: (leftWhite + 1) * ww - bw / 2 + bias * bw, width: bw });
  }
  return out;
}

function heatColor(acc: number): string {
  // red (0) → amber (0.75) → green (1)
  const hue = Math.max(0, Math.min(120, (acc - 0.5) * 240));
  return `hsl(${hue} 70% 50% / 0.55)`;
}

/** Interactive on-screen keyboard (mouse / touch / pen), also used as a live display. */
export const PianoKeyboard = memo(function PianoKeyboard(props: PianoKeyboardProps) {
  const keys = useMemo(() => keyGeometry(props.min, props.max), [props.min, props.max]);
  const pointers = useRef(new Map<number, number>());
  const held = useMemo(() => new Set(props.held), [props.held]);
  const sustained = useMemo(() => new Set(props.sustained), [props.sustained]);
  const expected = useMemo(() => new Set(props.expected), [props.expected]);
  const whiteCount = keys.filter((k) => !k.black).length;
  // Label shortcut keys in the octave nearest the middle of the view; highlight all octaves.
  const labelOctaveC = Math.floor((props.min + props.max) / 2 / 12) * 12;
  // Every other shortcut label sits a row higher when keys are too narrow for them side by side.
  const actionOrder = useMemo(() => [...(props.actions?.keys() ?? [])], [props.actions]);

  const press = (pointerId: number, midi: number) => {
    const prev = pointers.current.get(pointerId);
    if (prev === midi) return;
    if (prev !== undefined) inputBus.publish({ kind: 'noteOff', midi: prev, time: performance.now(), source: 'screen' });
    pointers.current.set(pointerId, midi);
    inputBus.publish({ kind: 'noteOn', midi, velocity: 80, time: performance.now(), source: 'screen' });
  };
  const release = (pointerId: number) => {
    const prev = pointers.current.get(pointerId);
    if (prev === undefined) return;
    pointers.current.delete(pointerId);
    inputBus.publish({ kind: 'noteOff', midi: prev, time: performance.now(), source: 'screen' });
  };

  return (
    <div
      className="piano"
      style={{ ['--white-count' as string]: whiteCount }}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
      onPointerLeave={(e) => release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
      role="group"
      aria-label="On-screen piano keyboard"
    >
      {keys.map((k) => {
        const isHeld = held.has(k.midi);
        const isSustained = !isHeld && sustained.has(k.midi);
        const isExpected = expected.has(k.midi);
        const isWrong = props.wrong === k.midi;
        const spelled = spellMidiIn(k.midi, props.preferFlats, props.spelling);
        const isC = k.midi % 12 === 0;
        const qwerty = props.qwertyBase !== null ? midiToQwertyLabel(k.midi, props.qwertyBase) : null;
        const heat = props.heat?.get(k.midi);
        const action = props.actions?.get(k.midi % 12);
        const marker = props.markers?.get(k.midi);
        const cls = [
          'key',
          k.black ? 'key-black' : 'key-white',
          isHeld ? 'is-held' : '',
          isSustained ? 'is-sustained' : '',
          isExpected ? 'is-expected' : '',
          isWrong ? 'is-wrong' : '',
          isHeld && isExpected ? 'is-correct' : '',
          action ? 'is-action' : '',
          marker ? 'is-marked' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={k.midi}
            className={cls}
            style={{ left: `${k.left}%`, width: `${k.width}%` }}
            data-midi={k.midi}
            onPointerDown={(e) => {
              e.preventDefault();
              // Touch pointers are implicitly captured; release so sliding across keys works.
              if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              press(e.pointerId, k.midi);
            }}
            onPointerEnter={(e) => {
              if (pointers.current.has(e.pointerId)) press(e.pointerId, k.midi);
            }}
            aria-label={pitchLabel(spelled, true)}
          >
            {heat && heat.attempts > 0 ? <span className="key-heat" style={{ background: heatColor(heat.accuracy) }} /> : null}
            {action && k.midi >= labelOctaveC && k.midi < labelOctaveC + 12 ? (
              <span className={`key-action ${actionOrder.indexOf(k.midi % 12) % 2 ? 'is-alt' : ''}`}>{action}</span>
            ) : null}
            {marker ? (
              <span className="key-marker">
                {marker.split(' · ')[0]}
                {marker.includes(' · ') ? <small> · {marker.split(' · ')[1]}</small> : null}
              </span>
            ) : null}
            {qwerty ? <span className="key-qwerty">{qwerty}</span> : null}
            {!k.black && (props.showLabels || isC) ? (
              <span className={`key-label ${isC ? 'is-c' : ''}`}>{props.showLabels ? pitchLabel(spelled, isC) : `C${spelled.octave}`}</span>
            ) : null}
            {k.black && props.showLabels && (isExpected || isHeld) ? <span className="key-label key-label-black">{pitchLabel(spelled)}</span> : null}
          </div>
        );
      })}
    </div>
  );
});
