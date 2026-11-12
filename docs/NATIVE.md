# iPadOS & macOS app

Safari and every iPad browser lack Web MIDI, and pairing a Bluetooth MIDI piano through system
utilities is awkward. The native wrapper solves both: a small SwiftUI app hosts the exact same
web build in a `WKWebView`, and adds **CoreMIDI** input plus **in-app Bluetooth MIDI pairing**
(`CABTMIDICentralViewController` from CoreAudioKit).

The target is an iPad app that also builds for **Mac Catalyst**, so the same project runs on iPad,
on Apple-silicon and Intel Macs, and on iPhone.

## Requirements

- macOS with **Xcode 16 or newer**
- **Node.js 20.19+** and npm (Homebrew, nvm or volta are all found by the build script)
- An Apple ID (the free *Personal Team* is enough for running on your own devices)

## Build & run

```bash
npm install                 # once
open native/PracticePiano.xcodeproj
```

1. Select the **PracticePiano** target → *Signing & Capabilities* → **Team**: your Personal Team.
   The bundle id defaults to `com.practicepiano.<your-mac-username>.studio`, which is unique
   enough for a free team; change it if Xcode asks.
2. Pick a run destination:
   - your **iPad** (connected by cable or on the same network; enable *Developer Mode* in iPad
     Settings → Privacy & Security the first time), or
   - **My Mac (Mac Catalyst)**.
3. Press **Run**. On first launch on iPad, trust the developer profile under
   Settings → General → VPN & Device Management.

The **Embed web app** build phase runs `npm run build:native` (Vite builds into
`native/PracticePiano/Web`) and copies that folder into the app bundle. Set the build setting /
environment variable `SKIP_WEB_BUILD=1` to embed the existing build without rebuilding.

> Free-team apps expire after 7 days on iOS/iPadOS; just run again from Xcode to renew.

## Using it

- **Input & audio → MIDI input** shows *CoreMIDI (native app)*. USB pianos appear immediately.
- **Pair Bluetooth MIDI…** opens Apple's Bluetooth MIDI browser; tap your piano to connect. The
  piano then shows up as a normal input (re-scanned automatically when the sheet closes).
- The audio session uses the *playback* category, so the metronome sounds with the silent switch
  on and can be routed to Bluetooth headphones or the piano's Bluetooth audio input. Choose the
  **Headphones on piano** preset in that case (~180 ms compensation).
- A hardware keyboard (Magic Keyboard / Mac) works for QWERTY practice too.

## How it fits together

| File | Role |
|---|---|
| `PracticePianoApp.swift` | App entry; configures `AVAudioSession` |
| `WebContainer.swift` | `WKWebView` host; JS ↔ native message routing |
| `AppSchemeHandler.swift` | Serves the bundled build at `app://local/…` (a real origin, so ES modules and `localStorage` work as on the web) |
| `MIDIBridge.swift` | CoreMIDI client, source enumeration, UMP → MIDI 1.0 bytes |
| `BluetoothMIDIPairing.swift` | Presents `CABTMIDICentralViewController` |

Bridge protocol (also documented in `src/platform/native.ts`):

```
JS → native   window.webkit.messageHandlers.practicePiano.postMessage({ cmd })
              cmd: 'hello' | 'rescan' | 'showBluetoothPairing'
native → JS   window.__practicePianoNative.receive(msg)
              { type: 'inputs', inputs: [{ id, name, manufacturer, online }] }
              { type: 'midi', source: id, data: [status, data1, data2] }
              { type: 'bluetoothClosed' } | { type: 'log', message }
```

On the web side `NativeMidiBackend` implements the same `MidiBackend` interface as
`WebMidiBackend`, so device selection, parsing and scoring are shared code.

## Debugging

The web view is inspectable (iOS/macOS 16.4+): Safari → *Develop* → your device →
*Practice Piano*. Native logs appear in Xcode's console with the `practice-piano` prefix.
