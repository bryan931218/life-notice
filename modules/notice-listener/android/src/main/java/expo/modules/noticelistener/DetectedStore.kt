package expo.modules.noticelistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

internal data class DetectedNotice(
  val id: String,
  val packageName: String,
  val appName: String,
  val title: String,
  val text: String,
  val receivedAt: Long,
  val score: Int,
  val reason: String
) {
  fun toJson() = JSONObject().apply {
    put("id", id)
    put("packageName", packageName)
    put("appName", appName)
    put("title", title)
    put("text", text)
    put("receivedAt", receivedAt)
    put("score", score)
    put("reason", reason)
  }

  fun toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "packageName" to packageName,
    "appName" to appName,
    "title" to title,
    "text" to text,
    "receivedAt" to receivedAt.toDouble(),
    "score" to score,
    "reason" to reason
  )
}

internal object DetectedStore {
  private const val PREF = "life_notice_listener_v1"
  private const val KEY = "detected"
  private const val AI_MODE = "ai_enabled"
  private const val ALERT_LEVEL = "alert_level"
  private const val MAX = 120

  private fun prefs(context: Context) = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

  fun idFor(packageName: String, title: String, text: String, receivedAt: Long): String {
    val day = receivedAt / 86_400_000L
    val raw = "$packageName|$title|$text|$day"
    val bytes = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
    return bytes.take(12).joinToString("") { "%02x".format(it) }
  }

  @Synchronized
  fun add(context: Context, item: DetectedNotice): Boolean {
    val current = get(context).toMutableList()
    if (current.any { it.id == item.id }) return false
    current.add(0, item)
    save(context, current.take(MAX))
    return true
  }

  @Synchronized
  fun get(context: Context): List<DetectedNotice> {
    val raw = prefs(context).getString(KEY, "[]") ?: "[]"
    return runCatching {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { index ->
        val o = arr.optJSONObject(index) ?: return@mapNotNull null
        DetectedNotice(
          id = o.optString("id"),
          packageName = o.optString("packageName"),
          appName = o.optString("appName"),
          title = o.optString("title"),
          text = o.optString("text"),
          receivedAt = o.optLong("receivedAt"),
          score = o.optInt("score"),
          reason = o.optString("reason")
        ).takeIf { it.id.isNotBlank() && it.text.isNotBlank() }
      }
    }.getOrDefault(emptyList())
  }

  @Synchronized
  fun remove(context: Context, ids: Set<String>) {
    if (ids.isEmpty()) return
    save(context, get(context).filterNot { it.id in ids })
  }

  fun aiMode(context: Context) = prefs(context).getBoolean(AI_MODE, false)

  fun setAiMode(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(AI_MODE, enabled).apply()

  fun alertLevel(context: Context): String = prefs(context).getString(ALERT_LEVEL, "important") ?: "important"

  fun setAlertLevel(context: Context, level: String) {
    val safe = when (level) { "all", "balanced" -> level; else -> "important" }
    prefs(context).edit().putString(ALERT_LEVEL, safe).apply()
  }

  @Synchronized
  fun clear(context: Context) = prefs(context).edit().remove(KEY).apply()

  private fun save(context: Context, items: List<DetectedNotice>) {
    val arr = JSONArray()
    items.forEach { arr.put(it.toJson()) }
    prefs(context).edit().putString(KEY, arr.toString()).apply()
  }
}
