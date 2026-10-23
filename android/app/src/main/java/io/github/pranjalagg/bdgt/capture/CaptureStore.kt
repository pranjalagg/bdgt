package io.github.pranjalagg.bdgt.capture

import android.content.ContentValues
import android.content.Context
import android.database.DatabaseUtils
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

// Kept notifications. The app brings each one into the review queue once
// (acked_at marks it done, owner the account whose queue got it) and they
// stay as the capture log until cleared. The listener writes and the plugin
// reads, in the same process.
class CaptureStore private constructor(context: Context) :
    SQLiteOpenHelper(context, "capture.db", null, 3) {

    // Which items someone sees. `all`: every item (a build without sync).
    // Otherwise items no account has taken yet, plus `owner`'s when signed in.
    data class Scope(val all: Boolean, val owner: String?)

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
              extras TEXT NOT NULL,
              acked_at INTEGER,
              owner TEXT
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX items_by_key ON items (package, notification_key, posted_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            // Items recorded before the review queue existed were samples, not
            // payments to review: they count as already brought in.
            db.execSQL("ALTER TABLE items ADD COLUMN acked_at INTEGER")
            db.execSQL("UPDATE items SET acked_at = posted_at")
        }
        if (oldVersion < 3) {
            // Items brought in before owners existed are claimed by the
            // account that is signed in next (see claim).
            db.execSQL("ALTER TABLE items ADD COLUMN owner TEXT")
        }
    }

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
    fun list(limit: Int, scope: Scope): List<KeptItem> {
        val (where, args) = filter(scope)
        return query(where, args, limit)
    }

    // Not yet brought into the review queue, oldest first.
    fun pending(limit: Int): List<KeptItem> = query("acked_at IS NULL", null, limit, "posted_at ASC")

    fun ack(ids: List<String>, owner: String?) {
        if (ids.isEmpty()) return
        val db = writableDatabase
        val done = ContentValues().apply {
            put("acked_at", System.currentTimeMillis())
            if (owner != null) put("owner", owner)
        }
        db.beginTransaction()
        try {
            ids.forEach { db.update("items", done, "id = ? AND acked_at IS NULL", arrayOf(it)) }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // Items brought in before owners existed belong to the signed-in account.
    fun claim(owner: String) {
        val values = ContentValues().apply { put("owner", owner) }
        writableDatabase.update("items", values, "owner IS NULL AND acked_at IS NOT NULL", null)
    }

    fun count(scope: Scope): Long {
        val (where, args) = filter(scope)
        return DatabaseUtils.queryNumEntries(readableDatabase, "items", where, args)
    }

    fun waiting(): Long = DatabaseUtils.queryNumEntries(readableDatabase, "items", "acked_at IS NULL")

    fun clear(scope: Scope) {
        val (where, args) = filter(scope)
        writableDatabase.delete("items", where, args)
    }

    private fun filter(scope: Scope): Pair<String?, Array<String>?> = when {
        scope.all -> null to null
        scope.owner == null -> "owner IS NULL" to null
        else -> "(owner IS NULL OR owner = ?)" to arrayOf(scope.owner)
    }

    private fun query(where: String?, args: Array<String>?, limit: Int, order: String = "posted_at DESC"): List<KeptItem> {
        val out = mutableListOf<KeptItem>()
        readableDatabase.query("items", null, where, args, null, null, order, limit.toString()).use { c ->
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
