package expo.modules.noticelistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class LifeNoticeListenerService : NotificationListenerService() {
  companion object {
    private const val CHANNEL_ID = "life-notice-auto-detected"
    private const val CHANNEL_NAME = "自動偵測的重要通知"

    private val DATE = Regex("(?:20\\d{2}[年./-])?\\s*(?:1[0-2]|0?[1-9])[月./-](?:3[01]|[12]\\d|0?[1-9])(?:日|號)?")
    private val RELATIVE = Regex("今天|今晚|明天|明晚|後天|大後天|這週|本週|下週|下星期|週[一二三四五六日天]|星期[一二三四五六日天]")
    private val TIME = Regex("(?:(?:上午|早上|中午|下午|晚上|晚間|凌晨)\\s*(?:[01]?\\d|2[0-3])(?:[:：點時]\\s*[0-5]?\\d)?|(?:[01]?\\d|2[0-3])[:：][0-5]\\d)")
    private val STRONG = Regex("截止|最晚|到期|繳交|繳費|付款|取件|領取|取貨|集合|報名|預約|會議|開會|面試|上課|課程|考試|比賽|活動|登機|出發|看診|門診|回診|訂位|入住|退房|改期|延期|取消")
    private val ACTION = Regex("請|需要|需|務必|記得|別忘|回覆|填寫|完成|提交|繳|帶|攜帶|準備|確認|參加|出席")
    private val IMPORTANT = Regex("重要|緊急|急件|務必|請盡快|請立即|異動|更改|取消|延後|提前")
    private val IGNORE = Regex("驗證碼|認證碼|OTP|一次性密碼|登入碼|verification code", RegexOption.IGNORE_CASE)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.packageName == packageName) return
    val notification = sbn.notification ?: return
    val (title, body) = extract(notification)
    val text = listOf(title, body).filter { it.isNotBlank() }.distinct().joinToString("\n").trim()
    if (text.length < 3 || IGNORE.containsMatchIn(text)) return

    val (score, reason) = score(text)
    val aiMode = DetectedStore.aiMode(applicationContext)
    val category = notification.category.orEmpty()
    val messageLike = category == Notification.CATEGORY_MESSAGE || category == Notification.CATEGORY_EMAIL || category == Notification.CATEGORY_EVENT || category == Notification.CATEGORY_REMINDER || category == Notification.CATEGORY_SOCIAL
    // Local mode stays conservative. AI mode keeps broader messaging/event candidates so
    // semantic analysis can decide instead of hard-coded keyword rules.
    if ((!aiMode && score < 5) || (aiMode && score < 1 && !messageLike)) return

    val now = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()
    val appName = runCatching {
      val info = packageManager.getApplicationInfo(sbn.packageName, 0)
      packageManager.getApplicationLabel(info).toString()
    }.getOrDefault(sbn.packageName)
    val id = DetectedStore.idFor(sbn.packageName, title, body, now)
    val item = DetectedNotice(id, sbn.packageName, appName, title.ifBlank { appName }, body.ifBlank { title }, now, score, reason)
    if (DetectedStore.add(applicationContext, item) && score >= 5) notifyUser(item)
  }

  private fun extract(notification: Notification): Pair<String, String> {
    val extras = notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()
      ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
      ?: extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString()
      ?: ""

    // Prefer the plain Notification extras. Messaging apps such as Messenger and LINE
    // populate these fields, and they are stable across Android API levels. Avoid relying
    // on MessagingStyle extraction APIs whose signatures vary across SDK versions.
    val parts = linkedSetOf<String>()
    extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let(parts::add)
    extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let(parts::add)
    extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { line ->
      line?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let(parts::add)
    }
    return title.trim() to parts.joinToString("\n").take(8000)
  }

  private fun score(text: String): Pair<Int, String> {
    var score = 0
    val reasons = mutableListOf<String>()
    if (DATE.containsMatchIn(text)) { score += 5; reasons += "日期" }
    if (RELATIVE.containsMatchIn(text)) { score += 4; reasons += "相對日期" }
    if (TIME.containsMatchIn(text)) { score += 2; reasons += "時間" }
    if (STRONG.containsMatchIn(text)) { score += 5; reasons += "行程/期限關鍵字" }
    if (ACTION.containsMatchIn(text)) { score += 2; reasons += "待辦語意" }
    if (IMPORTANT.containsMatchIn(text)) { score += 4; reasons += "重要訊息" }
    return score to reasons.distinct().joinToString("、")
  }

  private fun notifyUser(item: DetectedNotice) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH))
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      putExtra("openAutoDetected", true)
      addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = launch?.let {
      PendingIntent.getActivity(this, item.id.hashCode(), it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val preview = item.text.replace("\n", " ").take(120)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("偵測到可能的重要行程")
      .setContentText("${item.appName} · $preview")
      .setStyle(Notification.BigTextStyle().bigText("來源：${item.appName}\n$preview\n\n已加入生活通知管家的待確認行程。"))
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setContentIntent(pending)
    manager.notify(item.id.hashCode(), builder.build())
  }
}
