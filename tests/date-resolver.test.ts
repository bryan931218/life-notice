import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveDateText} from '../src/date-resolver.ts';
import {parseDate,toCalendar,reminderPlan,validateBackup,inferLiveNotification,EMPTY,type Notice} from '../src/domain.ts';
import {noticesForDay} from '../src/calendar.ts';
const base=new Date(2026,8,12,10,0); // Saturday, local device time
for(const [text,date,time] of [
 ['明晚十點半開會','2026-09-13','22:30'],
 ['大後天下午兩點取件','2026-09-15','14:00'],
 ['下週五上午九點','2026-09-18','09:00'],
 ['週六晚上八點','2026-09-12','20:00'],
 ['2026/09/20 活動','2026-09-20',''],
 ['晚上10.開會','2026-09-12','22:00'],
 ['9/20 14:30 見面','2026-09-20','14:30'],
])test(text,()=>{const r=resolveDateText(text,base);assert.equal(r.date,date);assert.equal(r.time,time);assert.equal(r.needsReview,false)});
for(const text of ['明天或後天開會','2026/02/30 14:00','2026/13/01 14:00','明天25:00','明天10:00或11:00'])test(`拒絕不確定時間：${text}`,()=>assert.equal(resolveDateText(text,base).needsReview,true));
test('跨年相對日期',()=>assert.equal(resolveDateText('明天九點',new Date(2026,11,31)).date,'2027-01-01'));
test('截圖主題優先於攜帶事項',()=>{const r=inferLiveNotification('牙醫回診\n明天下午三點半\n請帶健保卡',base);assert.equal(r.title,'牙醫回診');assert.deepEqual(r.checklist,['請帶健保卡']);assert.equal(r.time,'15:30')});
test('時段預設必須待確認',()=>{const r=resolveDateText('明天下午開會',base);assert.equal(r.time,'15:00');assert.equal(r.needsReview,true)});
const notice:Notice={id:'qa',title:'旅行',source:'測試',category:'生活',dueAt:parseDate('2026-09-12',''),endAt:parseDate('2026-09-15',''),allDay:true,assignee:'我',checklist:[],done:false,remindMinutes:60,createdAt:base.toISOString(),updatedAt:base.toISOString(),history:[]};
test('全天 ICS 保留多日且結束日不包含',()=>{const ics=toCalendar(notice);assert.match(ics,/DTSTART;VALUE=DATE:20260912/);assert.match(ics,/DTEND;VALUE=DATE:20260915/);assert.equal(noticesForDay([notice],'2026-09-14').length,1);assert.equal(noticesForDay([notice],'2026-09-15').length,0)});
test('待確認事件不發排程提醒',()=>assert.equal(reminderPlan([{...notice,needsReview:true}],base.getTime()-86400000).length,0));
test('資料完整備份可還原全天、地點、清單狀態',()=>{const n={...notice,location:'會場',checklist:[{id:'c',text:'帶護照',done:true}]};const restored=validateBackup(JSON.parse(JSON.stringify({...EMPTY,notices:[n]})));assert.equal(restored.notices[0].allDay,true);assert.equal(restored.notices[0].checklist[0].done,true);assert.equal(restored.notices[0].endAt,n.endAt)});
