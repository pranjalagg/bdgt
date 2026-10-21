package io.github.pranjalagg.bdgt.capture

import java.security.MessageDigest

// What decides whether a notification is kept. Plain Kotlin with no Android
// types, so every rule is unit-tested on the JVM.

// A notification as it arrived, reduced to plain values.
data class Candidate(
    val packageName: String,
    val key: String,
    val postTime: Long,
    val title: String?,
    val text: String?,
    val bigText: String?,
    val subText: String?,
    val lines: List<String>,
    val messages: List<Message>,
    val isGroupSummary: Boolean,
    val isOngoing: Boolean,
    val extras: Map<String, String> = emptyMap(),
)

// One message inside a messaging app's conversation notification.
data class Message(
    val sender: String?,
    val time: Long,
    val text: String,
    val extras: Map<String, String> = emptyMap(),
)

data class KeptItem(
    val id: String,
    val packageName: String,
    val kind: String, // "app" or "sms"
    val notificationKey: String,
    val postedAt: Long,
    val sender: String?,
    val title: String?,
    val text: String,
    val extras: Map<String, String>,
)

// Which apps are read: payment apps by package, and messaging apps (empty
// when SMS capture is off).
data class SourceConfig(
    val packages: Set<String>,
    val messagingPackages: Set<String>,
)

object KeepRules {
    const val WALLET = "com.google.android.apps.walletnfcrel"
    const val GPAY_INDIA = "com.google.android.apps.nbu.paisa.user"
    const val PHONEPE = "com.phonepe.app"
    const val PAYTM = "net.one97.paytm"
    const val GOOGLE_MESSAGES = "com.google.android.apps.messaging"
    const val SAMSUNG_MESSAGES = "com.samsung.android.messaging"

    val APP_SOURCES = listOf(WALLET, GPAY_INDIA, PHONEPE, PAYTM)
    val MESSAGING_APPS = listOf(GOOGLE_MESSAGES, SAMSUNG_MESSAGES)

    // An app re-posting the same notification with the same text this soon
    // is not a new payment.
    const val REPOST_WINDOW_MS = 120_000L

    // A currency marker next to a number (Rs.250, INR 1,234.50, ₹99, $4.50,
    // €4), a number followed by a currency word (250 INR), or SBI's
    // unmarked "debited by 250.0". The word boundary keeps "hours 2" from
    // reading as "rs 2".
    private val AMOUNT = Regex(
        "(?:₹|[$]|€|£|\\b(?:rs\\.?|inr|usd|eur|gbp|aed))\\s*\\d" +
            "|\\d(?:[\\d,]*\\d)?(?:\\.\\d{1,2})?\\s*(?:inr|usd|eur|gbp|aed|rupees)\\b" +
            "|\\b(?:debited|credited)\\s+(?:by|for|with)\\s+\\d",
        RegexOption.IGNORE_CASE,
    )

    private val BANK_WORDS = Regex(
        "\\b(?:debited|credited|debit|credit|spent|paid|sent|received|withdrawn|withdrawal|txn|transaction|purchase|a/c|acct|account|card|upi|neft|imps|rtgs|ref|balance|bal)\\b",
        RegexOption.IGNORE_CASE,
    )

    private val PHONE_NUMBER = Regex("^\\+?[\\d\\s()-]{7,}$")
    private val BANK_NAME = Regex(
        "\\b(?:bank|card|cards|credit|upi|sbi|hdfc|icici|axis|kotak|amex|chase|citi|discover|capital one|wells fargo)\\b",
        RegexOption.IGNORE_CASE,
    )

    private val OTP = Regex("\\b(?:otp|one[- ]time password|verification code)\\b", RegexOption.IGNORE_CASE)

    fun hasAmount(text: String): Boolean = AMOUNT.containsMatchIn(text)

    fun isOtp(text: String): Boolean = OTP.containsMatchIn(text)

    // Banks write from sender IDs (VM-HDFCBK), short codes (24273) or verified
    // business names (HDFC Bank). Contacts and phone numbers are people: their
    // messages are never kept, whatever they say about money.
    fun isBusinessSender(sender: String?): Boolean {
        val s = sender?.trim().orEmpty()
        if (s.isEmpty() || PHONE_NUMBER.matches(s)) return false
        if (BANK_NAME.containsMatchIn(s)) return true
        return s.none { it.isLowerCase() } && s.any { it.isLetterOrDigit() }
    }

    // A bank SMS states an amount and what happened to it; promotions and
    // personal messages rarely use banking words next to an amount.
    fun looksLikeBankMessage(text: String): Boolean =
        hasAmount(text) && BANK_WORDS.containsMatchIn(text) && !isOtp(text)

    fun keep(candidate: Candidate, config: SourceConfig): List<KeptItem> {
        if (candidate.isGroupSummary || candidate.isOngoing) return emptyList()
        return when (candidate.packageName) {
            in config.messagingPackages -> keepMessages(candidate)
            in config.packages -> keepAppNotification(candidate)
            else -> emptyList()
        }
    }

    // The fullest text an app notification carries: the expanded text (or
    // the short one), then any inbox lines and the sub text.
    fun appText(c: Candidate): String {
        val main = c.bigText?.takeIf { it.isNotBlank() } ?: c.text.orEmpty()
        val parts = mutableListOf(main)
        parts += c.lines.filter { it.isNotBlank() && it != main }
        c.subText?.takeIf { it.isNotBlank() }?.let { parts += it }
        return parts.filter { it.isNotBlank() }.joinToString("\n")
    }

    // Messages keep their own time and id, so a conversation notification
    // that is re-posted as new messages arrive yields the same items again.
    // A message without a sender is the phone owner's own.
    private fun keepMessages(c: Candidate): List<KeptItem> {
        val messages = c.messages.ifEmpty {
            // Not a messaging-style notification: it is one message itself.
            val body = c.bigText?.takeIf { it.isNotBlank() } ?: c.text
            if (body.isNullOrBlank()) emptyList() else listOf(Message(c.title, c.postTime, body))
        }
        return messages
            .filter { isBusinessSender(it.sender) && looksLikeBankMessage(it.text) }
            .map { m ->
                KeptItem(
                    id = itemId("sms", c.packageName, m.sender.orEmpty(), m.time.toString(), m.text),
                    packageName = c.packageName,
                    kind = "sms",
                    notificationKey = c.key,
                    postedAt = m.time,
                    sender = m.sender,
                    title = c.title,
                    text = m.text,
                    extras = c.extras + m.extras,
                )
            }
            .distinctBy { it.id }
    }

    private fun keepAppNotification(c: Candidate): List<KeptItem> {
        val text = appText(c)
        val all = listOfNotNull(c.title, text).joinToString("\n")
        if (!hasAmount(all) || isOtp(all)) return emptyList()
        return listOf(
            KeptItem(
                id = itemId("app", c.packageName, c.key, c.postTime.toString()),
                packageName = c.packageName,
                kind = "app",
                notificationKey = c.key,
                postedAt = c.postTime,
                sender = null,
                title = c.title,
                text = text,
                extras = c.extras,
            ),
        )
    }

    fun itemId(vararg parts: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(parts.joinToString("\u0000").toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }.take(32)
    }

    fun isRepost(previous: KeptItem?, item: KeptItem): Boolean =
        previous != null && previous.text == item.text && item.postedAt - previous.postedAt in 0..REPOST_WINDOW_MS
}
