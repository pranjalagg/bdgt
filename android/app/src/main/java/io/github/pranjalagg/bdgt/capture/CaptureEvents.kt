package io.github.pranjalagg.bdgt.capture

import java.util.concurrent.CopyOnWriteArraySet

// Lets the open app hear about items the listener has just kept.
object CaptureEvents {
    private val listeners = CopyOnWriteArraySet<(KeptItem) -> Unit>()

    fun add(listener: (KeptItem) -> Unit) {
        listeners += listener
    }

    fun remove(listener: (KeptItem) -> Unit) {
        listeners -= listener
    }

    fun emit(item: KeptItem) {
        listeners.forEach { it(item) }
    }
}
