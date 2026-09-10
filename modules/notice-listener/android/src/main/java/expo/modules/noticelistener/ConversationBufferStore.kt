package expo.modules.noticelistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

internal data class BufferedLine(val text: String, val at: Long)

internal object ConversationBufferStore {
  private const val PREF = "life_notice_listener_v1"
  private const val KEY = "conversation_buffers_v1"
  private const val TTL = 15L * 60L * 1000L
  private const val MAX_THREADS = 30
  private const val MAX_LINES = 8

  private fun prefs(context: Context) = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

  private fun threadId(packageName: String, title: String): String {
    val normalized = title.trim().lowercase().replace(Regex("\\s+"), " ").take(120)
    val bytes = MessageDigest.getInstance("SHA-256").digest("$packageName|$normalized".toByteArray())
    return bytes.take(10).joinToString("") { "%02x".format(it) }
  }

  @Synchronized
  fun append(context: Context, packageName: String, title: String, body: String, at: Long): List<BufferedLine> {
    val now = at.takeIf { it > 0 } ?: System.currentTimeMillis()
    val id = threadId(packageName, title)
    val root = readRoot(context)
    prune(root, now)

    val previous = root.optJSONArray(id) ?: JSONArray()
    val lines = mutableListOf<BufferedLine>()
    for (i in 0 until previous.length()) {
      val o = previous.optJSONObject(i) ?: continue
      val text = o.optString("text").trim()
      val time = o.optLong("at")
      if (text.isNotBlank() && now - time <= TTL) lines += BufferedLine(text, time)
    }

    val incoming = body
      .split('\n')
      .map { it.trim().replace(Regex("\\s+"), " ") }
      .filter { it.length >= 2 }
      .filterNot { it == title.trim() }

    for (line in incoming) {
      val duplicate = lines.indexOfLast { it.text == line }
      if (duplicate >= 0) lines.removeAt(duplicate)
      lines += BufferedLine(line.take(1000), now)
    }

    val compact = lines.takeLast(MAX_LINES)
    val arr = JSONArray()
    compact.forEach { line -> arr.put(JSONObject().apply { put("text", line.text); put("at", line.at) }) }
    root.put(id, arr)
    writeRoot(context, root)
    return compact
  }

  fun format(lines: List<BufferedLine>): String = lines.joinToString("\n") { line ->
    val age = ((System.currentTimeMillis() - line.at).coerceAtLeast(0L) / 1000L).coerceAtMost(999)
    "[$age 秒前] ${line.text}"
  }

  private fun prune(root: JSONObject, now: Long) {
    val keys = root.keys().asSequence().toList()
    val keep = keys.mapNotNull { key ->
      val arr = root.optJSONArray(key) ?: return@mapNotNull null
      val fresh = JSONArray()
      var newest = 0L
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val at = o.optLong("at")
        if (now - at <= TTL) { fresh.put(o); newest = maxOf(newest, at) }
      }
      if (fresh.length() > 0) Triple(key, fresh, newest) else null
    }.sortedByDescending { it.third }.take(MAX_THREADS)
    keys.forEach(root::remove)
    keep.forEach { root.put(it.first, it.second) }
  }

  private fun readRoot(context: Context): JSONObject = runCatching {
    JSONObject(prefs(context).getString(KEY, "{}") ?: "{}")
  }.getOrDefault(JSONObject())

  private fun writeRoot(context: Context, root: JSONObject) {
    prefs(context).edit().putString(KEY, root.toString()).apply()
  }
}