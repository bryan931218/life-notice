import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseDate,inferNotice,updateNotice,reminderPlan,validateBackup,toCalendar,EMPTY,type Notice} from '../src/domain.ts';
const n:Notice={id:'a',title:'家長日',source:'原通知',category:'學校',dueAt:'2027-10-01T02:00:00.000Z',assignee:'我',checklist:[],done:false,remindMinutes:60,createdAt:'2026-09-10T00:00:00Z',updatedAt:'2026-09-10T00:00:00Z',history:[]};
describe('日期與匯入',()=>{
 it('拒絕不存在的日期和時間',()=>{assert.throws(()=>parseDate('2027-02-29','09:00'));assert.throws(()=>parseDate('2026-09-10','24:00'));assert.throws(()=>parseDate('2026-09-10',''));assert.equal(parseDate('',''),null)});
 it('接受閏年',()=>assert.ok(parseDate('2028-02-29','09:00')));
 it('絕不猜測舊訊息的年份或明天',()=>{assert.equal(inferNotice('9/12 校外教學 明天出發').date,'');assert.equal(inferNotice('明天下午去拿包裹').date,'')});
 it('多日期必須由人確認',()=>{assert.equal(inferNotice('2027/09/12 報名 2027/09/14 出發').date,'')});
 it('抽出完整日期、下午時間與準備清單',()=>{const r=inferNotice('校外教學\n2027/09/12 下午 2:30\n請帶水壺');assert.equal(r.date,'2027-09-12');assert.equal(r.time,'14:30');assert.equal(r.category,'學校');assert.deepEqual(r.checklist,['請帶水壺'])});
});
describe('更正與通知',()=>{
 it('更正保留舊版且原件不變',()=>{const x=updateNotice(n,{title:'家長日延期',dueAt:'2027-10-02T02:00:00Z'});assert.equal(x.id,n.id);assert.equal(x.history[0].title,'家長日');assert.equal(n.history.length,0)});
 it('完成與勾選不製造虛假的更正紀錄',()=>assert.equal(updateNotice(n,{done:true}).history.length,0));
 it('過期、完成和關閉提醒不排程',()=>{assert.equal(reminderPlan([{...n,done:true},{...n,id:'b',remindMinutes:null},{...n,id:'c',dueAt:'2020-01-01T00:00:00Z'}],Date.parse('2026-01-01')).length,0)});
 it('按提醒時間取最近40筆',()=>{const a=Array.from({length:50},(_,i)=>({...n,id:String(i),dueAt:new Date(Date.parse(n.dueAt!)+i*3600000).toISOString()}));const r=reminderPlan(a,0);assert.equal(r.length,40);assert.equal(r[0].at,Date.parse(n.dueAt!)-3600000)});
});
describe('備份與行事曆',()=>{
 it('匯入拒絕重複ID及惡意格式',()=>{assert.throws(()=>validateBackup({...EMPTY,notices:[n,n]}));assert.throws(()=>validateBackup({...EMPTY,notices:[{...n,dueAt:'oops'}]}))});
 it('備份中的未知負責人會安全改回我',()=>{const restored=validateBackup({...EMPTY,notices:[{...n,assignee:'陌生帳號'}]});assert.equal(restored.notices[0].assignee,'我')});
 it('匯入不使用外來附件路徑',()=>{assert.equal(validateBackup({...EMPTY,notices:[{...n,sourceImage:'file:///private/file'}]}).notices[0].sourceImage,undefined)});
 it('行事曆正確逸出換行，中文字折行不切斷字元',()=>{const s=toCalendar({...n,title:'測試,分號;\n換行',source:'中'.repeat(100)});assert.ok(s.includes('SUMMARY:測試\\,分號\\;\\n換行'));assert.ok(s.includes('DTSTART:20271001T020000Z'));for(const line of s.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75)});
});
