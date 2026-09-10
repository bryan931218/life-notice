package expo.modules.noticelistener

import android.Manifest
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.CalendarContract
import android.widget.Toast
import java.util.Calendar
import java.util.TimeZone

internal data class QuickCaptureResult(val ok: Boolean, val message: String)

internal object QuickCapture {
  private val numericDate = Regex("""(?:(20\d{2})[年./-]\s*)?([01]?\d)[月./-]([0-3]?\d)(?:日|號)?""")
  private val weekday = Regex("""(下週|下星期)?(?:週|星期)([一二三四五六日天])""")
  private val relative = Regex("今天|今晚|明天|明晚|後天|大後天")
  private val time = Regex("""(上午|早上|中午|下午|晚上|晚間|凌晨)?\s*([01]?\d|2[0-3])(?:[:：點時]\s*([0-5]?\d)?)""")
  private val leading = Regex("^(?:請|記得|務必|別忘了?|麻煩|提醒(?:一下)?)[：:，,\s]*")

  fun capture(context: Context, item: DetectedNotice): QuickCaptureResult {
    val text = listOf(item.title, item.text).filter { it.isNotBlank() }.distinct().joinToString("\n")
    val date = parseDate(text, item.receivedAt)
      ?: return QuickCaptureResult(false, "已擷取，但日期不夠明確；之後可在 App 的待確認中補上。")

    if (context.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) != PackageManager.PERMISSION_GRANTED ||
      context.checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
      return QuickCaptureResult(false, "請先在 App 開啟一次「同步手機行事曆」。")
    }

    val clock = parseTime(text)
    val allDay = clock == null
    val startAt = if (allDay) {
      Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
        clear(); set(date.get(Calendar.YEAR), date.get(Calendar.MONTH), date.get(Calendar.DAY_OF_MONTH), 0, 0, 0)
      }.timeInMillis
    } else {
      date.apply { set(Calendar.HOUR_OF_DAY, clock.first); set(Calendar.MINUTE, clock.second); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis
    }
    val endAt = startAt + if (allDay) 86_400_000L else 30L * 60L * 1000L
    val syncKey = "detected-${item.id}"
    val prefs = context.getSharedPreferences("life_notice_listener_v1", Context.MODE_PRIVATE)
    val synced = prefs.getStringSet("calendar_synced", emptySet())?.toMutableSet() ?: mutableSetOf()
    if (syncKey in synced) return QuickCaptureResult(true, "這則行程已經加入過。")

    val projection = arrayOf(CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.IS_PRIMARY)
    val selection = "${CalendarContract.Calendars.VISIBLE}=1 AND ${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL}>=?"
    val args = arrayOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR.toString())
    val calendarId = context.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, selection, args, "${CalendarContract.Calendars.IS_PRIMARY} DESC")?.use { cursor ->
      if (cursor.moveToFirst()) cursor.getLong(0) else null
    } ?: return QuickCaptureResult(false, "找不到可寫入的手機行事曆。")

    val title = eventTitle(item, text)
    val values = ContentValues().apply {
      put(CalendarContract.Events.CALENDAR_ID, calendarId)
      put(CalendarContract.Events.TITLE, title)
      put(CalendarContract.Events.DESCRIPTION, "來源：${item.appName}\n${item.text}".take(4000))
      put(CalendarContract.Events.DTSTART, startAt)
      put(CalendarContract.Events.DTEND, endAt)
      put(CalendarContract.Events.ALL_DAY, if (allDay) 1 else 0)
      put(CalendarContract.Events.EVENT_TIMEZONE, if (allDay) "UTC" else TimeZone.getDefault().id)
    }
    val uri = context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
      ?: return QuickCaptureResult(false, "行事曆寫入失敗。")
    if (uri.lastPathSegment != null) {
      synced.add(syncKey)
      prefs.edit().putStringSet("calendar_synced", synced).apply()
    }
    return QuickCaptureResult(true, if (allDay) "已加入全天行程：$title" else "已加入行事曆：$title")
  }

  private fun eventTitle(item: DetectedNotice, text: String): String {
    val body = item.text.lineSequence().map { it.trim() }.firstOrNull { it.length >= 2 }.orEmpty()
    val cleaned = (body.ifBlank { item.title })
      .replace(numericDate, " ")
      .replace(relative, " ")
      .replace(weekday, " ")
      .replace(time, " ")
      .replace(leading, "")
      .replace(Regex("[，,。.!！?？\s]{2,}"), " ")
      .trim(' ', '，', ',', '。', '.', '：', ':')
    return (cleaned.takeIf { it.length >= 2 } ?: "${item.appName} 行程").take(80)
  }

  private fun parseDate(text: String, receivedAt: Long): Calendar? {
    val base = Calendar.getInstance().apply { timeInMillis = receivedAt }
    numericDate.find(text)?.let { m ->
      var year = m.groupValues[1].toIntOrNull() ?: base.get(Calendar.YEAR)
      val month = m.groupValues[2].toIntOrNull() ?: return@let
      val day = m.groupValues[3].toIntOrNull() ?: return@let
      val candidate = Calendar.getInstance().apply { clear(); set(year, month - 1, day, 0, 0, 0) }
      if (candidate.get(Calendar.MONTH) != month - 1 || candidate.get(Calendar.DAY_OF_MONTH) != day) return@let
      if (m.groupValues[1].isBlank() && candidate.timeInMillis < receivedAt - 180L * 86_400_000L) {
        year += 1; candidate.set(Calendar.YEAR, year)
      }
      return candidate
    }
    relative.find(text)?.value?.let { word ->
      val plus = when (word) { "明天", "明晚" -> 1; "後天" -> 2; "大後天" -> 3; else -> 0 }
      return base.apply { add(Calendar.DAY_OF_MONTH, plus); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
    }
    weekday.find(text)?.let { m ->
      val target = when (m.groupValues[2]) { "一" -> Calendar.MONDAY; "二" -> Calendar.TUESDAY; "三" -> Calendar.WEDNESDAY; "四" -> Calendar.THURSDAY; "五" -> Calendar.FRIDAY; "六" -> Calendar.SATURDAY; else -> Calendar.SUNDAY }
      var delta = (target - base.get(Calendar.DAY_OF_WEEK) + 7) % 7
      if (delta == 0) delta = 7
      if (m.groupValues[1].isNotBlank()) delta += 7
      return base.apply { add(Calendar.DAY_OF_MONTH, delta); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
    }
    return null
  }

  private fun parseTime(text: String): Pair<Int, Int>? {
    val m = time.find(text) ?: return null
    val period = m.groupValues[1]
    var hour = m.groupValues[2].toIntOrNull() ?: return null
    val minute = m.groupValues[3].toIntOrNull() ?: 0
    when (period) {
      "下午", "晚上", "晚間" -> if (hour < 12) hour += 12
      "中午" -> if (hour < 11) hour += 12
      "凌晨" -> if (hour == 12) hour = 0
    }
    return hour to minute
  }
}

class QuickCaptureReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val id = intent?.getStringExtra("noticeId")
    val item = DetectedStore.get(context).firstOrNull { it.id == id } ?: DetectedStore.get(context).firstOrNull()
    val result = item?.let { QuickCapture.capture(context, it) } ?: QuickCaptureResult(false, "沒有可擷取的新通知。")
    Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
  }
}
