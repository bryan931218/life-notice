package expo.modules.noticelistener

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.provider.CalendarContract
import java.util.Calendar
import java.util.TimeZone

internal object CalendarWriter {
  private fun utcDay(millis:Long):Long {
    val local=Calendar.getInstance().apply { timeInMillis=millis }
    return Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { clear();set(local.get(Calendar.YEAR),local.get(Calendar.MONTH),local.get(Calendar.DAY_OF_MONTH)) }.timeInMillis
  }
  @Synchronized
  fun write(context:Context,title:String,startAt:Long,endAt:Long,allDay:Boolean,description:String,location:String,syncKey:String,utcAllDay:Boolean=false):String {
    val prefs=context.getSharedPreferences("life_notice_listener_v1",Context.MODE_PRIVATE)
    val resolver=context.contentResolver
    val start=if(allDay&&!utcAllDay)utcDay(startAt) else startAt
    val rawEnd=if(allDay&&!utcAllDay)utcDay(endAt) else endAt
    val end=if(rawEnd>start)rawEnd else start+if(allDay)86_400_000L else 1_800_000L
    val values=ContentValues().apply {
      put(CalendarContract.Events.TITLE,title.take(200));put(CalendarContract.Events.DESCRIPTION,description.take(4000))
      put(CalendarContract.Events.DTSTART,start);put(CalendarContract.Events.DTEND,end);put(CalendarContract.Events.ALL_DAY,if(allDay)1 else 0)
      put(CalendarContract.Events.EVENT_TIMEZONE,if(allDay)"UTC" else TimeZone.getDefault().id);put(CalendarContract.Events.EVENT_LOCATION,location.take(200))
    }
    val saved=prefs.getLong("event_id_$syncKey",-1)
    if(saved>=0){
      val uri=ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,saved)
      val exists=resolver.query(uri,arrayOf(CalendarContract.Events._ID),"${CalendarContract.Events.DELETED}=0",null,null)?.use { it.moveToFirst() }?:false
      if(exists&&resolver.update(uri,values,null,null)>0)return "updated"
    }
    // Old builds stored only a marker, so we cannot safely identify their calendar row.
    if(saved<0&&prefs.getStringSet("calendar_synced",emptySet())?.contains(syncKey)==true)return "already-synced"
    val calendarId=resolver.query(CalendarContract.Calendars.CONTENT_URI,arrayOf(CalendarContract.Calendars._ID),"${CalendarContract.Calendars.VISIBLE}=1 AND ${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL}>=?",arrayOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR.toString()),"${CalendarContract.Calendars.IS_PRIMARY} DESC")?.use { if(it.moveToFirst())it.getLong(0) else null }?:throw IllegalStateException("找不到可寫入的手機行事曆，請先在手機行事曆建立帳戶。")
    values.put(CalendarContract.Events.CALENDAR_ID,calendarId)
    val uri=resolver.insert(CalendarContract.Events.CONTENT_URI,values)?:throw IllegalStateException("行事曆寫入失敗。")
    prefs.edit().putLong("event_id_$syncKey",ContentUris.parseId(uri)).apply()
    return "created"
  }
}
