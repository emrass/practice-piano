/**
 * Computer-keyboard piano, DAW style. Uses KeyboardEvent.code (physical key positions),
 * so it works on QWERTY, QWERTZ and AZERTY layouts alike.
 *
 *   W E   T Y U   O P        ← black keys
 *  A S D F G H J K L ; '     ← white keys (A = C of the current octave)
 *  Z / X shift the octave down / up.
 */
export const QWERTY_OFFSETS: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
  Quote: 17,
};

export const QWERTY_SPAN = 18;

export const OCTAVE_DOWN_CODE = 'KeyZ';
export const OCTAVE_UP_CODE = 'KeyX';

export function qwertyToMidi(code: string, baseMidi: number): number | null {
  const offset = QWERTY_OFFSETS[code];
  return offset === undefined ? null : baseMidi + offset;
}

/** Physical key label for a MIDI note under the current base, for on-key hints. */
export function midiToQwertyLabel(midi: number, baseMidi: number): string | null {
  const offset = midi - baseMidi;
  const code = Object.keys(QWERTY_OFFSETS).find((c) => QWERTY_OFFSETS[c] === offset);
  if (!code) return null;
  if (code === 'Semicolon') return ';';
  if (code === 'Quote') return "'";
  return code.replace('Key', '');
}

/** A C (multiple of 12) such that most of [min, max] fits in the QWERTY window. */
export function qwertyBaseFor(min: number, max: number): number {
  const center = (min + max) / 2;
  const base = Math.round((center - QWERTY_SPAN / 2) / 12) * 12;
  return Math.min(96, Math.max(24, base));
}

export function clampQwertyBase(base: number): number {
  return Math.min(96, Math.max(24, base));
}
