import AVFoundation
import SwiftUI

/// Native wrapper for practice-piano.com on iPadOS and macOS (Mac Catalyst).
///
/// The whole UI is the Vite web app, bundled into the app and served from an `app://`
/// scheme. The native side adds what WebKit cannot do on Apple platforms:
///  * CoreMIDI input (USB and Bluetooth LE MIDI), bridged into JavaScript
///  * in-app Bluetooth MIDI pairing (CoreAudioKit's CABTMIDICentralViewController)
///  * an audio session that keeps the metronome audible with the silent switch on and
///    lets it route to Bluetooth headphones / the piano's Bluetooth audio input.
@main
struct PracticePianoApp: App {
    init() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true)
        } catch {
            NSLog("practice-piano: audio session setup failed: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            WebContainerView()
                .ignoresSafeArea()
        }
    }
}
