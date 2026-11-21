package com.practicepiano.studio

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.provider.Settings
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import java.util.UUID

/**
 * The "Pair Bluetooth MIDI" sheet: finds Bluetooth LE MIDI pianos nearby and connects the one
 * you tap, without leaving the app. The Android counterpart of the iPad app's
 * BluetoothMIDIPairing (Apple's CABTMIDICentralViewController).
 *
 * Asks for what Android needs first: the Nearby devices permission (Android 12 and later), or
 * Location permission with Location on (Android 10 and 11), and Bluetooth switched on.
 *
 * Create it in onCreate: it registers activity results.
 */
class BluetoothMidiPairing(
    private val activity: ComponentActivity,
    private val midi: MidiBridge,
    /** The dialog theme for the app's current light or dark theme. */
    private val dialogTheme: () -> Int,
    /** The sheet closed (connected or not): the page rescans. */
    private val onClosed: () -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private var dialog: AlertDialog? = null

    private val permissions = activity.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.all { it }) show() else explain(R.string.permission_title, permissionMessage(), Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", activity.packageName, null)))
    }

    private val enableBluetooth = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (adapter()?.isEnabled == true) show() else explain(R.string.pairing_title, R.string.bluetooth_off, null)
    }

    private fun adapter(): BluetoothAdapter? = activity.getSystemService(BluetoothManager::class.java)?.adapter

    private fun requiredPermissions(): List<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    private fun permissionMessage() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) R.string.permission_nearby else R.string.permission_location

    private fun hasPermissions() = requiredPermissions().all {
        ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
    }

    /** Opens the sheet, after asking for whatever is missing. */
    fun show() {
        if (dialog?.isShowing == true) return
        val adapter = adapter()
        when {
            adapter == null || !activity.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) ->
                explain(R.string.bluetooth_missing_title, R.string.bluetooth_missing, null)
            !hasPermissions() -> permissions.launch(requiredPermissions().toTypedArray())
            !adapter.isEnabled -> requestBluetooth()
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S && !locationOn() ->
                explain(R.string.location_off_title, R.string.location_off, Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            else -> Sheet(adapter).open()
        }
    }

    @SuppressLint("MissingPermission") // show() checked BLUETOOTH_CONNECT first.
    private fun requestBluetooth() {
        try {
            enableBluetooth.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
        } catch (_: ActivityNotFoundException) {
            explain(R.string.pairing_title, R.string.bluetooth_off, null)
        }
    }

    private fun locationOn(): Boolean = activity.getSystemService(LocationManager::class.java)?.isLocationEnabled == true

    /** A short dialog that says what is missing, with a way to fix it when there is one. */
    private fun explain(title: Int, message: Int, settings: Intent?) {
        val builder = AlertDialog.Builder(activity, dialogTheme())
            .setTitle(title)
            .setMessage(message)
            .setOnDismissListener { onClosed() }
        if (settings != null) {
            builder.setPositiveButton(R.string.open_settings) { _, _ ->
                try {
                    activity.startActivity(settings)
                } catch (_: ActivityNotFoundException) {
                    // Nothing to open: the message says what to do.
                }
            }
            builder.setNegativeButton(R.string.close, null)
        } else {
            builder.setPositiveButton(R.string.close, null)
        }
        builder.show()
    }

    private enum class State { FOUND, CONNECTING, CONNECTED, FAILED }

    private class Row(val device: BluetoothDevice, var name: String, var state: State)

    /** The list of pianos found nearby. Scans for 20 s, again on Search again. */
    private inner class Sheet(private val adapter: BluetoothAdapter) {
        private val rows = mutableListOf<Row>()
        private val status = TextView(activity)
        private val list = ListView(activity)
        private var scanning = false
        private val stopLater = Runnable { stopScan() }

        private val listAdapter = object : BaseAdapter() {
            override fun getCount() = rows.size
            override fun getItem(position: Int) = rows[position]
            override fun getItemId(position: Int) = position.toLong()

            override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
                val view = convertView ?: activity.layoutInflater.inflate(android.R.layout.simple_list_item_2, parent, false)
                val row = rows[position]
                view.findViewById<TextView>(android.R.id.text1).text = row.name
                view.findViewById<TextView>(android.R.id.text2).setText(
                    when (row.state) {
                        State.FOUND -> R.string.pairing_tap
                        State.CONNECTING -> R.string.pairing_connecting
                        State.CONNECTED -> R.string.pairing_connected
                        State.FAILED -> R.string.pairing_failed
                    },
                )
                return view
            }
        }

        private val scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) = found(result)

            override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::found)

            override fun onScanFailed(errorCode: Int) {
                scanning = false
                updateStatus()
            }
        }

        fun open() {
            val padding = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 24f, activity.resources.displayMetrics).toInt()
            status.setPadding(padding, padding / 2, padding, padding / 2)
            list.adapter = listAdapter
            list.setOnItemClickListener { _, _, position, _ -> connect(rows[position]) }
            val content = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                addView(status)
                addView(list, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            }
            val sheet = AlertDialog.Builder(activity, dialogTheme())
                .setTitle(R.string.pairing_title)
                .setView(content)
                .setPositiveButton(R.string.pairing_done, null)
                .setNeutralButton(R.string.pairing_search_again, null)
                .setOnDismissListener {
                    stopScan()
                    dialog = null
                    onClosed()
                }
                .create()
            dialog = sheet
            sheet.show()
            // Search again must not close the sheet.
            sheet.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener { startScan() }
            startScan()
        }

        @SuppressLint("MissingPermission") // show() checked the scan permission first.
        private fun startScan() {
            val scanner = adapter.bluetoothLeScanner
            if (scanning || scanner == null || !hasPermissions()) return updateStatus()
            val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(MIDI_SERVICE)).build()
            val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
            try {
                scanner.startScan(listOf(filter), settings, scanCallback)
                scanning = true
                main.postDelayed(stopLater, SCAN_MS)
            } catch (_: SecurityException) {
                scanning = false
            }
            updateStatus()
        }

        @SuppressLint("MissingPermission") // Only stops a scan this sheet started.
        private fun stopScan() {
            main.removeCallbacks(stopLater)
            if (!scanning) return
            scanning = false
            try {
                adapter.bluetoothLeScanner?.stopScan(scanCallback)
            } catch (_: SecurityException) {
                // Permission withdrawn meanwhile: the scan ended with it.
            }
            if (dialog != null) updateStatus()
        }

        @SuppressLint("MissingPermission") // The name needs BLUETOOTH_CONNECT, which show() checked.
        private fun found(result: ScanResult) {
            val device = result.device
            val name = result.scanRecord?.deviceName?.takeIf { it.isNotBlank() }
                ?: runCatching { device.name }.getOrNull()?.takeIf { it.isNotBlank() }
                ?: activity.getString(R.string.pairing_unnamed)
            val row = rows.firstOrNull { it.device.address == device.address }
            if (row == null) {
                val state = if (device.address in midi.connectedBluetooth()) State.CONNECTED else State.FOUND
                rows += Row(device, name, state)
            } else {
                row.name = name
            }
            listAdapter.notifyDataSetChanged()
            updateStatus()
        }

        private fun connect(row: Row) {
            if (row.state == State.CONNECTING || row.state == State.CONNECTED) return
            // Connecting works better without a scan running.
            stopScan()
            row.state = State.CONNECTING
            listAdapter.notifyDataSetChanged()
            midi.connectBluetooth(row.device) { ok ->
                row.state = if (ok) State.CONNECTED else State.FAILED
                listAdapter.notifyDataSetChanged()
            }
        }

        private fun updateStatus() {
            status.setText(
                when {
                    scanning && rows.isEmpty() -> R.string.pairing_searching
                    rows.isEmpty() -> R.string.pairing_none
                    else -> R.string.pairing_hint
                },
            )
        }
    }

    companion object {
        /** The Bluetooth LE MIDI service (MIDI over Bluetooth Low Energy specification). */
        private val MIDI_SERVICE: UUID = UUID.fromString("03B80E5A-EDE8-4B33-A751-6CE34EC4C700")
        private const val SCAN_MS = 20_000L
    }
}
