# Android app

Chrome on Android has Web MIDI and finds USB pianos, but it cannot pair a Bluetooth MIDI piano:
on Android only an app that opens the piano makes it a MIDI device. The Android app solves that
the way the [iPad app](NATIVE.md) does. A small Kotlin app hosts the exact same web build in a
`WebView`, and adds **Android MIDI** (`android.media.midi`) input plus **in-app Bluetooth MIDI
pairing**.

It is made for tablets and runs on phones too: Android 10 (API 29) or later, with MIDI support
(nearly every device; the Play Store hides the app where it is missing).

## Install a ready-made build

Every push and pull request builds a debug APK in CI (`checks.yml`, job **android**):

1. Open the run on GitHub → *Summary* → *Artifacts* → **practice-piano-android-debug**, and unzip it.
2. Copy `app-debug.apk` to the tablet and open it. Allow your browser or file manager to install
   unknown apps when Android asks.

A debug build is signed with a debug key. Before installing a build signed with another key,
uninstall the old one (your progress goes with it: *Progress → Export JSON* first).

## Requirements to build

- A current **Android Studio** (one that supports Android Gradle plugin 9.5), or JDK 17+ and the
  Android SDK command-line tools (platform 37, build tools)
- **Node.js 20.19+** and npm (found on PATH, in Homebrew, nvm or volta, or at `NODE_HOME`)

## Build & run

```bash
npm install                 # once
```

- **Android Studio:** *Open* the `android/` folder, pick your tablet (USB debugging on; or an
  emulator) and press **Run**.
- **Command line:**

  ```bash
  cd android
  ./gradlew installDebug      # build and install on the connected device
  ./gradlew assembleDebug     # just the APK: app/build/outputs/apk/debug/app-debug.apk
  npm run android:check       # from the root: unit tests, lint and the APK
  ```

The **buildWebApp** task runs `npm run build:android` (Vite, `--mode android`) and adds the result
to the APK's assets, so the app always contains the current web code. Gradle skips it when no web
source changed. The web build is the same as `build:native`: no analytics, no service worker.

### Release build

Create an upload key once and keep it out of the repository:

```bash
keytool -genkeypair -v -keystore android/release.jks -alias practice-piano -keyalg RSA -keysize 4096 -validity 10000
```

Then `android/keystore.properties` (ignored by git):

```properties
storeFile=release.jks
storePassword=…
keyAlias=practice-piano
keyPassword=…
```

`./gradlew assembleRelease` (an APK) or `./gradlew bundleRelease` (an App Bundle for the Play
Store) then signs with it. Without the file, release builds come out unsigned.

## Using it

- **Piano & audio → Piano** (the piano button in the top bar) shows *Android MIDI (native app)*.
  USB pianos appear by themselves (a USB-C or OTG adapter to the piano's "USB to Host" port).
- **Pair Bluetooth MIDI** asks for the *Nearby devices* permission (Android 12 and later; on 10
  and 11 *Location*, with Location on), then lists the Bluetooth MIDI pianos nearby. Tap yours to
  connect. The app remembers it and connects it again whenever it starts or comes back to the
  foreground with the piano on.
- The back gesture closes an open dialog, menu or the sidebar drawer, and otherwise sends the
  app to the background, like the Home button.
- The screen stays on while you play (until 10 minutes after the last note): playing the piano
  never touches the screen.
- The volume buttons set the metronome volume. Bluetooth audio adds about 200 ms of delay: choose
  the **Headphones on piano** preset or calibrate (*Piano & audio → Audio & timing*).
- *Progress → Export JSON* saves the backup where you pick; *Import* opens it from any file app.
- A hardware keyboard works for computer-key practice too.

## How it fits together

| File (`android/app/src/main/kotlin/com/practicepiano/studio/`) | Role |
|---|---|
| `MainActivity.kt` | Hosts the `WebView`; serves the bundled build at `https://appassets.androidplatform.net/` (`WebViewAssetLoader`, a real origin, so ES modules and `localStorage` work as on the web); JS ↔ native commands, file picker, back gesture, theme, screen |
| `WebBridge.kt` | Delivers messages to the page; holds them until the page says hello |
| `MidiBridge.kt` | Android MIDI: opens every device's output ports, keeps the Bluetooth connections |
| `MidiFramer.kt` | MIDI 1.0 byte stream → messages (running status, real-time bytes, SysEx skipped) |
| `BluetoothMidiPairing.kt` | Permissions, Bluetooth on, the scan sheet (BLE MIDI service UUID) |
| `BridgeJson.kt`, `FileTypes.kt` | Bridge messages as JSON, file picker types (unit tested) |

The bridge protocol is the iPad app's, documented in `src/platform/native.ts`. Only the way in
differs: the page posts JSON text to `window.practicePianoAndroid`, a `WebMessageListener` the app
injects for its own origin and main frame only. Android adds three things a `WebView` lacks:
`theme` (system bar colors), `saveFile` / `fileSaved` (a `WebView` has no downloads) and
`window.__practicePianoNative.back()` (the back gesture). On the web side `NativeMidiBackend`
serves both apps, so device selection, parsing and scoring are shared code.

Source ids stay the same when a piano reconnects (`bt:<address>:<port>`, `usb:<vendor>:<product>:<port>`),
so a piano chosen in *Piano & audio* stays chosen.

## Tests

- `android/app/src/test`: JVM unit tests for the MIDI framer, the bridge JSON and the file types
  (`./gradlew testDebugUnitTest`).
- `e2e/android.spec.ts`: the page with a fake of the Android bridge (inputs, MIDI, pairing, back,
  theme, saving a file).
- On a device: connect a USB piano and a Bluetooth one, play in each lesson, rotate the tablet
  mid-run, switch apps and come back, export and import a backup, and check both themes.

## Debugging

Debug builds have an inspectable web view: `chrome://inspect` in desktop Chrome, with the tablet
connected over USB. Native logs: `adb logcat -s practice-piano`.
