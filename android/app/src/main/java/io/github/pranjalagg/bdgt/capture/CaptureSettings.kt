package io.github.pranjalagg.bdgt.capture

import android.content.Context
import android.provider.Telephony

// The switches the listener reads, kept on the phone so capture works while
// the app is closed.
class CaptureSettings(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("capture", Context.MODE_PRIVATE)

    var enabled: Boolean
        get() = prefs.getBoolean("enabled", false)
        set(value) = prefs.edit().putBoolean("enabled", value).apply()

    // Payment apps to read; empty means every known one.
    var packages: Set<String>
        get() = prefs.getStringSet("packages", null)?.toSet() ?: emptySet()
        set(value) = prefs.edit().putStringSet("packages", value).apply()

    var sms: Boolean
        get() = prefs.getBoolean("sms", true)
        set(value) = prefs.edit().putBoolean("sms", value).apply()

    var lastKeptAt: Long
        get() = prefs.getLong("lastKeptAt", 0L)
        set(value) = prefs.edit().putLong("lastKeptAt", value).apply()

    var listenerConnected: Boolean
        get() = prefs.getBoolean("listenerConnected", false)
        set(value) = prefs.edit().putBoolean("listenerConnected", value).apply()

    fun sourceConfig(): SourceConfig = SourceConfig(
        packages = packages.ifEmpty { KeepRules.APP_SOURCES.toSet() },
        messagingPackages = if (sms) messagingPackages(appContext) else emptySet(),
    )

    companion object {
        // The known messaging apps plus whichever app handles SMS here.
        fun messagingPackages(context: Context): Set<String> =
            (KeepRules.MESSAGING_APPS + listOfNotNull(Telephony.Sms.getDefaultSmsPackage(context))).toSet()
    }
}
