/** Channel-voice MIDI events the app cares about. */
export type MidiEvent =
  | { type: 'noteOn'; note: number; velocity: number; channel: number }
  | { type: 'noteOff'; note: number; velocity: number; channel: number }
  | { type: 'sustain'; down: boolean; value: number; channel: number }
  | { type: 'allNotesOff'; channel: number };

export const SUSTAIN_CC = 64;

/**
 * Parse one complete MIDI 1.0 message.
 * Note-on with velocity 0 is a note-off (running-status keyboards send this).
 * Returns null for anything we don't use (clock, active sensing, other CCs, SysEx…).
 */
export function parseMidiMessage(data: ArrayLike<number>): MidiEvent | null {
  if (!data || data.length < 1) return null;
  const status = data[0];
  if (status < 0x80 || status >= 0xf0) return null;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  const d1 = data.length > 1 ? data[1] & 0x7f : 0;
  const d2 = data.length > 2 ? data[2] & 0x7f : 0;
  switch (type) {
    case 0x90:
      if (data.length < 3) return null;
      return d2 === 0
        ? { type: 'noteOff', note: d1, velocity: 0, channel }
        : { type: 'noteOn', note: d1, velocity: d2, channel };
    case 0x80:
      if (data.length < 3) return null;
      return { type: 'noteOff', note: d1, velocity: d2, channel };
    case 0xb0:
      if (data.length < 3) return null;
      if (d1 === SUSTAIN_CC) return { type: 'sustain', down: d2 >= 64, value: d2, channel };
      if (d1 === 120 || d1 === 123) return { type: 'allNotesOff', channel };
      return null;
    default:
      return null;
  }
}
