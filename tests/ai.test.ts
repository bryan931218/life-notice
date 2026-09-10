import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseAiToolCall} from '../src/ai.ts';

describe('AI 工具呼叫安全檢查',()=>{
  it('可以建立有時間與地點的行事曆事件',()=>{
    const d=parseAiToolCall({name:'create_calendar_event',arguments:JSON.stringify({
      title:'永信盃',start_at:'2026-09-19T08:00:00+08:00',end_at:'2026-09-22T18:00:00+08:00',all_day:false,
      location:'台中',reminder_minutes:1440,category:'活動',checklist:['球衣'],importance:'important',confidence:0.96,reason:'訊息明確提供日期範圍'
    })});
    assert.equal(d.type,'create_calendar_event');
    if(d.type==='create_calendar_event'){
      assert.equal(d.title,'永信盃');
      assert.equal(d.startAt,'2026-09-19T00:00:00.000Z');
      assert.equal(d.location,'台中');
      assert.equal(d.confidence,0.96);
      assert.equal(d.importance,'important');
    }
  });

  it('一般聊天可以明確略過',()=>{
    const d=parseAiToolCall({name:'ignore_notification',arguments:JSON.stringify({confidence:0.99,reason:'一般聊天，沒有待辦或行程'})});
    assert.deepEqual(d,{type:'ignore_notification',confidence:0.99,reason:'一般聊天，沒有待辦或行程'});
  });

  it('禁止 AI 更新不存在的既有行程',()=>{
    assert.throws(()=>parseAiToolCall({name:'update_existing_event',arguments:JSON.stringify({
      event_id:'hallucinated',title:null,start_at:null,end_at:null,location:null,reminder_minutes:null,importance:'urgent',confidence:0.9,reason:'改期'
    })},new Set(['real-event'])),/不存在/);
  });

  it('禁止用無效時間建立行事曆事件',()=>{
    assert.throws(()=>parseAiToolCall({name:'create_calendar_event',arguments:JSON.stringify({
      title:'測試',start_at:'明天下午',end_at:null,all_day:false,location:null,reminder_minutes:60,category:'生活',checklist:[],importance:'normal',confidence:0.8,reason:'測試'
    })}),/有效的行程時間/);
  });
});
