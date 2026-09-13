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
  private val relative = Regex("大後天|後天|明天|明晚|今天|今晚")
  private val time = Regex("""(上午|早上|中午|下午|晚上|晚間|凌晨)?\s*([01]?\d|2[0-3])(?:[:：點時]\s*([0-5]?\d)?)""")
  private val leading = Regex("""^(?:請|記得|務必|別忘了?|麻煩|提醒(?:一下)?)[：:，,\s]*""")

  fun capture(context: Context, item: DetectedNotice): QuickCaptureResult {
    val text = listOf(item.title, item.text).filter { it.isNotBlank() }.distinct().joinToString("\n")
    val parsed = CaptureDate.parse(text,item.receivedAt)
      ?: return QuickCaptureResult(false,"日期或時間不夠明確，請開啟 App 確認。")
    if (context.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) != PackageManager.PERMISSION_GRANTED ||
        context.checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED)
      return QuickCaptureResult(false,"請先在 App 開啟一次手機行事曆權限。")
    return try {
      val title=eventTitle(item)
      val result=CalendarWriter.write(context,title,parsed.start,parsed.end,parsed.allDay,"來源：${item.appName}\n${item.text}","","detected-${item.id}",true)
      QuickCaptureResult(true,if(result=="already-synced")"這則行程已經加入過。" else if(result=="updated")"已更新行事曆：$title" else "已加入行事曆：$title")
    } catch (_:Exception) { QuickCaptureResult(false,"行事曆無法寫入，請開啟 App 檢查權限與行事曆帳戶。") }
  }

  private fun eventTitle(item: DetectedNotice): String {
    val body = item.text.lineSequence().map { it.trim() }.firstOrNull { it.length >= 2 }.orEmpty()
    val cleaned = (body.ifBlank { item.title })
      .replace(numericDate, " ")
      .replace(relative, " ")
      .replace(weekday, " ")
      .replace(time, " ")
      .replace(leading, "")
      .replace(Regex("""[，,。.!！?？\s]{2,}"""), " ")
      .trim(' ', '，', ',', '。', '.', '：', ':')
    return (cleaned.takeIf { it.length >= 2 } ?: "${item.appName} 行程").take(80)
  }

}

class QuickCaptureReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val id = intent?.getStringExtra("noticeId")
    val item = DetectedStore.get(context).firstOrNull { it.id == id }
    val result = item?.let { QuickCapture.capture(context, it) } ?: QuickCaptureResult(false, "沒有可擷取的新通知。")
    Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
  }
}
