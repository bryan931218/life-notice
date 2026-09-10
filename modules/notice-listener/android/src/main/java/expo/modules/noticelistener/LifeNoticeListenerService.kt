package expo.modules.noticelistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class LifeNoticeListenerService : NotificationListenerService() {
  companion object {
    private const val CHANNEL_ID = "life-notice-auto-detected"
    private const val CHANNEL_NAME = "重要行程"
    @Volatile private var current: LifeNoticeListenerService? = null

    private val DATE = Regex("(?:20\\d{2}[年./-])?\\s*(?:1[0-2]|0?[1-9])[月./-](?:3[01]|[12]\\d|0?[1-9])(?:日|號)?")
    private val RELATIVE = Regex("今天|今晚|明天|明晚|後天|大後天|這週|本週|下週|下星期|週[一二三四五六日天]|星期[一二三四五六日天]|禮拜[一二三四五六日天]")
    private val ARABIC_TIME = Regex("(?:(?:上午|早上|中午|下午|晚上|晚間|凌晨)\\s*)?(?:[01]?\\d|2[0-3])(?:\\s*(?:[:：點時]\\s*[0-5]?\\d?|點半)|\\.(?=\\D|$))")
    private val RELATIVE_NUMBER_TIME = Regex("(?:今天|今晚|明天|明晚|後天|大後天|週[一二三四五六日天]|星期[一二三四五六日天]|禮拜[一二三四五六日天])[^\\n]{0,5}(?:[01]?\\d|2[0-3])(?=\\s|[.。,:：點時]|$)")
    private val CHINESE_TIME = Regex("(?:(?:上午|早上|中午|下午|晚上|晚間|凌晨)\\s*)?(?:二十[零〇一二三]?|十[零〇一二三四五六七八九]?|[零〇一二兩三四五六七八九])點(?:半|[零〇一二兩三四五六七八九十]{1,3}分?)?")
    private val HIGH_INTENT = Regex("截止|最晚|到期|繳交|繳費|繳款|付款|取件|領取|取貨|集合|報名|預約|會議|開會|面試|上課|考試|比賽|登機|出發|看診|門診|回診|訂位|入住|退房")
    private val TASK_INTENT = Regex("填寫|回覆|提交|完成|準備|攜帶|帶上|聯絡|寄送|繳交|繳費|付款|領取|取件|報名|預約|購買|買|訂購|確認")
    private val EVENT = Regex("活動|課程|講座|聚餐|會議|比賽|考試|面試|預約|看診|回診|集合|出發|登機|訂位")
    private val SOCIAL_PLAN = Regex("吃飯|吃早餐|早餐|午餐|晚餐|宵夜|聚餐|見面|碰面|喝咖啡|咖啡|看電影|電影|打球|練球|唱歌|逛街|約一下|約嗎|要不要|一起")
    private val ACTION = Regex("請|需要|需|須|務必|記得|別忘|回覆|填寫|完成|提交|繳|帶|攜帶|準備|確認|參加|出席|領取|取件|付款|報名|預約")
    private val CHANGE = Regex("取消|改期|延期|提前|延後|異動|更改|變更|臨時|最後通知")
    private val IMPORTANT = Regex("重要|緊急|急件|務必|請盡快|請立即|異動|更改|取消|延後|提前")
    private val IGNORE = Regex("驗證碼|認證碼|OTP|一次性密碼|登入碼|verification code|Samsung Rewards|Rewards|獲得\\s*\\d+\\s*點|點數到帳|節能模式|省電模式|電池電量|剩餘電量|充電完成|裝置維護|系統更新|下載完成|安裝完成|同步完成|備份完成|已連線|VPN|截圖已儲存|廣告|優惠券|限時優惠|促銷|折扣|猜你喜歡|熱門新聞", RegexOption.IGNORE_CASE)

    fun canReply(context: Context, noticeId: String): Boolean = current?.replyActionFor(context, noticeId) != null

    fun reply(context: Context, noticeId: String, text: String): Boolean {
      if (text.isBlank()) return false
      return current?.sendReply(context, noticeId, text.trim()) ?: false
    }
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
    current = this
  }

  override fun onDestroy() {
    if (current === this) current = null
    super.onDestroy()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.packageName == packageName) return
    if (!AppMonitorStore.isAllowed(applicationContext, sbn.packageName)) return

    val notification = sbn.notification ?: return
    val (title, body) = extract(notification)
    val text = listOf(title, body).filter { it.isNotBlank() }.distinct().joinToString("\n").trim()
    if (text.length < 3 || IGNORE.containsMatchIn(text)) return

    val hasDate = DATE.containsMatchIn(text) || RELATIVE.containsMatchIn(text)
    val hasTime = ARABIC_TIME.containsMatchIn(text) || RELATIVE_NUMBER_TIME.containsMatchIn(text) || CHINESE_TIME.containsMatchIn(text)
    val hasHighIntent = HIGH_INTENT.containsMatchIn(text)
    val hasTaskIntent = TASK_INTENT.containsMatchIn(text)
    val hasEvent = EVENT.containsMatchIn(text)
    val hasSocialPlan = SOCIAL_PLAN.containsMatchIn(text)
    val hasAction = ACTION.containsMatchIn(text)
    val hasChange = CHANGE.containsMatchIn(text)
    val aiEnabled = DetectedStore.aiMode(applicationContext)

    val conversationalPlan = hasDate && hasTime && hasSocialPlan
    val aiDateTimeCandidate = aiEnabled && hasDate && hasTime
    val candidate = hasChange ||
      hasTaskIntent ||
      conversationalPlan ||
      aiDateTimeCandidate ||
      (hasHighIntent && (hasDate || hasTime || hasAction)) ||
      (hasDate && hasAction) ||
      (hasDate && hasTime && hasEvent)
    if (!candidate) return

    val (score, reason) = score(text)
    val minScore = if (aiEnabled && hasDate && hasTime) 5 else 7
    if (score < minScore) return

    val now = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()
    val appName = runCatching {
      val info = packageManager.getApplicationInfo(sbn.packageName, 0)
      packageManager.getApplicationLabel(info).toString()
    }.getOrDefault(sbn.packageName)
    val id = DetectedStore.idFor(sbn.packageName, title, body, now)
    val item = DetectedNotice(id, sbn.packageName, appName, title.ifBlank { appName }, body.ifBlank { title }, now, score, reason)

    if (hasReplyAction(notification)) ReplyTargetStore.save(applicationContext, item, sbn.key)
    if (DetectedStore.add(applicationContext, item) && shouldNotifyNow(text, score)) notifyUser(item)
  }

  private fun shouldNotifyNow(text: String, score: Int): Boolean {
    val hasDate = DATE.containsMatchIn(text) || RELATIVE.containsMatchIn(text)
    val hasTime = ARABIC_TIME.containsMatchIn(text) || RELATIVE_NUMBER_TIME.containsMatchIn(text) || CHINESE_TIME.containsMatchIn(text)
    val hasStrong = HIGH_INTENT.containsMatchIn(text)
    val hasSocialPlan = SOCIAL_PLAN.containsMatchIn(text)
    val urgentChange = CHANGE.containsMatchIn(text)
    val explicitImportant = IMPORTANT.containsMatchIn(text)
    return (urgentChange && score >= 7) ||
      (explicitImportant && (hasDate || hasStrong) && score >= 9) ||
      (hasDate && hasStrong && score >= 10) ||
      (hasDate && hasTime && hasSocialPlan && score >= 9)
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
    extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { line ->
      line?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let(parts::add)
    }
    return title.trim() to parts.joinToString("\n").take(8000)
  }

  private fun replyInputs(notification: Notification): Pair<Notification.Action, Array<RemoteInput>>? {
    val actions = notification.actions ?: return null
    for (action in actions) {
      val inputs = action.remoteInputs?.filter { it.allowFreeFormInput }?.toTypedArray().orEmpty()
      if (inputs.isNotEmpty()) return action to inputs
    }
    return null
  }

  private fun hasReplyAction(notification: Notification): Boolean = replyInputs(notification) != null

  private fun replyActionFor(context: Context, noticeId: String): Pair<Notification.Action, Array<RemoteInput>>? {
    val target = ReplyTargetStore.get(context, noticeId) ?: return null
    val active = runCatching { activeNotifications.toList() }.getOrDefault(emptyList())
    val exact = active.firstOrNull { it.key == target.notificationKey }
    if (exact != null) return replyInputs(exact.notification)

    val fallback = active
      .filter { it.packageName == target.packageName }
      .sortedByDescending { it.postTime }
      .firstOrNull { sbn ->
        val (title, _) = extract(sbn.notification)
        target.title.isBlank() || title == target.title
      } ?: return null
    return replyInputs(fallback.notification)
  }

  private fun sendReply(context: Context, noticeId: String, text: String): Boolean {
    val (action, inputs) = replyActionFor(context, noticeId) ?: return false
    return runCatching {
      val intent = Intent()
      val results = Bundle()
      inputs.forEach { input -> results.putCharSequence(input.resultKey, text.take(500)) }
      RemoteInput.addResultsToIntent(inputs, intent, results)
      action.actionIntent.send(context, 0, intent)
      true
    }.getOrDefault(false)
  }

  private fun score(text: String): Pair<Int, String> {
    var score = 0
    val reasons = mutableListOf<String>()
    if (DATE.containsMatchIn(text)) { score += 5; reasons += "日期" }
    if (RELATIVE.containsMatchIn(text)) { score += 4; reasons += "相對日期" }
    if (ARABIC_TIME.containsMatchIn(text) || RELATIVE_NUMBER_TIME.containsMatchIn(text) || CHINESE_TIME.containsMatchIn(text)) {
      score += 3; reasons += "時間"
    }
    if (HIGH_INTENT.containsMatchIn(text)) { score += 5; reasons += "行程/期限" }
    else if (EVENT.containsMatchIn(text)) { score += 3; reasons += "活動語意" }
    if (SOCIAL_PLAN.containsMatchIn(text)) { score += 3; reasons += "約定語意" }
    if (TASK_INTENT.containsMatchIn(text)) { score += 6; reasons += "待辦" }
    else if (ACTION.containsMatchIn(text)) { score += 2; reasons += "待辦語意" }
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
      .setContentTitle("偵測到行程")
      .setContentText("${item.appName} · $preview")
      .setStyle(Notification.BigTextStyle().bigText("來源：${item.appName}\n$preview"))
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setContentIntent(pending)
      .addAction(0, "加入行事曆", capturePending)
    manager.notify(item.id.hashCode(), builder.build())
  }
}