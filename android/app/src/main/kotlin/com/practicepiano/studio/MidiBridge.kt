package com.practicepiano.studio

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.usb.UsbDevice
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Parcelable
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import java.io.Closeable

/**
 * Android MIDI (android.media.midi) → JavaScript. The counterpart of the iPad app's MIDIBridge.
 *
 * Opens every output port of every MIDI device (USB, Bluetooth LE, virtual) and forwards channel
 * voice messages as `{ type: "midi", source, data: [status, d1, d2] }`. Device selection happens
 * in JS, so behavior matches the other backends.
 *
 * A Bluetooth piano is only a MIDI device while some app holds a connection to it. The bridge
 * holds the ones paired in this app and connects them again when the app starts, comes back to
 * the foreground or rescans.
 *
 * Everything here runs on the main thread, except [PortReceiver.onSend].
 */
class MidiBridge(
    private val context: Context,
    /** The current input list, as a bridge message. */
    private val onInputs: (String) -> Unit,
    /** Messages from the piano, as bridge messages: dropped when the page isn't listening. */
    private val onMidi: (List<String>) -> Unit,
) {
    /** Called on the main thread for every batch of MIDI from a piano. */
    var onActivity: (() -> Unit)? = null

    private val manager: MidiManager? = context.getSystemService(MidiManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val prefs = context.getSharedPreferences("bluetooth-midi", Context.MODE_PRIVATE)

    /** Devices opened for listening, by MidiDeviceInfo id. */
    private val opened = mutableMapOf<Int, OpenDevice>()
    private val opening = mutableSetOf<Int>()

    /** Bluetooth connections this app holds, by address. Closing one disconnects the piano. */
    private val bluetooth = mutableMapOf<String, MidiDevice>()
    private val bluetoothPending = mutableSetOf<String>()

    private var started = false

    private class OpenDevice(val device: MidiDevice, val ports: List<Closeable>) {
        fun close() {
            ports.forEach { runCatching { it.close() } }
            runCatching { device.close() }
        }
    }

    private val callback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(device: MidiDeviceInfo) = refresh()

        override fun onDeviceRemoved(device: MidiDeviceInfo) {
            opened.remove(device.id)?.close()
            if (device.type == MidiDeviceInfo.TYPE_BLUETOOTH) {
                bluetoothAddress(device)?.let { bluetooth.remove(it)?.let { conn -> runCatching { conn.close() } } }
            }
            refresh()
        }
    }

    fun start() {
        if (started) return
        val manager = manager ?: return log("This device has no MIDI support.")
        started = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            manager.registerDeviceCallback(MidiManager.TRANSPORT_MIDI_BYTE_STREAM, { main.post(it) }, callback)
        } else {
            @Suppress("DEPRECATION")
            manager.registerDeviceCallback(callback, main)
        }
        rescan()
    }

    fun stop() {
        if (!started) return
        started = false
        manager?.unregisterDeviceCallback(callback)
        opened.values.forEach { it.close() }
        opened.clear()
        bluetooth.values.forEach { runCatching { it.close() } }
        bluetooth.clear()
        main.removeCallbacksAndMessages(null)
    }

    /** Reports the inputs and connects remembered Bluetooth pianos that are not connected. */
    fun rescan() {
        if (!started) return
        reconnectBluetooth()
        refresh()
    }

    // MARK: Devices

    private fun devices(): List<MidiDeviceInfo> {
        val manager = manager ?: return emptyList()
        val all = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            manager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM).toList()
        } else {
            @Suppress("DEPRECATION")
            manager.devices.toList()
        }
        return all.filter { it.outputPortCount > 0 }.sortedBy { it.id }
    }

    /** Opens new devices, forgets vanished ones and reports the list. */
    private fun refresh() {
        if (!started) return
        val devices = devices()
        val present = devices.map { it.id }.toSet()
        opened.keys.filter { it !in present }.forEach { opened.remove(it)?.close() }
        devices.filter { it.id !in opened && it.id !in opening }.forEach(::open)
        report(devices)
    }

    private fun open(info: MidiDeviceInfo) {
        val manager = manager ?: return
        opening += info.id
        manager.openDevice(info, { device ->
            opening -= info.id
            if (device == null) {
                log("Could not open ${name(info)}.")
                return@openDevice
            }
            if (!started || devices().none { it.id == info.id }) {
                runCatching { device.close() }
                return@openDevice
            }
            val ids = sourceIds(devices())
            val ports = (0 until info.outputPortCount).mapNotNull { index ->
                val port: MidiOutputPort = device.openOutputPort(index) ?: return@mapNotNull null
                port.connect(PortReceiver(ids[info.id to index] ?: "${info.id}:$index"))
                port
            }
            opened[info.id] = OpenDevice(device, ports)
            report(devices())
        }, main)
    }

    private fun report(devices: List<MidiDeviceInfo>) {
        val ids = sourceIds(devices)
        val inputs = devices.flatMap { info ->
            (0 until info.outputPortCount).map { index ->
                BridgeJson.Input(
                    id = ids.getValue(info.id to index),
                    name = portName(info, index),
                    manufacturer = info.properties.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER).orEmpty(),
                    online = info.id in opened,
                )
            }
        }
        onInputs(BridgeJson.inputs(inputs))
    }

    /**
     * Ids that stay the same when the piano reconnects (Android numbers a device anew each
     * time), so a piano chosen in the app stays chosen: the Bluetooth address, the USB vendor
     * and product, or the name, then the port.
     */
    private fun sourceIds(devices: List<MidiDeviceInfo>): Map<Pair<Int, Int>, String> {
        val used = mutableSetOf<String>()
        val ids = mutableMapOf<Pair<Int, Int>, String>()
        for (info in devices) {
            var base = baseId(info)
            if (base in used) base = "$base#${info.id}"
            used += base
            for (index in 0 until info.outputPortCount) ids[info.id to index] = "$base:$index"
        }
        return ids
    }

    private fun baseId(info: MidiDeviceInfo): String = when (info.type) {
        MidiDeviceInfo.TYPE_BLUETOOTH -> bluetoothAddress(info)?.let { "bt:$it" }
        MidiDeviceInfo.TYPE_USB -> usbDevice(info)?.let { "usb:%04x:%04x".format(it.vendorId, it.productId) }
        else -> null
    } ?: "midi:${name(info)}"

    private fun name(info: MidiDeviceInfo): String {
        val p = info.properties
        return p.getString(MidiDeviceInfo.PROPERTY_NAME)?.takeIf { it.isNotBlank() }
            ?: p.getString(MidiDeviceInfo.PROPERTY_PRODUCT)?.takeIf { it.isNotBlank() }
            ?: "MIDI input"
    }

    private fun portName(info: MidiDeviceInfo, index: Int): String {
        val name = name(info)
        if (info.outputPortCount < 2) return name
        val port = info.ports.firstOrNull { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT && it.portNumber == index }?.name
        return if (!port.isNullOrBlank() && port != name) "$name ($port)" else "$name (port ${index + 1})"
    }

    // MARK: Receiving (onSend runs on the port's own thread)

    private inner class PortReceiver(private val source: String) : MidiReceiver() {
        private val framer = MidiFramer()

        override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
            val messages = framer.feed(msg, offset, count)
            if (messages.isEmpty()) return
            val batch = messages.map { BridgeJson.midi(source, it) }
            main.post {
                onMidi(batch)
                onActivity?.invoke()
            }
        }
    }

    // MARK: Bluetooth

    fun canConnectBluetooth(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    /** Addresses of the Bluetooth MIDI devices this app is connected to. */
    fun connectedBluetooth(): Set<String> = bluetooth.keys.toSet()

    /** Connects a Bluetooth LE MIDI device (from the pairing sheet) and remembers it. */
    fun connectBluetooth(device: BluetoothDevice, done: (Boolean) -> Unit) {
        val manager = manager
        val address = device.address
        if (manager == null || !canConnectBluetooth()) return done(false)
        if (address in bluetooth) return done(true)
        bluetoothPending += address
        // A device that is out of range may never answer: give up after a while, so the next
        // rescan can try again.
        val timeout = Runnable {
            if (bluetoothPending.remove(address)) done(false)
        }
        main.postDelayed(timeout, BLUETOOTH_TIMEOUT_MS)
        try {
            manager.openBluetoothDevice(device, { midiDevice ->
                main.removeCallbacks(timeout)
                val waiting = bluetoothPending.remove(address)
                when {
                    midiDevice == null -> if (waiting) done(false)
                    // Stopped meanwhile, or connected twice: keep the one connection there is.
                    !started || address in bluetooth -> {
                        runCatching { midiDevice.close() }
                        if (waiting) done(address in bluetooth)
                    }
                    else -> {
                        bluetooth[address] = midiDevice
                        prefs.edit { putStringSet(KEY_REMEMBERED, remembered() + address) }
                        if (waiting) done(true)
                        refresh()
                    }
                }
            }, main)
        } catch (e: SecurityException) {
            main.removeCallbacks(timeout)
            bluetoothPending -= address
            log("Bluetooth permission missing: ${e.message}")
            done(false)
        }
    }

    private fun remembered(): Set<String> = prefs.getStringSet(KEY_REMEMBERED, emptySet()).orEmpty()

    private fun reconnectBluetooth() {
        if (!canConnectBluetooth()) return
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: return
        if (!adapter.isEnabled) return
        for (address in remembered()) {
            if (address in bluetooth || address in bluetoothPending) continue
            if (!BluetoothAdapter.checkBluetoothAddress(address)) continue
            connectBluetooth(adapter.getRemoteDevice(address)) { }
        }
    }

    private fun bluetoothAddress(info: MidiDeviceInfo): String? =
        parcelable(info.properties, MidiDeviceInfo.PROPERTY_BLUETOOTH_DEVICE, BluetoothDevice::class.java)?.address

    private fun usbDevice(info: MidiDeviceInfo): UsbDevice? =
        parcelable(info.properties, MidiDeviceInfo.PROPERTY_USB_DEVICE, UsbDevice::class.java)

    private fun <T : Any> parcelable(bundle: Bundle, key: String, type: Class<T>): T? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            bundle.getParcelable(key, type)
        } else {
            @Suppress("DEPRECATION")
            bundle.getParcelable<Parcelable>(key)?.takeIf(type::isInstance)?.let(type::cast)
        }

    private fun log(message: String) {
        Log.w(TAG, message)
    }

    companion object {
        private const val TAG = "practice-piano"
        private const val KEY_REMEMBERED = "remembered"
        private const val BLUETOOTH_TIMEOUT_MS = 30_000L
    }
}
