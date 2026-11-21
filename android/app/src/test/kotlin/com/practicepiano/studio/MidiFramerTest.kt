package com.practicepiano.studio

import org.junit.Assert.assertEquals
import org.junit.Test

class MidiFramerTest {
    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    private fun List<IntArray>.plain() = map { it.toList() }

    @Test
    fun `splits complete messages`() {
        val out = MidiFramer().feed(bytes(0x90, 60, 100, 0x80, 60, 64, 0xB0, 64, 127))
        assertEquals(listOf(listOf(0x90, 60, 100), listOf(0x80, 60, 64), listOf(0xB0, 64, 127)), out.plain())
    }

    @Test
    fun `keeps running status`() {
        val out = MidiFramer().feed(bytes(0x90, 60, 100, 64, 90, 60, 0))
        assertEquals(listOf(listOf(0x90, 60, 100), listOf(0x90, 64, 90), listOf(0x90, 60, 0)), out.plain())
    }

    @Test
    fun `joins a message that arrives in two parts`() {
        val framer = MidiFramer()
        assertEquals(emptyList<List<Int>>(), framer.feed(bytes(0x90, 60)).plain())
        assertEquals(listOf(listOf(0x90, 60, 100)), framer.feed(bytes(100)).plain())
    }

    @Test
    fun `lets real-time bytes through the middle of a message`() {
        // Active sensing (0xFE) and clock (0xF8) are what pianos send most.
        val out = MidiFramer().feed(bytes(0xFE, 0x90, 0xF8, 60, 0xFE, 100, 0xFE))
        assertEquals(listOf(listOf(0x90, 60, 100)), out.plain())
    }

    @Test
    fun `skips system exclusive and does not take its bytes for notes`() {
        val out = MidiFramer().feed(bytes(0x90, 0xF0, 0x41, 0x10, 0x42, 0xF7, 60, 100, 0xB0, 64, 0))
        assertEquals(listOf(listOf(0xB0, 64, 0)), out.plain())
    }

    @Test
    fun `pads one-byte messages to three bytes`() {
        val out = MidiFramer().feed(bytes(0xC0, 5, 0xD0, 40))
        assertEquals(listOf(listOf(0xC0, 5, 0), listOf(0xD0, 40, 0)), out.plain())
    }

    @Test
    fun `reads only the given slice`() {
        val out = MidiFramer().feed(bytes(0xFF, 0x90, 60, 100, 0x90), offset = 1, length = 3)
        assertEquals(listOf(listOf(0x90, 60, 100)), out.plain())
    }

    @Test
    fun `drops stray data bytes before the first status`() {
        val out = MidiFramer().feed(bytes(60, 100, 0x80, 60, 0))
        assertEquals(listOf(listOf(0x80, 60, 0)), out.plain())
    }
}
