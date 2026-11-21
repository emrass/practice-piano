package com.practicepiano.studio

import android.webkit.WebView

/**
 * native → JS: delivers bridge messages to `window.__practicePianoNative.receive` (see
 * src/platform/native.ts). Until the page says hello, messages wait in a short queue, like
 * the iPad app's. MIDI from the piano doesn't wait: a note from before the page loaded is stale.
 * Main thread only.
 */
class WebBridge(private val webView: WebView) {
    private var ready = false
    private val pending = ArrayDeque<String>()

    /** A new page is loading: hold messages until it says hello. */
    fun pageStarted() {
        ready = false
    }

    /** The page said hello (or rescan): it is listening. */
    fun pageReady() {
        ready = true
        if (pending.isEmpty()) return
        val queued = pending.toList()
        pending.clear()
        deliver(queued)
    }

    fun send(message: String) {
        if (ready) return deliver(listOf(message))
        pending.addLast(message)
        while (pending.size > MAX_PENDING) pending.removeFirst()
    }

    /** Messages that are only worth something now. */
    fun sendLive(messages: List<String>) {
        if (ready) deliver(messages)
    }

    private fun deliver(messages: List<String>) {
        webView.evaluateJavascript(BridgeJson.deliver(messages), null)
    }

    private companion object {
        const val MAX_PENDING = 100
    }
}
