package com.practicepiano.studio

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.graphics.toColorInt
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Native wrapper for practice-piano.com on Android tablets (and phones).
 *
 * The whole UI is the Vite web app, bundled into the APK's assets and served from
 * https://appassets.androidplatform.net (a real https origin, so ES modules and localStorage
 * work as on the web). The native side adds what an Android WebView cannot do:
 *  * Android MIDI input (USB and Bluetooth LE MIDI), bridged into JavaScript
 *  * in-app Bluetooth MIDI pairing
 *  * saving and opening backup files, the system back gesture, and the screen kept on while
 *    the piano is played
 *
 * The counterpart of the iPad app's PracticePianoApp and WebContainer (native/PracticePiano).
 */
class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private var webView: WebView? = null
    private var bridge: WebBridge? = null
    private lateinit var midi: MidiBridge
    private lateinit var pairing: BluetoothMidiPairing

    private val prefs by lazy { getSharedPreferences("app", MODE_PRIVATE) }
    private var dark = false
    private val io = Executors.newSingleThreadExecutor()

    private val assets by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    // MARK: Files (Import and Export JSON in the Progress tab)

    private var fileChooser: ValueCallback<Array<Uri>>? = null
    private val openDocument = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        fileChooser?.onReceiveValue(uri?.let { arrayOf(it) })
        fileChooser = null
    }

    private class PendingSave(val id: String, val text: String)

    private var pendingSave: PendingSave? = null
    private val createDocument = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val save = pendingSave ?: return@registerForActivityResult
        pendingSave = null
        val uri = result.data?.data
        if (result.resultCode != RESULT_OK || uri == null) return@registerForActivityResult fileSaved(save.id, "canceled")
        io.execute {
            val ok = runCatching {
                contentResolver.openOutputStream(uri, "wt")!!.use { it.write(save.text.toByteArray(Charsets.UTF_8)) }
            }.onFailure { Log.w(TAG, "Saving failed", it) }.isSuccess
            runOnUiThread { fileSaved(save.id, if (ok) "saved" else "failed") }
        }
    }

    // MARK: Lifecycle

    override fun onCreate(savedInstanceState: Bundle?) {
        dark = prefs.getBoolean(KEY_DARK, false)
        enableEdgeToEdge(barStyle(), barStyle())
        super.onCreate(savedInstanceState)
        // The volume buttons set the metronome's volume, also when nothing is playing.
        volumeControlStream = AudioManager.STREAM_MUSIC

        root = FrameLayout(this)
        setContentView(root)
        // The page sits between the system bars; the bars show the page's top bar color.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }
        applyTheme(dark, prefs.getInt(KEY_COLOR, defaultColor(dark)))

        midi = MidiBridge(
            this,
            onInputs = { bridge?.send(it) },
            onMidi = { bridge?.sendLive(it) },
        )
        midi.onActivity = ::keepAwake
        pairing = BluetoothMidiPairing(this, midi, ::dialogTheme) {
            midi.rescan()
            bridge?.send(BridgeJson.bluetoothClosed())
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = back()
        })

        createWebView()
        midi.start()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        // A Bluetooth piano switched on while the app was away connects now.
        midi.rescan()
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        midi.stop()
        root.removeCallbacks(releaseAwake)
        webView?.destroy()
        webView = null
        io.shutdown()
        super.onDestroy()
    }

    // MARK: Web view

    @SuppressLint("SetJavaScriptEnabled") // The app is the page: it runs on JavaScript.
    private fun createWebView() {
        val view = WebView(this)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            // The layout is made for the page's own type sizes, as in a browser.
            textZoom = 100
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
        view.setBackgroundColor(prefs.getInt(KEY_COLOR, defaultColor(dark)))
        view.overScrollMode = WebView.OVER_SCROLL_NEVER
        view.webViewClient = Client()
        view.webChromeClient = Chrome()
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)

        // JS → native, for this app's own origin and main frame only.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(view, JS_OBJECT, setOf(ORIGIN)) { _, message, _, isMainFrame, _ ->
                if (isMainFrame) message.data?.let(::command)
            }
        } else {
            Log.e(TAG, "This WebView is too old for the MIDI bridge. Update Android System WebView.")
        }

        root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        webView = view
        bridge = WebBridge(view)
        view.loadUrl(START_URL)
    }

    private inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            assets.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            // Keep the app on its bundled pages; open real links in the browser.
            if (request.url.host == HOST) return false
            try {
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
            } catch (_: ActivityNotFoundException) {
                Log.w(TAG, "No app opens ${request.url}")
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            bridge?.pageStarted()
        }

        override fun onPageFinished(view: WebView, url: String?) {
            // A hardware keyboard plays the computer keys straight away.
            view.requestFocus()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // Like the iPad app: start the page again. Progress is saved as it happens.
            Log.w(TAG, "Web content process gone (crash: ${detail.didCrash()}); reloading")
            root.removeView(view)
            view.destroy()
            if (webView === view) {
                webView = null
                bridge = null
                createWebView()
            }
            return true
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileChooser?.onReceiveValue(null)
            fileChooser = callback
            try {
                openDocument.launch(FileTypes.forAccept(params.acceptTypes))
            } catch (_: ActivityNotFoundException) {
                fileChooser = null
                callback.onReceiveValue(null)
            }
            return true
        }
    }

    // MARK: JS → native

    private fun command(body: String) {
        val json = runCatching { JSONObject(body) }.getOrNull() ?: return
        when (val cmd = json.optString("cmd")) {
            "hello", "rescan" -> {
                bridge?.pageReady()
                midi.rescan()
            }
            "showBluetoothPairing" -> pairing.show()
            "theme" -> applyTheme(json.optBoolean("dark"), parseColor(json.optString("color")) ?: defaultColor(json.optBoolean("dark")))
            "saveFile" -> saveFile(json.optString("id"), json.optString("name"), json.optString("mimeType"), json.optString("text"))
            else -> Log.w(TAG, "Unknown command $cmd")
        }
    }

    private fun saveFile(id: String, name: String, mimeType: String, text: String) {
        pendingSave?.let { fileSaved(it.id, "canceled") }
        pendingSave = PendingSave(id, text)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mimeType.ifBlank { "application/octet-stream" })
            .putExtra(Intent.EXTRA_TITLE, name)
        try {
            createDocument.launch(intent)
        } catch (_: ActivityNotFoundException) {
            pendingSave = null
            fileSaved(id, "failed")
        }
    }

    private fun fileSaved(id: String, status: String) {
        bridge?.send(BridgeJson.fileSaved(id, status))
    }

    // MARK: Back

    /** Closes what is open on the page; with nothing open, the app goes to the background. */
    private fun back() {
        val view = webView ?: return moveToBack()
        view.evaluateJavascript("(function(n){return !!(n&&n.back&&n.back())})(window.__practicePianoNative)") { handled ->
            if (handled != "true") moveToBack()
        }
    }

    private fun moveToBack() {
        moveTaskToBack(true)
    }

    // MARK: Theme

    private fun applyTheme(dark: Boolean, color: Int) {
        this.dark = dark
        root.setBackgroundColor(color)
        window.decorView.setBackgroundColor(color)
        webView?.setBackgroundColor(color)
        enableEdgeToEdge(barStyle(), barStyle())
        prefs.edit {
            putBoolean(KEY_DARK, dark)
            putInt(KEY_COLOR, color)
        }
    }

    /** Transparent bars over the page color; dark icons on the light theme, light on the dark. */
    private fun barStyle(): SystemBarStyle =
        if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)

    private fun defaultColor(dark: Boolean): Int =
        if (dark) DARK_SURFACE_SHEET else ContextCompat.getColor(this, R.color.surface_sheet)

    private fun dialogTheme(): Int =
        if (dark) android.R.style.Theme_DeviceDefault_Dialog_Alert else android.R.style.Theme_DeviceDefault_Light_Dialog_Alert

    // MARK: Screen

    private var lastAwake = 0L
    private val releaseAwake = Runnable { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }

    /** Playing the piano never touches the screen: keep it on until 10 minutes after the last note. */
    private fun keepAwake() {
        val now = SystemClock.uptimeMillis()
        if (now - lastAwake < 5_000) return
        lastAwake = now
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        root.removeCallbacks(releaseAwake)
        root.postDelayed(releaseAwake, AWAKE_MS)
    }

    companion object {
        private const val TAG = "practice-piano"
        private const val HOST = WebViewAssetLoader.DEFAULT_DOMAIN
        private const val ORIGIN = "https://$HOST"
        private const val START_URL = "$ORIGIN/index.html"
        private const val JS_OBJECT = "practicePianoAndroid"
        private const val KEY_DARK = "dark"
        private const val KEY_COLOR = "color"
        private const val AWAKE_MS = 10 * 60 * 1000L

        /** surface-sheet (dark) in design/system/tokens.json: sepia-925. */
        private const val DARK_SURFACE_SHEET = 0xFF221E1A.toInt()

        /** CSS colors as the page reports them (#rrggbb, from the design tokens). */
        fun parseColor(value: String): Int? = runCatching { value.trim().toColorInt() }.getOrNull()
    }
}
