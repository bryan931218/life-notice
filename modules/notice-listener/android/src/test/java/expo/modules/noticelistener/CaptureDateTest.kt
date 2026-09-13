package expo.modules.noticelistener
import org.junit.Test
import org.junit.Assert.*
import java.util.Calendar
import java.util.TimeZone
class CaptureDateTest {
  private fun base():Long {TimeZone.setDefault(TimeZone.getTimeZone("Asia/Taipei"));return Calendar.getInstance().apply {clear();set(2026,8,12,10,0)}.timeInMillis}
  @Test fun relativeChineseTime(){val p=CaptureDate.parse("明晚十點半開會",base())!!;val d=Calendar.getInstance().apply{timeInMillis=p.start};assertEquals(13,d.get(Calendar.DAY_OF_MONTH));assertEquals(22,d.get(Calendar.HOUR_OF_DAY));assertEquals(30,d.get(Calendar.MINUTE))}
  @Test fun nextWeek(){val d=Calendar.getInstance().apply{timeInMillis=CaptureDate.parse("下週五上午九點",base())!!.start};assertEquals(18,d.get(Calendar.DAY_OF_MONTH))}
  @Test fun threeDays(){val d=Calendar.getInstance().apply{timeInMillis=CaptureDate.parse("大後天下午兩點",base())!!.start};assertEquals(15,d.get(Calendar.DAY_OF_MONTH))}
  @Test fun rejectAmbiguity(){assertNull(CaptureDate.parse("明天或後天開會",base()));assertNull(CaptureDate.parse("明天下午開會",base()));assertNull(CaptureDate.parse("2026/02/30 10:00",base()))}
  @Test fun allDayUsesUtc(){val p=CaptureDate.parse("2026/09/20 活動",base())!!;assertTrue(p.allDay);assertEquals(86_400_000L,p.end-p.start);val d=Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply{timeInMillis=p.start};assertEquals(20,d.get(Calendar.DAY_OF_MONTH));assertEquals(0,d.get(Calendar.HOUR_OF_DAY))}
  @Test fun dottedTime(){val d=Calendar.getInstance().apply{timeInMillis=CaptureDate.parse("今天晚上7.30去吃飯",base())!!.start};assertEquals(19,d.get(Calendar.HOUR_OF_DAY));assertEquals(30,d.get(Calendar.MINUTE))}
  @Test fun eveningRangeUsesToday(){val p=CaptureDate.parse("晚上要不要打羽球\n6～8",base())!!;val d=Calendar.getInstance().apply{timeInMillis=p.start};assertEquals(18,d.get(Calendar.HOUR_OF_DAY));assertEquals(2*3_600_000L,p.end-p.start)}
  @Test fun listenerAcceptsDottedTimePlan(){val text="今天晚上7.30去星月廣場吃古拉爵";assertTrue(LifeNoticeListenerService.isCandidateText(text));assertTrue(LifeNoticeListenerService.scoreText(text).first>=7)}
  @Test fun listenerAcceptsSplitSportsPlan(){val text="晚上要不要打羽球\n6～8";assertTrue(LifeNoticeListenerService.isCandidateText(text));assertTrue(LifeNoticeListenerService.scoreText(text).first>=7)}
  @Test fun aiModeUsesRecallFirstFilter(){assertTrue(LifeNoticeListenerService.isCandidateText("晚點再跟你確認細節",true))}
}
