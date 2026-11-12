import { afterEach, describe, expect, it } from 'vitest';
import type { NoteInput } from '../../core/input/events';
import { InputBus } from '../../input/inputBus';
import type { NativeMessage } from '../native';
import { createMidiBackend, NativeMidiBackend, type MidiBackend, type MidiMessage } from './backends';
import { MidiService } from './midiService';

type G = typeof globalThis & {
  webkit?: unknown;
  __practicePianoNative?: { receive(msg: NativeMessage): void };
};
const g = globalThis as G;

/** Fake of the WKScriptMessageHandler bridge installed by the native wrapper. */
function installFakeNative() {
  const sent: unknown[] = [];
  g.webkit = { messageHandlers: { practicePiano: { postMessage: (m: unknown) => sent.push(m) } } };
  return { sent, receive: (msg: NativeMessage) => g.__practicePianoNative!.receive(msg) };
}

afterEach(() => {
  delete g.webkit;
  delete g.__practicePianoNative;
});

class FakeBackend implements MidiBackend {
  readonly kind = 'webmidi' as const;
  readonly canPairBluetooth = false;
  private msg = new Set<(m: MidiMessage) => void>();
  private changed = new Set<() => void>();
  list = [
    { id: 'a', name: 'Digital Piano', connected: true },
    { id: 'b', name: 'Pad controller', connected: true },
  ];
  async init() {
    return 'ready' as const;
  }
  inputs() {
    return this.list;
  }
  async rescan() {
    this.changed.forEach((c) => c());
  }
  onInputsChanged(cb: () => void) {
    this.changed.add(cb);
    return () => this.changed.delete(cb);
  }
  onMessage(cb: (m: MidiMessage) => void) {
    this.msg.add(cb);
    return () => this.msg.delete(cb);
  }
  pairBluetooth() {}
  dispose() {}
  send(inputId: string, data: number[], time = 1) {
    this.msg.forEach((cb) => cb({ inputId, data, time }));
  }
}

describe('MidiService', () => {
  it('publishes parsed notes and sustain from every input in auto mode', async () => {
    const bus = new InputBus();
    const events: NoteInput[] = [];
    bus.subscribe((e) => events.push(e));
    const backend = new FakeBackend();
    const service = new MidiService(bus);
    await service.init('auto', backend);
    backend.send('a', [0x90, 60, 90]);
    backend.send('b', [0xb0, 64, 127]);
    backend.send('a', [0x90, 60, 0]);
    expect(events.map((e) => e.kind)).toEqual(['noteOn', 'sustain', 'noteOff']);
    expect(bus.held.get()).toEqual({ held: [], sustained: [60], sustain: true });
    expect(service.state.get().lastInputName).toBe('Digital Piano');
  });

  it('filters to the selected device and releases stuck notes on switch', async () => {
    const bus = new InputBus();
    const backend = new FakeBackend();
    const service = new MidiService(bus);
    await service.init('auto', backend);
    backend.send('a', [0x90, 64, 90]);
    service.select('b');
    expect(bus.held.get().held).toEqual([]);
    backend.send('a', [0x90, 65, 90]);
    expect(bus.held.get().held).toEqual([]);
    backend.send('b', [0x90, 67, 90]);
    expect(bus.held.get().held).toEqual([67]);
  });
});

describe('NativeMidiBackend (CoreMIDI bridge)', () => {
  it('is chosen inside the native wrapper and speaks the bridge protocol', async () => {
    const native = installFakeNative();
    const backend = createMidiBackend();
    expect(backend).toBeInstanceOf(NativeMidiBackend);
    expect(backend.canPairBluetooth).toBe(true);
    const bus = new InputBus();
    const service = new MidiService(bus);
    await service.init('auto', backend);
    expect(native.sent).toContainEqual({ cmd: 'hello' });

    native.receive({ type: 'inputs', inputs: [{ id: '42', name: 'Bluetooth Piano', online: true }] });
    expect(service.state.get().inputs).toEqual([{ id: '42', name: 'Bluetooth Piano', manufacturer: undefined, connected: true }]);
    native.receive({ type: 'midi', source: '42', data: [0x90, 72, 100] });
    expect(bus.held.get().held).toEqual([72]);

    service.pairBluetooth();
    expect(native.sent).toContainEqual({ cmd: 'showBluetoothPairing' });
    await service.rescan();
    expect(native.sent).toContainEqual({ cmd: 'rescan' });
  });
});

describe('InputBus.capture', () => {
  it('routes input exclusively to the capturer until released', () => {
    const bus = new InputBus();
    const normal: NoteInput[] = [];
    const captured: NoteInput[] = [];
    bus.subscribe((e) => normal.push(e));
    const release = bus.capture((e) => captured.push(e));
    bus.publish({ kind: 'noteOn', midi: 60, velocity: 90, time: 1, source: 'midi' });
    expect(captured).toHaveLength(1);
    expect(normal).toHaveLength(0);
    expect(bus.held.get().held).toEqual([60]); // the monitor still updates
    release();
    bus.publish({ kind: 'noteOff', midi: 60, time: 2, source: 'midi' });
    expect(normal).toHaveLength(1);
    expect(bus.isCaptured).toBe(false);
  });
});
