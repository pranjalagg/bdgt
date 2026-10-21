package io.github.pranjalagg.bdgt.capture

import android.app.Notification
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors

// The system shows this service every notification on the phone once the
// person grants notification access. It returns at once for anything that
// is not from a chosen app, and keeps only payment notifications (see
// KeepRules). Nothing else is stored or logged.
class PaymentListenerService : NotificationListenerService() {
    private val worker = Executors.newSingleThreadExecutor()

    override fun onListenerConnected() {
        CaptureSettings(this).listenerConnected = true
        // Catch up on anything posted while the listener was not running.
        val active = try {
            activeNotifications?.toList().orEmpty()
        } catch (e: SecurityException) {
            emptyList()
        }
        worker.execute { active.forEach { handle(it) } }
    }

    override fun onListenerDisconnected() {
        CaptureSettings(this).listenerConnected = false
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        worker.execute { handle(sbn) }
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }

    private fun handle(sbn: StatusBarNotification) {
        val settings = CaptureSettings(this)
        if (!settings.enabled) return
        val config = settings.sourceConfig()
        if (sbn.packageName !in config.packages && sbn.packageName !in config.messagingPackages) return
        val store = CaptureStore.get(this)
        for (item in KeepRules.keep(toCandidate(sbn), config)) {
            if (item.kind == "app" && KeepRules.isRepost(store.lastForKey(item.packageName, item.notificationKey), item)) continue
            if (store.insertIfAbsent(item)) {
                settings.lastKeptAt = System.currentTimeMillis()
                CaptureEvents.emit(item)
            }
        }
    }

    private fun toCandidate(sbn: StatusBarNotification): Candidate {
        val notification = sbn.notification
        val extras = notification.extras
        fun text(key: String): String? = extras.getCharSequence(key)?.toString()

        val messages = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification)
            ?.messages
            .orEmpty()
            .mapNotNull { m ->
                val body = m.text?.toString() ?: return@mapNotNull null
                val person = m.person
                Message(
                    sender = person?.name?.toString(),
                    time = m.timestamp,
                    text = body,
                    extras = buildMap {
                        person?.key?.let { put("personKey", it) }
                        person?.uri?.let { put("personUri", it) }
                    },
                )
            }

        return Candidate(
            packageName = sbn.packageName,
            key = sbn.key,
            postTime = sbn.postTime,
            title = text(Notification.EXTRA_TITLE),
            text = text(Notification.EXTRA_TEXT),
            bigText = text(Notification.EXTRA_BIG_TEXT),
            subText = text(Notification.EXTRA_SUB_TEXT),
            lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.map { it.toString() }.orEmpty(),
            messages = messages,
            isGroupSummary = (notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0,
            isOngoing = sbn.isOngoing,
            // Recorded so the parsers can be designed from what each app sends.
            extras = buildMap {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) notification.channelId?.let { put("channel", it) }
                notification.category?.let { put("category", it) }
                put("when", notification.`when`.toString())
                sbn.tag?.let { put("tag", it) }
                text(Notification.EXTRA_CONVERSATION_TITLE)?.let { put("conversationTitle", it) }
            },
        )
    }
}
