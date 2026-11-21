package com.practicepiano.studio

import org.junit.Assert.assertEquals
import org.junit.Test

class BridgeJsonTest {
    @Test
    fun `encodes the input list the web app expects`() {
        val json = BridgeJson.inputs(listOf(BridgeJson.Input("bt:AA:BB:0", "FP-30X", "Roland", true)))
        assertEquals("""{"type":"inputs","inputs":[{"id":"bt:AA:BB:0","name":"FP-30X","manufacturer":"Roland","online":true}]}""", json)
        assertEquals("""{"type":"inputs","inputs":[]}""", BridgeJson.inputs(emptyList()))
    }

    @Test
    fun `encodes a MIDI message`() {
        assertEquals("""{"type":"midi","source":"usb:1","data":[144,60,100]}""", BridgeJson.midi("usb:1", intArrayOf(144, 60, 100)))
    }

    @Test
    fun `escapes names so a device cannot break out of the string`() {
        // Input: a quote, a backslash, a newline, U+2028 (ends a line in older JavaScript) and U+0001.
        val input = "a\"b\\c\nd\u2028e\u0001"
        val expected = "\"a\\\"b\\\\c\\nd\\u2028e\\u0001\""
        assertEquals(expected, BridgeJson.string(input))
    }

    @Test
    fun `delivers a batch in one script`() {
        assertEquals(
            "(function(n){if(!n)return;n.receive(1);n.receive(2);})(window.__practicePianoNative)",
            BridgeJson.deliver(listOf("1", "2")),
        )
    }
}
