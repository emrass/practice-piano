/**
 * Bridge to the native iPadOS / macOS wrapper (native/PracticePiano).
 *
 * JS → native: window.webkit.messageHandlers.practicePiano.postMessage({ cmd, ... })
 *   { cmd: 'hello' }                  ask for the current MIDI source list
 *   { cmd: 'rescan' }                 re-enumerate CoreMIDI sources
 *   { cmd: 'showBluetoothPairing' }   present CABTMIDICentralViewController
 *
 * native → JS: window.__practicePianoNative.receive(message)
 *   { type: 'inputs', inputs: [{ id, name, manufacturer, online }] }
 *   { type: 'midi', source: id, data: number[] }
 *   { type: 'bluetoothClosed' }
 */

export type NativeMessage =
  | { type: 'inputs'; inputs: { id: string; name: string; manufacturer?: string; online?: boolean }[] }
  | { type: 'midi'; source: string; data: number[] }
  | { type: 'bluetoothClosed' }
  | { type: 'log'; message: string };

export type NativeCommand = { cmd: 'hello' } | { cmd: 'rescan' } | { cmd: 'showBluetoothPairing' };

interface WebkitWindow {
  webkit?: { messageHandlers?: Record<string, { postMessage(msg: unknown): void } | undefined> };
  __practicePianoNative?: { receive(msg: NativeMessage): void };
}

function w(): WebkitWindow {
  return globalThis as unknown as WebkitWindow;
}

export function isNativeApp(): boolean {
  return Boolean(w().webkit?.messageHandlers?.practicePiano);
}

export function postNative(cmd: NativeCommand): boolean {
  const handler = w().webkit?.messageHandlers?.practicePiano;
  if (!handler) return false;
  handler.postMessage(cmd);
  return true;
}

const listeners = new Set<(msg: NativeMessage) => void>();

/** Installs the receive hook the native side calls into. */
export function onNativeMessage(listener: (msg: NativeMessage) => void): () => void {
  const win = w();
  win.__practicePianoNative ??= { receive: (msg) => listeners.forEach((l) => l(msg)) };
  listeners.add(listener);
  return () => listeners.delete(listener);
}
