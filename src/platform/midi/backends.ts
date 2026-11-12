import { isNativeApp, onNativeMessage, postNative } from '../native';

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer?: string;
  connected: boolean;
}

export type MidiBackendKind = 'webmidi' | 'native' | 'none';
export type MidiInitStatus = 'ready' | 'unsupported' | 'denied' | 'error';

export interface MidiMessage {
  inputId: string;
  data: ArrayLike<number>;
  /** performance.now() timebase */
  time: number;
}

export interface MidiBackend {
  readonly kind: MidiBackendKind;
  readonly canPairBluetooth: boolean;
  init(): Promise<MidiInitStatus>;
  inputs(): MidiInputInfo[];
  rescan(): Promise<void>;
  onInputsChanged(cb: () => void): () => void;
  onMessage(cb: (msg: MidiMessage) => void): () => void;
  pairBluetooth(): void;
  dispose(): void;
}

/** Chrome / Edge Web MIDI (USB-MIDI and macOS Bluetooth MIDI once paired in Audio MIDI Setup). */
export class WebMidiBackend implements MidiBackend {
  readonly kind = 'webmidi' as const;
  readonly canPairBluetooth = false;
  private access: MIDIAccess | null = null;
  private readonly inputListeners = new Set<() => void>();
  private readonly messageListeners = new Set<(m: MidiMessage) => void>();
  private readonly bound = new Map<string, MIDIInput>();

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async init(): Promise<MidiInitStatus> {
    if (!WebMidiBackend.isSupported()) return 'unsupported';
    try {
      this.attach(await navigator.requestMIDIAccess({ sysex: false }));
      return 'ready';
    } catch (err) {
      const name = (err as DOMException)?.name;
      return name === 'SecurityError' || name === 'NotAllowedError' ? 'denied' : 'error';
    }
  }

  private attach(access: MIDIAccess) {
    if (this.access) this.access.onstatechange = null;
    this.access = access;
    access.onstatechange = () => {
      this.bindAll();
      this.inputListeners.forEach((l) => l());
    };
    this.bindAll();
    this.inputListeners.forEach((l) => l());
  }

  private bindAll() {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      if (this.bound.get(input.id) === input) continue;
      input.onmidimessage = (e: MIDIMessageEvent) => {
        if (!e.data) return;
        const msg: MidiMessage = { inputId: input.id, data: e.data, time: e.timeStamp || performance.now() };
        this.messageListeners.forEach((l) => l(msg));
      };
      this.bound.set(input.id, input);
    }
  }

  inputs(): MidiInputInfo[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => ({
      id: i.id,
      name: i.name || 'MIDI input',
      manufacturer: i.manufacturer || undefined,
      connected: i.state === 'connected',
    }));
  }

  async rescan(): Promise<void> {
    // Re-requesting access makes Chrome refresh its device list.
    if (!WebMidiBackend.isSupported()) return;
    try {
      this.attach(await navigator.requestMIDIAccess({ sysex: false }));
    } catch {
      /* keep the old access object */
    }
  }

  onInputsChanged(cb: () => void) {
    this.inputListeners.add(cb);
    return () => this.inputListeners.delete(cb);
  }

  onMessage(cb: (m: MidiMessage) => void) {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  pairBluetooth(): void {
    /* Not possible from a browser — handled in the UI with instructions. */
  }

  dispose(): void {
    for (const input of this.bound.values()) input.onmidimessage = null;
    this.bound.clear();
    if (this.access) this.access.onstatechange = null;
  }
}

/** CoreMIDI via the native wrapper's WKScriptMessageHandler bridge. */
export class NativeMidiBackend implements MidiBackend {
  readonly kind = 'native' as const;
  readonly canPairBluetooth = true;
  private list: MidiInputInfo[] = [];
  private readonly inputListeners = new Set<() => void>();
  private readonly messageListeners = new Set<(m: MidiMessage) => void>();
  private unsubscribe: (() => void) | null = null;

  static isSupported(): boolean {
    return isNativeApp();
  }

  async init(): Promise<MidiInitStatus> {
    this.unsubscribe = onNativeMessage((msg) => {
      if (msg.type === 'inputs') {
        this.list = msg.inputs.map((i) => ({ id: i.id, name: i.name, manufacturer: i.manufacturer, connected: i.online !== false }));
        this.inputListeners.forEach((l) => l());
      } else if (msg.type === 'midi') {
        const m: MidiMessage = { inputId: msg.source, data: msg.data, time: performance.now() };
        this.messageListeners.forEach((l) => l(m));
      } else if (msg.type === 'bluetoothClosed') {
        void this.rescan();
      }
    });
    return postNative({ cmd: 'hello' }) ? 'ready' : 'unsupported';
  }

  inputs() {
    return this.list;
  }

  async rescan() {
    postNative({ cmd: 'rescan' });
  }

  onInputsChanged(cb: () => void) {
    this.inputListeners.add(cb);
    return () => this.inputListeners.delete(cb);
  }

  onMessage(cb: (m: MidiMessage) => void) {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  pairBluetooth() {
    postNative({ cmd: 'showBluetoothPairing' });
  }

  dispose() {
    this.unsubscribe?.();
  }
}

export class NullMidiBackend implements MidiBackend {
  readonly kind = 'none' as const;
  readonly canPairBluetooth = false;
  async init(): Promise<MidiInitStatus> {
    return 'unsupported';
  }
  inputs() {
    return [];
  }
  async rescan() {}
  onInputsChanged() {
    return () => {};
  }
  onMessage() {
    return () => {};
  }
  pairBluetooth() {}
  dispose() {}
}

export function createMidiBackend(): MidiBackend {
  if (NativeMidiBackend.isSupported()) return new NativeMidiBackend();
  if (WebMidiBackend.isSupported()) return new WebMidiBackend();
  return new NullMidiBackend();
}
