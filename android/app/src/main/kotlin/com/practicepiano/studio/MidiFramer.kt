package com.practicepiano.studio

/**
 * Splits a MIDI 1.0 byte stream, as android.media.midi delivers it, into channel voice messages.
 *
 * Keeps running status, skips system exclusive and system common messages, and lets real-time
 * bytes (clock, active sensing) arrive anywhere, even inside a message, without breaking it.
 * Each message comes out as three bytes, `[status, data1, data2]` (data2 is 0 for program
 * change and channel pressure), the same shape the iPad app sends.
 *
 * One framer per port: it keeps its state between calls, since a message may arrive in parts.
 */
class MidiFramer {
    private var status = 0
    private var needed = 0
    private var count = 0
    private val data = IntArray(2)

    fun feed(bytes: ByteArray, offset: Int = 0, length: Int = bytes.size): List<IntArray> {
        var out: MutableList<IntArray>? = null
        for (i in offset until offset + length) {
            val b = bytes[i].toInt() and 0xFF
            when {
                // Real-time: a single byte that never touches running status.
                b >= 0xF8 -> Unit
                // System exclusive and system common: skipped, and they end running status, so
                // their data bytes are dropped below.
                b >= 0xF0 -> {
                    status = 0
                    count = 0
                }
                b >= 0x80 -> {
                    status = b
                    needed = if (b and 0xE0 == 0xC0) 1 else 2 // 0xC0 program change, 0xD0 pressure
                    count = 0
                }
                status != 0 -> {
                    data[count++] = b
                    if (count == needed) {
                        (out ?: mutableListOf<IntArray>().also { out = it })
                            .add(intArrayOf(status, data[0], if (needed == 2) data[1] else 0))
                        count = 0
                    }
                }
            }
        }
        return out ?: emptyList()
    }

    fun reset() {
        status = 0
        count = 0
    }
}
