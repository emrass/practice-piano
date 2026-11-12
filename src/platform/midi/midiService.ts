import { parseMidiMessage } from '../../core/midi/parse';
import { createStore } from '../../lib/store';
import type { InputBus } from '../../input/inputBus';
import { createMidiBackend, type MidiBackend, type MidiBackendKind, type MidiInitStatus, type MidiInputInfo } from './backends';

export interface MidiState {
  backend: MidiBackendKind;
  status: MidiInitStatus | 'initializing';
  inputs: MidiInputInfo[];
  /** 'auto' listens to every connected input. */
  selectedId: string;
  canPairBluetooth: boolean;
  lastActivity: number;
  lastInputName: string | null;
}

/**
 * Owns the platform MIDI backend: device selection, parsing, and publishing
 * NoteInput events onto the InputBus.
 */
export class MidiService {
  readonly state = createStore<MidiState>({
    backend: 'none',
    status: 'initializing',
    inputs: [],
    selectedId: 'auto',
    canPairBluetooth: false,
    lastActivity: 0,
    lastInputName: null,
  });
  private backend: MidiBackend | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly bus: InputBus) {}

  async init(selectedId: string, backend: MidiBackend = createMidiBackend()): Promise<void> {
    this.dispose();
    this.backend = backend;
    this.state.set((s) => ({ ...s, backend: backend.kind, canPairBluetooth: backend.canPairBluetooth, selectedId, status: 'initializing' }));
    this.cleanups.push(backend.onInputsChanged(() => this.refreshInputs()));
    this.cleanups.push(
      backend.onMessage((msg) => {
        const { selectedId: sel } = this.state.get();
        if (sel !== 'auto' && sel !== msg.inputId) return;
        const ev = parseMidiMessage(msg.data);
        if (!ev) return;
        const time = msg.time;
        if (ev.type === 'noteOn') this.bus.publish({ kind: 'noteOn', midi: ev.note, velocity: ev.velocity, time, source: 'midi' });
        else if (ev.type === 'noteOff') this.bus.publish({ kind: 'noteOff', midi: ev.note, time, source: 'midi' });
        else if (ev.type === 'sustain') this.bus.publish({ kind: 'sustain', down: ev.down, time, source: 'midi' });
        else this.bus.publish({ kind: 'allOff', time, source: 'midi' });
        const name = this.state.get().inputs.find((i) => i.id === msg.inputId)?.name ?? null;
        this.state.set((s) => ({ ...s, lastActivity: time, lastInputName: name }));
      }),
    );
    const status = await backend.init();
    this.state.set((s) => ({ ...s, status }));
    this.refreshInputs();
  }

  private refreshInputs() {
    if (!this.backend) return;
    const inputs = this.backend.inputs();
    this.state.set((s) => ({ ...s, inputs }));
    const { selectedId } = this.state.get();
    // If the chosen device vanished, release its stuck notes.
    if (selectedId !== 'auto' && !inputs.some((i) => i.id === selectedId && i.connected)) {
      this.bus.releaseAll('midi', performance.now());
    }
  }

  select(id: string): void {
    this.bus.releaseAll('midi', performance.now());
    this.state.set((s) => ({ ...s, selectedId: id }));
  }

  async rescan(): Promise<void> {
    await this.backend?.rescan();
    this.refreshInputs();
  }

  pairBluetooth(): void {
    this.backend?.pairBluetooth();
  }

  dispose(): void {
    this.cleanups.splice(0).forEach((c) => c());
    this.backend?.dispose();
    this.backend = null;
  }
}
