/**
 * Bridge to the native wrappers: native/PracticePiano (iPadOS, macOS) and android/ (Android).
 * Both host this web build and speak the same protocol; only the way in differs.
 *
 * JS → native
 *   Apple:   window.webkit.messageHandlers.practicePiano.postMessage(command)
 *   Android: window.practicePianoAndroid.postMessage(JSON.stringify(command))
 *            (a WebMessageListener the app injects for its own origin only)
 *
 *   { cmd: 'hello' }                  ask for the current MIDI source list
 *   { cmd: 'rescan' }                 re-enumerate MIDI sources
 *   { cmd: 'showBluetoothPairing' }   present the Bluetooth MIDI pairing sheet
 *   Android only:
 *   { cmd: 'theme', dark, color }     system bars follow the app theme
 *   { cmd: 'saveFile', id, name, mimeType, text }
 *                                     save a file through the system picker (a WebView has no
 *                                     downloads)
 *
 * native → JS: window.__practicePianoNative.receive(message)
 *   { type: 'inputs', inputs: [{ id, name, manufacturer, online }] }
 *   { type: 'midi', source: id, data: number[] }
 *   { type: 'bluetoothClosed' }
 *   { type: 'fileSaved', id, status: 'saved' | 'canceled' | 'failed' }   (Android)
 *
 * native → JS (Android): window.__practicePianoNative.back() → boolean
 *   The system back gesture. Closes what Escape would close and returns true, or returns false
 *   when nothing is open, so the app goes to the background.
 */

export type NativeMessage =
  | { type: 'inputs'; inputs: { id: string; name: string; manufacturer?: string; online?: boolean }[] }
  | { type: 'midi'; source: string; data: number[] }
  | { type: 'bluetoothClosed' }
  | { type: 'fileSaved'; id: string; status: 'saved' | 'canceled' | 'failed' }
  | { type: 'log'; message: string };

export type NativeCommand =
  | { cmd: 'hello' }
  | { cmd: 'rescan' }
  | { cmd: 'showBluetoothPairing' }
  | { cmd: 'theme'; dark: boolean; color: string }
  | { cmd: 'saveFile'; id: string; name: string; mimeType: string; text: string };

export type NativePlatform = 'apple' | 'android';

interface NativeHooks {
  receive(msg: NativeMessage): void;
  back(): boolean;
}

interface NativeWindow {
  webkit?: { messageHandlers?: Record<string, { postMessage(msg: unknown): void } | undefined> };
  practicePianoAndroid?: { postMessage(msg: string): void };
  __practicePianoNative?: NativeHooks;
}

function w(): NativeWindow {
  return globalThis as unknown as NativeWindow;
}

/** Which native wrapper hosts the page, or null in a browser. */
export function nativePlatform(): NativePlatform | null {
  if (w().webkit?.messageHandlers?.practicePiano) return 'apple';
  if (w().practicePianoAndroid) return 'android';
  return null;
}

export function isNativeApp(): boolean {
  return nativePlatform() !== null;
}

export function postNative(cmd: NativeCommand): boolean {
  const apple = w().webkit?.messageHandlers?.practicePiano;
  if (apple) {
    apple.postMessage(cmd);
    return true;
  }
  const android = w().practicePianoAndroid;
  if (android) {
    android.postMessage(JSON.stringify(cmd));
    return true;
  }
  return false;
}

const listeners = new Set<(msg: NativeMessage) => void>();

function hooks(): NativeHooks {
  const win = w();
  win.__practicePianoNative ??= { receive: (msg) => listeners.forEach((l) => l(msg)), back: handleBack };
  return win.__practicePianoNative;
}

/** Installs the receive hook the native side calls into. */
export function onNativeMessage(listener: (msg: NativeMessage) => void): () => void {
  hooks();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Installs the hooks before anything else needs them, so the back gesture works from the start. */
export function installNativeHooks(): void {
  if (isNativeApp()) hooks();
}

/**
 * The Android back gesture: Escape for whatever is open on top (a dialog, the keyboard display
 * menu), a tap on the backdrop for the sidebar drawer. False when nothing is open.
 */
export function handleBack(): boolean {
  if (typeof document === 'undefined') return false;
  const menu = document.querySelector<HTMLElement>('[aria-haspopup][aria-expanded="true"]');
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (menu || dialog) {
    // The menu handles Escape on its own element, the dialogs on window: an event that starts
    // inside the open thing and bubbles reaches both.
    const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const target = menu ?? (focused && dialog?.contains(focused) ? focused : null) ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    return true;
  }
  const backdrop = document.querySelector<HTMLElement>('.drawer-backdrop');
  if (backdrop) {
    backdrop.click();
    return true;
  }
  return false;
}

/** Android: the status and navigation bars take the app's top bar color. */
export function reportTheme(dark: boolean, color: string): void {
  if (nativePlatform() === 'android') postNative({ cmd: 'theme', dark, color });
}

let nextFileId = 1;

/**
 * Android: saves a text file through the system's file picker. Resolves once the person picked a
 * place (or canceled).
 */
export function saveFileNatively(name: string, mimeType: string, text: string): Promise<'saved' | 'canceled' | 'failed'> {
  const id = String(nextFileId++);
  return new Promise((resolve) => {
    const stop = onNativeMessage((msg) => {
      if (msg.type !== 'fileSaved' || msg.id !== id) return;
      stop();
      resolve(msg.status);
    });
    if (!postNative({ cmd: 'saveFile', id, name, mimeType, text })) {
      stop();
      resolve('failed');
    }
  });
}
