import CoreMIDI
import Foundation

/// CoreMIDI input → JavaScript.
///
/// Connects to every MIDI source (USB, Bluetooth LE, network) and forwards MIDI 1.0
/// channel-voice messages as `{ type: "midi", source, data: [status, d1, d2] }`.
/// Device selection happens in JS so behaviour matches the Web MIDI backend.
final class MIDIBridge {
    /// Called on the main thread with a JSON object literal.
    var onMessage: ((String) -> Void)?

    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var connected: [MIDIUniqueID: MIDIEndpointRef] = [:]

    func start() {
        guard client == 0 else { return }
        var status = MIDIClientCreateWithBlock("practice-piano" as CFString, &client) { [weak self] notification in
            switch notification.pointee.messageID {
            case .msgSetupChanged, .msgObjectAdded, .msgObjectRemoved, .msgPropertyChanged:
                DispatchQueue.main.async { self?.rescan() }
            default:
                break
            }
        }
        guard status == noErr else {
            log("MIDIClientCreate failed (\(status))")
            return
        }
        status = MIDIInputPortCreateWithProtocol(client, "practice-piano input" as CFString, ._1_0, &inputPort) { [weak self] eventList, connRefCon in
            self?.receive(eventList, refCon: connRefCon)
        }
        guard status == noErr else {
            log("MIDIInputPortCreate failed (\(status))")
            return
        }
        rescan()
    }

    /// Re-enumerates sources, connects new ones, drops vanished ones and reports the list.
    func rescan() {
        guard inputPort != 0 else { return }
        var inputs: [[String: Any]] = []
        var seen = Set<MIDIUniqueID>()
        for index in 0 ..< MIDIGetNumberOfSources() {
            let source = MIDIGetSource(index)
            guard source != 0 else { continue }
            let uid = Self.intProperty(source, kMIDIPropertyUniqueID)
            seen.insert(uid)
            if connected[uid] == nil {
                // The unique id travels with every packet as the connection refCon.
                let refCon = UnsafeMutableRawPointer(bitPattern: Int(uid))
                if MIDIPortConnectSource(inputPort, source, refCon) == noErr {
                    connected[uid] = source
                }
            }
            inputs.append([
                "id": String(uid),
                "name": Self.stringProperty(source, kMIDIPropertyDisplayName)
                    ?? Self.stringProperty(source, kMIDIPropertyName) ?? "MIDI input",
                "manufacturer": Self.stringProperty(source, kMIDIPropertyManufacturer) ?? "",
                "online": Self.intProperty(source, kMIDIPropertyOffline) == 0,
            ])
        }
        for (uid, source) in connected where !seen.contains(uid) {
            MIDIPortDisconnectSource(inputPort, source)
            connected[uid] = nil
        }
        emit(["type": "inputs", "inputs": inputs])
    }

    // MARK: Receiving (runs on CoreMIDI's high-priority thread)

    private func receive(_ list: UnsafePointer<MIDIEventList>, refCon: UnsafeMutableRawPointer?) {
        let uid = refCon.map { MIDIUniqueID(truncatingIfNeeded: Int(bitPattern: $0)) } ?? 0
        var messages: [[Int]] = []

        let packetOffset = MemoryLayout<MIDIEventList>.offset(of: \MIDIEventList.packet)!
        let wordsOffset = MemoryLayout<MIDIEventPacket>.offset(of: \MIDIEventPacket.words)!
        var packet = UnsafeRawPointer(list).advanced(by: packetOffset).assumingMemoryBound(to: MIDIEventPacket.self)
        for _ in 0 ..< list.pointee.numPackets {
            let count = Int(packet.pointee.wordCount)
            let words = UnsafeRawPointer(packet).advanced(by: wordsOffset).assumingMemoryBound(to: UInt32.self)
            var i = 0
            while i < count {
                let word = words[i]
                let messageType = (word >> 28) & 0xF
                if messageType == 0x2 {
                    // MIDI 1.0 channel voice message in a Universal MIDI Packet.
                    messages.append([Int((word >> 16) & 0xFF), Int((word >> 8) & 0x7F), Int(word & 0x7F)])
                }
                i += Self.umpWordCount(messageType)
            }
            packet = UnsafePointer(MIDIEventPacketNext(packet))
        }
        guard !messages.isEmpty else { return }
        let batch = messages
        DispatchQueue.main.async { [weak self] in
            for data in batch {
                self?.emit(["type": "midi", "source": String(uid), "data": data])
            }
        }
    }

    // MARK: Helpers

    private static func umpWordCount(_ messageType: UInt32) -> Int {
        switch messageType {
        case 0x0, 0x1, 0x2, 0x6, 0x7: return 1
        case 0x3, 0x4, 0x8, 0x9, 0xA: return 2
        case 0xB, 0xC: return 3
        default: return 4
        }
    }

    private func emit(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8) else { return }
        onMessage?(json)
    }

    private func log(_ message: String) {
        NSLog("practice-piano MIDI: \(message)")
        emit(["type": "log", "message": message])
    }

    private static func stringProperty(_ object: MIDIObjectRef, _ key: CFString) -> String? {
        var value: Unmanaged<CFString>?
        guard MIDIObjectGetStringProperty(object, key, &value) == noErr, let value else { return nil }
        return value.takeRetainedValue() as String
    }

    private static func intProperty(_ object: MIDIObjectRef, _ key: CFString) -> Int32 {
        var value: Int32 = 0
        MIDIObjectGetIntegerProperty(object, key, &value)
        return value
    }
}
