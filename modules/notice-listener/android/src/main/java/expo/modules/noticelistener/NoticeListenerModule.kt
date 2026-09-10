package expo.modules.noticelistener

import android.content.ComponentName
import android.content.Intent
import android.content.ContentValues
import android.provider.CalendarContract
import android.provider.Settings
import java.util.TimeZone
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoticeListenerModule : Module() {
  private fun enabled(): Boolean {
    val context = appContext.reactContext ?: return false
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    val expected = ComponentName(context, LifeNoticeListenerService::class.java)
    return flat.split(":").mapNotNull(ComponentName::unflattenFromString).any { it == expected }
  }


  private fun addCalendarEvent(title: String, startAt: Long, endAt: Long, allDay: Boolean, description: String, location: String, syncKey: String): String {
    val context = appContext.reactContext ?: throw IllegalStateException("App 尚未準備好")
    val prefs = context.getSharedPreferences("life_notice_listener_v1", android.content.Context.MODE_PRIVATE)
    val synced = prefs.getStringSet("calendar_synced", emptySet())?.toMutableSet() ?: mutableSetOf()
    if (syncKey.isNotBlank() && syncKey in synced) return "already-synced"

    val projection = arrayOf(CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.IS_PRIMARY)
    val selection = "${CalendarContract.Calendars.VISIBLE}=1 AND ${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL}>=?"
    val args = arrayOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR.toString())
    val calendarId = context.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, selection, args, "${CalendarContract.Calendars.IS_PRIMARY} DESC")?.use { cursor ->
      if (cursor.moveToFirst()) cursor.getLong(0) else null
    } ?: throw IllegalStateException("找不到可寫入的手機行事曆")

    val values = ContentValues().apply {
      put(CalendarContract.Events.CALENDAR_ID, calendarId)
      put(CalendarContract.Events.TITLE, title.take(200))
      put(CalendarContract.Events.DESCRIPTION, description.take(4000))
      put(CalendarContract.Events.DTSTART, startAt)
      put(CalendarContract.Events.DTEND, if (endAt > startAt) endAt else startAt + 30L * 60L * 1000L)
      put(CalendarContract.Events.ALL_DAY, if (allDay) 1 else 0)
      if (location.isNotBlank()) put(CalendarContract.Events.EVENT_LOCATION, location.take(200))
      put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
    }
    val uri = context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values) ?: throw IllegalStateException("行事曆寫入失敗")
    if (syncKey.isNotBlank()) { synced.add(syncKey); prefs.edit().putStringSet("calendar_synced", synced).apply() }
    return uri.lastPathSegment ?: "created"
  }

  override fun definition() = ModuleDefinition {
    Name("NoticeListener")

    Function("isEnabled") { enabled() }

    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function null
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      null
    }

    Function("getDetected") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any>>()
      DetectedStore.get(context).map { it.toMap() }
    }

    Function("markProcessed") { ids: List<String> ->
      val context = appContext.reactContext ?: return@Function null
      DetectedStore.remove(context, ids.toSet())
      null
    }

    Function("clearDetected") {
      val context = appContext.reactContext ?: return@Function null
      DetectedStore.clear(context)
      null
    }

    Function("setAiMode") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@Function null
      DetectedStore.setAiMode(context, enabled)
      null
    }

    Function("setAlertLevel") { level: String ->
      val context = appContext.reactContext ?: return@Function null
      DetectedStore.setAlertLevel(context, level)
      null
    }

    Function("addCalendarEvent") { title: String, startAt: Double, endAt: Double, allDay: Boolean, description: String, location: String, syncKey: String ->
      addCalendarEvent(title, startAt.toLong(), endAt.toLong(), allDay, description, location, syncKey)
    }
  }
}
