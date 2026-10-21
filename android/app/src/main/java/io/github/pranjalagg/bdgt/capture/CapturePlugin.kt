package io.github.pranjalagg.bdgt.capture

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

// What the web app can ask of payment capture (src/lib/capture/native.ts).
@CapacitorPlugin(name = "Capture")
class CapturePlugin : Plugin() {
    private val onKept: (KeptItem) -> Unit = { item -> notifyListeners("itemKept", toJs(item)) }

    override fun load() {
        CaptureEvents.add(onKept)
    }

    override fun handleOnDestroy() {
        CaptureEvents.remove(onKept)
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val settings = CaptureSettings(context)
        val version = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""
        call.resolve(
            JSObject().apply {
                put("available", true)
                put("accessGranted", NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName))
                put("listenerConnected", settings.listenerConnected)
                put("enabled", settings.enabled)
                put("lastKeptAt", settings.lastKeptAt)
                put("count", CaptureStore.get(context).count())
                put("appVersion", version)
            },
        )
    }

    @PluginMethod
    fun setConfig(call: PluginCall) {
        val settings = CaptureSettings(context)
        call.getBoolean("enabled")?.let { settings.enabled = it }
        call.getArray("packages")?.let { settings.packages = it.toList<String>().toSet() }
        call.getBoolean("sms")?.let { settings.sms = it }
        call.resolve()
    }

    // The supported apps that are installed on this phone, with their names.
    @PluginMethod
    fun installedSources(call: PluginCall) {
        val pm = context.packageManager
        val sources = JSArray()
        fun add(packageName: String, kind: String) {
            val label = try {
                pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
            } catch (e: PackageManager.NameNotFoundException) {
                return
            }
            sources.put(
                JSObject().apply {
                    put("packageName", packageName)
                    put("label", label)
                    put("kind", kind)
                },
            )
        }
        KeepRules.APP_SOURCES.forEach { add(it, "app") }
        CaptureSettings.messagingPackages(context).forEach { add(it, "sms") }
        call.resolve(JSObject().apply { put("sources", sources) })
    }

    // Straight to this app's switch where the system allows it (Android 11+).
    @PluginMethod
    fun openAccessSettings(call: PluginCall) {
        val list = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        val target = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
                Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                listenerComponent().flattenToString(),
            )
        } else {
            list
        }
        startActivity(target, list)
        call.resolve()
    }

    // The list where the person can exempt the app from battery optimization;
    // no special permission is needed to open it.
    @PluginMethod
    fun openBatterySettings(call: PluginCall) {
        startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), Intent(Settings.ACTION_SETTINGS))
        call.resolve()
    }

    @PluginMethod
    fun requestRebind(call: PluginCall) {
        NotificationListenerService.requestRebind(listenerComponent())
        call.resolve()
    }

    @PluginMethod
    fun list(call: PluginCall) {
        val items = JSArray()
        CaptureStore.get(context).list(call.getInt("limit") ?: 200).forEach { items.put(toJs(it)) }
        call.resolve(JSObject().apply { put("items", items) })
    }

    @PluginMethod
    fun clear(call: PluginCall) {
        CaptureStore.get(context).clear()
        call.resolve()
    }

    // Hands text to the share sheet as a file: the WebView cannot save files
    // from a link, so backups and the capture log leave the app this way.
    @PluginMethod
    fun share(call: PluginCall) {
        val filename = call.getString("filename") ?: return call.reject("filename is required")
        val text = call.getString("text") ?: return call.reject("text is required")
        val mimeType = call.getString("mimeType") ?: "text/plain"
        val file = File(File(context.cacheDir, "shared").apply { mkdirs() }, File(filename).name)
        file.writeText(text)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND)
            .setType(mimeType)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        send.clipData = ClipData.newRawUri(file.name, uri)
        startActivity(Intent.createChooser(send, file.name), null)
        call.resolve()
    }

    private fun listenerComponent() = ComponentName(context, PaymentListenerService::class.java)

    private fun startActivity(intent: Intent, fallback: Intent?) {
        activity.runOnUiThread {
            try {
                activity.startActivity(intent)
            } catch (e: ActivityNotFoundException) {
                fallback?.let { activity.startActivity(it) }
            }
        }
    }

    private fun toJs(item: KeptItem) = JSObject().apply {
        put("id", item.id)
        put("packageName", item.packageName)
        put("kind", item.kind)
        put("notificationKey", item.notificationKey)
        put("postedAt", item.postedAt)
        put("sender", item.sender)
        put("title", item.title)
        put("text", item.text)
        put("extras", JSObject().apply { item.extras.forEach { (key, value) -> put(key, value) } })
    }
}
