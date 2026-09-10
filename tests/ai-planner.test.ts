import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseAiToolCall,parseAiToolCalls} from '../src/ai.ts';

const eventArgs={
  title:'開會',start_at:'2026-09-11T22:00:00+08:00',end_at:null,all_day:false,
  location:null,reminder_minutes:60,category:'活動',checklist:[],importance:'normal',confidence:0.95,reason:'晚上十點仍在收到通知之後'
};

describe('AI 多工具規劃',()=>{
  it('主要行程可以同時帶快速回覆建議',()=>{
    const d=parseAiToolCalls([
      {name:'create_calendar_event',arguments:JSON.stringify(eventArgs)},
      {name:'suggest_replies',arguments:JSON.stringify({replies:['可以，晚上十點見','我晚點再確認','不行耶']})},
    ]);
    assert.equal(d.type,'create_calendar_event');
    if(d.type==='create_calendar_event'){
      assert.equal(d.title,'開會');
      assert.deepEqual(d.replySuggestions,['可以，晚上十點見','我晚點再確認','不行耶']);
    }
  });

  it('快速回覆會去重、去空白並限制三個',()=>{
    const d=parseAiToolCalls([
      {name:'create_calendar_event',arguments:JSON.stringify(eventArgs)},
      {name:'suggest_replies',arguments:JSON.stringify({replies:[' 好 ','好','','不行','再看看']})},
    ]);
    assert.equal(d.type,'create_calendar_event');
    if(d.type==='create_calendar_event')assert.deepEqual(d.replySuggestions,['好','不行','再看看']);
  });

  it('同時兩個主要動作會拒絕執行',()=>{
    assert.throws(()=>parseAiToolCalls([
      {name:'create_calendar_event',arguments:JSON.stringify(eventArgs)},
      {name:'create_task',arguments:JSON.stringify({title:'回覆老師',due_at:null,reminder_minutes:null,category:'學校',checklist:[],importance:'normal',confidence:0.9,reason:'待辦'})},
    ]),/唯一的主要/);
  });

  it('可以取消既有行程但不能捏造 id',()=>{
    const ok=parseAiToolCall({name:'cancel_existing_event',arguments:JSON.stringify({event_id:'real',importance:'urgent',confidence:0.99,reason:'明確取消'})},new Set(['real']));
    assert.equal(ok.type,'cancel_existing_event');
    assert.throws(()=>parseAiToolCall({name:'cancel_existing_event',arguments:JSON.stringify({event_id:'fake',importance:'urgent',confidence:0.99,reason:'取消'})},new Set(['real'])),/不存在/);
  });

  it('可以將既有 Todo 標記完成',()=>{
    const d=parseAiToolCall({name:'complete_existing_task',arguments:JSON.stringify({event_id:'todo-1',confidence:0.97,reason:'通知顯示已提交'})},new Set(['todo-1']));
    assert.equal(d.type,'complete_existing_task');
  });
});
