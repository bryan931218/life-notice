package expo.modules.noticelistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class LifeNoticeListenerService : NotificationListenerService() {
  companion object {
    private const val CHANNEL_ID = "life-notice-auto-detected"
    private const val CHANNEL_NAME = "重要行程"

    private val DATE = Regex("(?:20\\d{2}[年./-])?\\s*(?:1[0-2]|0?[1-9])[月./-](?:3[01]|[12]\\d|0?[1-9])(?:日|號)?")
    private val RELATIVE = Regex("今天|今晚|明天|明晚|後天|大後天|這週|本週|下週|下星期|週[一二三四五六日天]|星期[一二三四五六日天]|禮拜[一二三四五六日天]")
    private val TIME = Regex("(?:(?:上午|早上|中午|下午|晚上|晚間|凌晨)\\s*(?:[01]?\\d|2[0-3])(?:[:：點時]\\s*[0-5]?\\d)?|(?:[01]?\\d|2[0-3])[:：][0-5]\\d)")
    private val HIGH_INTENT = Regex("截止|最晚|到期|繳交|繳費|繳款|付款|取件|領取|取貨|集合|報名|預約|會議|開會|面試|上課|考試|比賽|登機|出發|看診|門診|回診|訂位|入住|退房")
    private val EVENT = Regex("活動|課程|講座|聚餐|會議|比賽|考試|面試|預約|看診|回診|集合|出發|登機|訂位")
    private val ACTION = Regex("請|需要|需|須|務必|記得|別忘|回覆|填寫|完成|提交|繳|帶|攜帶|準備|確認|參加|出席|領取|取件|付款|報名|預約")
    private val CHANGE = Regex("取消|改期|延期|提前|延後|異動|更改|變更|臨時|最後通知")
    private val IMPORTANT = Regex("重要|緊急|急件|務必|請盡快|請立即|異動|更改|取消|延後|提前")
    private val IGNORE = Regex("驗證碼|認證碼|OTP|一次性密碼|登入碼|verification code|Samsung Rewards|Rewards|獲得\\s*\\d+\\s*點|點數到帳|節能模式|省電模式|電池電量|剩餘電量|充電完成|裝置維護|系統更新|下載完成|安裝完成|同步完成|備份完成|已連線|VPN|截圖已儲存|廣告|優惠券|限時優惠|促銷|折扣|猜你喜歡|熱門新聞", RegexOption.IGNORE_CASE)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.packageName == packageName) return
    val notification = sbn.notification ?: return
    val (title, body) = extract(notification)
    val text = listOf(title, body).filter { it.isNotBlank() }.distinct().joinToString("\n").trim()
    if (text.length < 3 || IGNORE.containsMatchIn(text)) return

    // Cheap local gate before anything is stored or sent to AI. A date, a time, or the
    // word "請" alone is never enough: system status messages and ordinary chats often
    // contain those. We require an actual schedule/deadline/action combination.
    val hasDate = DATE.containsMatchIn(text) || RELATIVE.containsMatchIn(text)
    val hasTime = TIME.containsMatchIn(text)
    val hasHighIntent = HIGH_INTENT.containsMatchIn(text)
    val hasEvent = EVENT.containsMatchIn(text)
    val hasAction = ACTION.containsMatchIn(text)
    val hasChange = CHANGE.containsMatchIn(text)
    val candidate = hasChange ||
      (hasHighIntent && (hasDate || hasTime || hasAction)) ||
      (hasDate && hasAction) ||
      (hasDate && hasTime && hasEvent)
    if (!candidate) return

    val (score, reason) = score(text)
    if (score < 7) return

    val now = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()
    val appName = runCatching {
      val info = packageManager.getApplicationInfo(sbn.packageName, 0)
      packageManager.getApplicationLabel(info).toString()
    }.getOrDefault(sbn.packageName)
    val id = DetectedStore.idFor(sbn.packageName, title, body, now)
    val item = DetectedNotice(id, sbn.packageName, appName, title.ifBlank { appName }, body.ifBlank { title }, now, score, reason)
    if (DetectedStore.add(applicationContext, item) && shouldNotifyNow(text, score)) notifyUser(item)
  }

  private fun shouldNotifyNow(text: String, score: Int): Boolean {
    // The listener is intentionally quiet. Capturing a candidate is not the same thing
    // as interrupting the user with another notification.
    val hasDate = DATE.containsMatchIn(text) || RELATIVE.containsMatchIn(text)
    val hasStrong = HIGH_INTENT.containsMatchIn(text)
    val urgentChange = CHANGE.containsMatchIn(text)
    val explicitImportant = IMPORTANT.containsMatchIn(text)
    return (urgentChange && score >= 7) ||
      (explicitImportant && (hasDate || hasStrong) && score >= 9) ||
      (hasDate && hasStrong && score >= 10)
  }

  private fun extract(notification: Notification): Pair<String, String> {
    val extras = notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()
      ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
      ?: extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString()
      ?: ""

    val parts = linkedSetOf<String>()
    extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let(parts::add)
    extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let(parts::add)
    extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { line -> line?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let(parts::add) }
    return title.trim() to parts.joinToString("\n").take(8000)
  }

  private fun score(text: String): Pair<Int, String> {
    var score = 0
    val reasons = mutableListOf<String>()
    if (DATE.containsMatchIn(text)) { score += 5; reasons += "日期" }
    if (RELATIVE.containsMatchIn(text)) { score += 4; reasons += "相對日期" }
    if (TIME.containsMatchIn(text)) { score += 2; reasons += "時間" }
    if (HIGH_INTENT.containsMatchIn(text)) { score += 5; reasons += "行程/期限" }
    else if (EVENT.containsMatchIn(text)) { score += 3; reasons += "活動語意" }
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
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = launch?.let {
      PendingIntent.getActivity(this, item.id.hashCode(), it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val captureIntent = Intent(this, QuickCaptureReceiver::class.java).putExtra("noticeId", item.id)
    val capturePending = PendingIntent.getBroadcast(this, item.id.hashCode() xor 0x43A7, captureIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val preview = item.text.replace("\n", " ").take(120)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("偵測到重要行程")
      .setContentText("${item.appName} · $preview")
      .setStyle(Notification.BigTextStyle().bigText("來源：${item.appName}\n$preview"))
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setContentIntent(pending)
      .addAction(0, "加入行事曆", capturePending)
    manager.notify(item.id.hashCode(), builder.build())
  }
}
