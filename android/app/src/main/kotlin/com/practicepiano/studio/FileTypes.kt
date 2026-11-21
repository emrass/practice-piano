package com.practicepiano.studio

object FileTypes {
    /**
     * MIME types for the system file picker from an `<input accept>`: extensions become types,
     * and JSON also takes what file managers often call a .json file (plain text, or no type).
     */
    fun forAccept(accept: Array<String>?): Array<String> {
        val types = accept.orEmpty()
            .flatMap { it.split(',') }
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .map { if (it == ".json") "application/json" else it }
            .filter { '/' in it }
            .toMutableSet()
        if ("application/json" in types) types += listOf("text/plain", "application/octet-stream")
        return if (types.isEmpty()) arrayOf("*/*") else types.toTypedArray()
    }
}
