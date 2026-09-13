package expo.modules.noticelistener

import java.util.Calendar
import java.util.TimeZone

internal data class CaptureTime(val start: Long, val end: Long, val allDay: Boolean)

/** Conservative offline parsing: ambiguous dates stay in the app for review. */
internal object CaptureDate {
  fun parse(text: String, receivedAt: Long): CaptureTime? {
    val base = Calendar.getInstance().apply { timeInMillis = receivedAt }
    val dates = linkedSetOf<Long>()
    fun day() = (base.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY,0); set(Calendar.MINUTE,0); set(Calendar.SECOND,0); set(Calendar.MILLISECOND,0) }
    for (m in Regex("大後天|後天|明天|明晚|今天|今晚|(?:下|這|本)?(?:週|星期|禮拜)[一二三四五六日天]").findAll(text)) {
      val token=m.value
      val d=day()
      val relative=mapOf("大後天" to 3,"後天" to 2,"明天" to 1,"明晚" to 1,"今天" to 0,"今晚" to 0)[token]
      val delta=relative ?: run {
        val target="一二三四五六日".indexOf(if(token.last()=='天') '日' else token.last())
        val today=(base.get(Calendar.DAY_OF_WEEK)+5)%7
        val diff=target-today
        if(token.startsWith("下")) diff+7 else if(!token.startsWith("這")&&!token.startsWith("本")&&diff<0) diff+7 else diff
      }
      d.add(Calendar.DAY_OF_MONTH,delta);dates.add(d.timeInMillis)
    }
    for(m in Regex("""(?<!\d)(?:(20\d{2})[年/.-])?(\d{1,2})[月/.-](\d{1,2})(?:日|號)?(?!\d)""").findAll(text)) {
      val y=m.groupValues[1].toIntOrNull()?:base.get(Calendar.YEAR)
      val month=m.groupValues[2].toInt();val date=m.groupValues[3].toInt()
      val d=day().apply { set(y,month-1,date) }
      if(d.get(Calendar.YEAR)!=y||d.get(Calendar.MONTH)!=month-1||d.get(Calendar.DAY_OF_MONTH)!=date)return null
      dates.add(d.timeInMillis)
    }
    fun number(s:String):Int {
      s.toIntOrNull()?.let { return it }
      val v=s.replace('兩','二').replace('〇','零');val digits="零一二三四五六七八九"
      if(v.contains('十')){val parts=v.split('十');return (if(parts[0].isEmpty())1 else digits.indexOf(parts[0]))*10+(if(parts[1].isEmpty())0 else digits.indexOf(parts[1]))}
      return digits.indexOf(v)
    }
    val times=linkedSetOf<Pair<Int,Int>>()
    for(m in Regex("""(上午|早上|中午|下午|晚上|晚間|凌晨|今晚|明晚)?\s*(\d{1,2}|[零〇一二兩三四五六七八九十]{1,3})\s*(?:[:：點時](半|\d{1,2}|[零〇一二兩三四五六七八九十]{1,3})?(?:分)?|\.(?=\D|$))""").findAll(text)) {
      var h=number(m.groupValues[2]);val min=if(m.groupValues[3]=="半")30 else if(m.groupValues[3].isEmpty())0 else number(m.groupValues[3])
      val part=m.groupValues[1].ifEmpty { if(Regex("今晚|明晚").containsMatchIn(text))"晚上" else "" }
      if(part in listOf("下午","晚上","晚間","今晚","明晚")&&h<12)h+=12
      if(part=="中午"&&h<11)h+=12
      if(part in listOf("凌晨","上午","早上")&&h==12)h=0
      if(h !in 0..23||min !in 0..59)return null
      times.add(h to min)
    }
    // A daypart alone needs a human choice, not an unexpected all-day calendar entry.
    if(times.isEmpty()&&Regex("早上|上午|中午|下午|晚上|晚間|今晚|明晚").containsMatchIn(text))return null
    if(dates.isEmpty()&&times.isNotEmpty()&&Regex("早上|上午|中午|下午|晚上|晚間|凌晨").containsMatchIn(text))dates.add(day().timeInMillis)
    if(dates.size!=1||times.size>1)return null
    val d=day().apply { timeInMillis=dates.first() }
    val allDay=times.isEmpty()
    val start=if(allDay)Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { clear();set(d.get(Calendar.YEAR),d.get(Calendar.MONTH),d.get(Calendar.DAY_OF_MONTH)) }.timeInMillis
      else { val (h,min)=times.first();d.set(Calendar.HOUR_OF_DAY,h);d.set(Calendar.MINUTE,min);if(d.timeInMillis<receivedAt)return null;d.timeInMillis }
    if(allDay&&d.timeInMillis<day().timeInMillis)return null
    return CaptureTime(start,start+if(allDay)86_400_000L else 1_800_000L,allDay)
  }
}
