package com.practicepiano.studio

import org.junit.Assert.assertEquals
import org.junit.Test

class FileTypesTest {
    @Test
    fun `the backup import takes JSON however the file manager labels it`() {
        // ProgressPanel: <input type="file" accept="application/json,.json">
        assertEquals(
            setOf("application/json", "text/plain", "application/octet-stream"),
            FileTypes.forAccept(arrayOf("application/json,.json")).toSet(),
        )
    }

    @Test
    fun `no accept attribute takes any file`() {
        assertEquals(listOf("*/*"), FileTypes.forAccept(null).toList())
        assertEquals(listOf("*/*"), FileTypes.forAccept(arrayOf("")).toList())
    }
}
