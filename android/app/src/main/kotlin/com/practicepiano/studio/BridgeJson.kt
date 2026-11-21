package com.practicepiano.studio

/**
 * The native → JS messages of the bridge (see src/platform/native.ts), as JSON text. Plain
 * Kotlin, so the JVM unit tests can check them; org.json is only for reading commands.
 */
object BridgeJson {
    data class Input(val id: String, val name: String, val manufacturer: String, val online: Boolean)

    fun inputs(inputs: List<Input>): String = inputs.joinToString(",", """{"type":"inputs","inputs":[""", "]}") {
        """{"id":${string(it.id)},"name":${string(it.name)},"manufacturer":${string(it.manufacturer)},"online":${it.online}}"""
    }

    fun midi(source: String, data: IntArray): String =
        """{"type":"midi","source":${string(source)},"data":[${data.joinToString(",")}]}"""

    fun bluetoothClosed(): String = """{"type":"bluetoothClosed"}"""

    fun fileSaved(id: String, status: String): String = """{"type":"fileSaved","id":${string(id)},"status":${string(status)}}"""

    fun log(message: String): String = """{"type":"log","message":${string(message)}}"""

    /** A JSON string literal. Also safe inside a JavaScript expression (U+2028 and U+2029 escaped). */
    fun string(value: String): String {
        val sb = StringBuilder(value.length + 2).append('"')
        for (c in value) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                '\u2028', '\u2029' -> sb.append(String.format("\\u%04x", c.code))
                else -> if (c < ' ') sb.append(String.format("\\u%04x", c.code)) else sb.append(c)
            }
        }
        return sb.append('"').toString()
    }

    /**
     * The JavaScript that delivers messages to the page in one go: one evaluateJavascript call
     * for a chord's worth of notes instead of one each.
     */
    fun deliver(messages: List<String>): String =
        messages.joinToString("", "(function(n){if(!n)return;", "})(window.__practicePianoNative)") { "n.receive($it);" }
}
