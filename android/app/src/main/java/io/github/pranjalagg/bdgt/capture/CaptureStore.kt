package io.github.pranjalagg.bdgt.capture

import android.content.ContentValues
import android.content.Context
import android.database.DatabaseUtils
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

// Kept notifications, held on the phone until the app reads them. The
// listener writes and the plugin reads, in the same process.
class CaptureStore private constructor(context: Context) :
    SQLiteOpenHelper(context, "capture.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE items (
              id TEXT PRIMARY KEY,
              package TEXT NOT NULL,
              kind TEXT NOT NULL,
              notification_key TEXT NOT NULL,
              posted_at INTEGER NOT NULL,
              sender TEXT,
              title TEXT,
              text TEXT NOT NULL,
              extras TEXT NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX items_by_key ON items (package, notification_key, posted_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    // False when an item with this id is already stored.
    fun insertIfAbsent(item: KeptItem): Boolean {
        val values = ContentValues().apply {
            put("id", item.id)
            put("package", item.packageName)
            put("kind", item.kind)
            put("notification_key", item.notificationKey)
            put("posted_at", item.postedAt)
            put("sender", item.sender)
            put("title", item.title)
            put("text", item.text)
            put("extras", JSONObject(item.extras).toString())
        }
        return writableDatabase.insertWithOnConflict("items", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1L
    }

    fun lastForKey(packageName: String, key: String): KeptItem? =
        query("package = ? AND notification_key = ?", arrayOf(packageName, key), 1).firstOrNull()

    // Newest first.
    fun list(limit: Int): List<KeptItem> = query(null, null, limit)

    fun count(): Long = DatabaseUtils.queryNumEntries(readableDatabase, "items")

    fun clear() {
        writableDatabase.delete("items", null, null)
    }

    private fun query(where: String?, args: Array<String>?, limit: Int): List<KeptItem> {
        val out = mutableListOf<KeptItem>()
        readableDatabase.query("items", null, where, args, null, null, "posted_at DESC", limit.toString()).use { c ->
            val id = c.getColumnIndexOrThrow("id")
            val pkg = c.getColumnIndexOrThrow("package")
            val kind = c.getColumnIndexOrThrow("kind")
            val key = c.getColumnIndexOrThrow("notification_key")
            val postedAt = c.getColumnIndexOrThrow("posted_at")
            val sender = c.getColumnIndexOrThrow("sender")
            val title = c.getColumnIndexOrThrow("title")
            val text = c.getColumnIndexOrThrow("text")
            val extras = c.getColumnIndexOrThrow("extras")
            while (c.moveToNext()) {
                out += KeptItem(
                    id = c.getString(id),
                    packageName = c.getString(pkg),
                    kind = c.getString(kind),
                    notificationKey = c.getString(key),
                    postedAt = c.getLong(postedAt),
                    sender = if (c.isNull(sender)) null else c.getString(sender),
                    title = if (c.isNull(title)) null else c.getString(title),
                    text = c.getString(text),
                    extras = parseExtras(c.getString(extras)),
                )
            }
        }
        return out
    }

    private fun parseExtras(json: String?): Map<String, String> {
        if (json.isNullOrEmpty()) return emptyMap()
        val obj = JSONObject(json)
        return obj.keys().asSequence().associateWith { obj.optString(it) }
    }

    companion object {
        @Volatile
        private var instance: CaptureStore? = null

        fun get(context: Context): CaptureStore =
            instance ?: synchronized(this) {
                instance ?: CaptureStore(context.applicationContext).also { instance = it }
            }
    }
}
