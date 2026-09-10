package expo.modules.noticelistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

internal data class ReplyTarget(
  val id: String,
  val packageName: String,
  val title: String,
  val text: String,
  val receivedAt: Long
)

internal object ReplyTargetStore {
  private const val PREF = "life_notice_listener_v1"
  private const val KEY = "reply_targets_v1"
  private const val MAX = 40
  private const val TTL = 2L * 24L * 60L * 60L * 1000L

  private fun prefs(context: Context) = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

  @Synchronized
  fun save(context: Context, item: DetectedNotice) {
    val now = System.currentTimeMillis()
    val current = all(context)
      .filter { it.id != item.id && now - it.receivedAt <= TTL }
      .toMutableList()
    current.add(0, ReplyTarget(item.id, item.packageName, item.title, item.text, item.receivedAt))
    write(context, current.take(MAX))
  }

  @Synchronized
  fun get(context: Context, id: String): ReplyTarget? {
    val now = System.currentTimeMillis()
    val current = all(context).filter { now - it.receivedAt <= TTL }
    if (current.size != all(context).size) write(context, current)
    return current.firstOrNull { it.id == id }
  }

  private fun all(context: Context): List<ReplyTarget> {
    val raw = prefs(context).getString(KEY, "[]") ?: "[]"
    return runCatching {
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { index ->
        val o = array.optJSONObject(index) ?: return@mapNotNull null
        ReplyTarget(
          id = o.optString("id"),
          packageName = o.optString("packageName"),
          title = o.optString("title"),
          text = o.optString("text"),
          receivedAt = o.optLong("receivedAt")
        ).takeIf { it.id.isNotBlank() && it.packageName.isNotBlank() }
      }
    }.getOrDefault(emptyList())
  }

  private fun write(context: Context, values: List<ReplyTarget>) {
    val array = JSONArray()
    values.forEach { item ->
      array.put(JSONObject().apply {
        put("id", item.id)
        put("packageName", item.packageName)
        put("title", item.title)
        put("text", item.text)
        put("receivedAt", item.receivedAt)
      })
    }
    prefs(context).edit().putString(KEY, array.toString()).apply()
  }
}