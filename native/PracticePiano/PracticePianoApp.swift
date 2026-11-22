import AVFoundation
import SwiftUI
import UIKit

/// Native wrapper for practice-piano.com on iPadOS and macOS (Mac Catalyst).
///
/// The whole UI is the Vite web app, bundled into the app and served from an `app://`
/// scheme. The native side adds what WebKit cannot do on Apple platforms:
///  * CoreMIDI input (USB and Bluetooth LE MIDI), bridged into JavaScript
///  * in-app Bluetooth MIDI pairing (CoreAudioKit's CABTMIDICentralViewController)
///  * an audio session that keeps the metronome audible with the silent switch on and
///    lets it route to Bluetooth headphones / the piano's Bluetooth audio input, and that
///    tells the web side when the system stopped its audio (see AudioSessionMonitor).
@main
struct PracticePianoApp: App {
    init() {
        AudioSessionMonitor.configure()
    }

    var body: some Scene {
        WindowGroup {
            WebContainerView()
                .ignoresSafeArea()
        }
    }
}

/// Watches the audio session and reports what happens to it.
///
/// The web app's sound is Web Audio, which WebKit can stop on an interruption, a route change
/// (a Bluetooth device connecting) or in the background and does not always restart. Each event
/// goes to the web side as `{ type: "audio", event }` so the audio engine resumes or rebuilds its
/// context, and to the log with the reason iOS gives (filter Xcode's console by
/// "practice-piano audio").
final class AudioSessionMonitor {
    /// Called on the main thread with one of `NativeAudioEvent` in src/platform/native.ts.
    var onEvent: ((String) -> Void)?

    private var observers: [NSObjectProtocol] = []

    static func configure() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true)
        } catch {
            log("session setup failed: \(error)")
        }
    }

    private static func activate() {
        do {
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            log("reactivating the session failed: \(error)")
        }
    }

    func start() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        observers = [
            center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] note in
                self?.interruption(note)
            },
            center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] note in
                self?.routeChange(note)
            },
            center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: session, queue: .main) { [weak self] _ in
                Self.log("media services were reset")
                Self.configure()
                self?.onEvent?("mediaServicesReset")
            },
            center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                Self.log("app became active, \(Self.describe(session))")
                Self.activate()
                self?.onEvent?("becameActive")
            },
        ]
        Self.log("watching, \(Self.describe(session))")
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    private func interruption(_ note: Notification) {
        guard let info = note.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else { return }
        switch type {
        case .began:
            let reason = (info[AVAudioSessionInterruptionReasonKey] as? UInt).map(Self.interruptionReason) ?? "no reason given"
            Self.log("interruption began (\(reason))")
            onEvent?("interruptionBegan")
        case .ended:
            let options = AVAudioSession.InterruptionOptions(rawValue: info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            Self.log("interruption ended (\(options.contains(.shouldResume) ? "should resume" : "no resume hint"))")
            Self.activate()
            onEvent?("interruptionEnded")
        @unknown default:
            Self.log("interruption of unknown type \(rawType)")
        }
    }

    private func routeChange(_ note: Notification) {
        let session = AVAudioSession.sharedInstance()
        let rawReason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
        let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason).map(Self.routeChangeReason) ?? "reason \(rawReason)"
        let previous = (note.userInfo?[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription).map(Self.outputs) ?? "?"
        Self.log("route changed (\(reason)): \(previous) -> \(Self.describe(session))")
        onEvent?("routeChanged")
    }

    // MARK: Log text

    static func log(_ message: String) {
        NSLog("practice-piano audio: %@", message)
    }

    private static func describe(_ session: AVAudioSession) -> String {
        "output \(outputs(session.currentRoute)), category \(session.category.rawValue), " +
            "options \(session.categoryOptions.rawValue), other audio playing \(session.isOtherAudioPlaying)"
    }

    private static func outputs(_ route: AVAudioSessionRouteDescription) -> String {
        let ports = route.outputs.map { "\($0.portName) (\($0.portType.rawValue))" }
        return ports.isEmpty ? "none" : ports.joined(separator: ", ")
    }

    private static func interruptionReason(_ raw: UInt) -> String {
        guard let reason = AVAudioSession.InterruptionReason(rawValue: raw) else { return "reason \(raw)" }
        #if !targetEnvironment(macCatalyst)
        if #available(iOS 17.0, *), reason == .routeDisconnected { return "route disconnected" }
        #endif
        switch reason {
        case .default: return "another session took the audio"
        case .builtInMicMuted: return "built-in mic muted"
        default: return "reason \(raw)"
        }
    }

    private static func routeChangeReason(_ reason: AVAudioSession.RouteChangeReason) -> String {
        switch reason {
        case .newDeviceAvailable: return "new device"
        case .oldDeviceUnavailable: return "device gone"
        case .categoryChange: return "category changed"
        case .override: return "override"
        case .wakeFromSleep: return "wake from sleep"
        case .noSuitableRouteForCategory: return "no suitable route"
        case .routeConfigurationChange: return "configuration changed"
        case .unknown: return "unknown"
        @unknown default: return "reason \(reason.rawValue)"
        }
    }
}
