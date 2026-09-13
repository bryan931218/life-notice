package expo.modules.noticelistener

import android.app.StatusBarManager
import android.content.ComponentName
import android.content.ContentValues
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.provider.CalendarContract
import android.provider.Settings
import java.util.TimeZone
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoticeListenerModule : Module() {
  private fun listenerPermissionEnabled(): Boolean {
    val context = appContext.reactContext ?: return false
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    val expected = ComponentName(context, LifeNoticeListenerService::class.java)
    return flat.split(":").mapNotNull(ComponentName::unflattenFromString).any { it == expected }
  }

  private fun enabled(): Boolean {
    val context = appContext.reactContext ?: return false
    return listenerPermissionEnabled() && AppMonitorStore.selected(context).isNotEmpty()
  }

  private fun addCalendarEvent(title: String, startAt: Long, endAt: Long, allDay: Boolean, description: String, location: String, syncKey: String): String {
    val context = appContext.reactContext ?: throw IllegalStateException("App 尚未準備好")
    return CalendarWriter.write(context,title,startAt,endAt,allDay,description,location,syncKey)
  }

  override fun definition() = ModuleDefinition {
    Name("NoticeListener")

    Function("isEnabled") { enabled() }
    Function("hasListenerPermission") { listenerPermissionEnabled() }
    Function("getMonitoredCount") { appContext.reactContext?.let { AppMonitorStore.selected(it).size } ?: 0 }

    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function null
      val intent = Intent(context, AppFilterActivity::class.java).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      context.startActivity(intent)
      null
    }

    Function("requestQuickTile") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@Function false
      val manager = context.getSystemService(StatusBarManager::class.java) ?: return@Function false
      val component = ComponentName(context, LifeNoticeCaptureTileService::class.java)
      val icon = Icon.createWithResource(context, context.applicationInfo.icon)
      manager.requestAddTileService(component, "擷取行程", icon, context.mainExecutor) { }
      true
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

    Function("resetLocal") {
      val context = appContext.reactContext ?: return@Function null
      context.getSharedPreferences("life_notice_listener_v1", android.content.Context.MODE_PRIVATE).edit().clear().apply()
      (context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).cancelAll()
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

    Function("canReply") { noticeId: String ->
      val context = appContext.reactContext ?: return@Function false
      LifeNoticeListenerService.canReply(context, noticeId)
    }

    Function("reply") { noticeId: String, text: String ->
      val context = appContext.reactContext ?: return@Function false
      LifeNoticeListenerService.reply(context, noticeId, text)
    }

    Function("addCalendarEvent") { title: String, startAt: Double, endAt: Double, allDay: Boolean, description: String, location: String, syncKey: String ->
      addCalendarEvent(title, startAt.toLong(), endAt.toLong(), allDay, description, location, syncKey)
    }
  }
}
