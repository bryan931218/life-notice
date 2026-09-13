import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {dayKey,historyNotices,monthGrid,noticesForDay,noticesForMonth,shiftMonth} from '../src/calendar.ts';
import type {Notice} from '../src/domain.ts';

const base:Notice={id:'a',title:'測試',source:'原文',category:'生活',dueAt:'2026-09-10T02:00:00.000Z',assignee:'我',checklist:[],done:false,remindMinutes:null,createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z',history:[]};

describe('內建月曆',()=>{
  it('每個月固定產生 6 週 42 格',()=>{
    const days=monthGrid(new Date(2026,8,1));
    assert.equal(days.length,42);
    assert.equal(days[0].getDay(),0);
    assert.equal(days[41].getDay(),6);
  });
  it('可以依手機本地日期把行程放到正確天',()=>{
    const key=dayKey(new Date(2026,8,10,10,0));
    const items=noticesForDay([base,{...base,id:'done',done:true}],key);
    assert.equal(items.length,1);
    assert.equal(items[0].id,'a');
  });
  it('跨年切換月份正確',()=>{
    const next=shiftMonth(new Date(2026,11,1),1);
    assert.equal(next.getFullYear(),2027);
    assert.equal(next.getMonth(),0);
  });
  it('月曆可顯示已完成行程，無日期待辦留在紀錄列表',()=>{
    const completed={...base,id:'done',done:true};
    assert.deepEqual(noticesForDay([base,completed,{...completed,id:'todo',dueAt:null}],dayKey(base.dueAt!),true).map(n=>n.id),['a','done']);
  });
  it('歷史保留已完成待辦與舊行程，不把今天或跨日進行中的事件當過期',()=>{
    const now=new Date(2026,8,11,15);
    const old={...base,id:'old',dueAt:new Date(2026,8,10,12).toISOString()};
    const today={...base,id:'today',dueAt:new Date(2026,8,11,8).toISOString()};
    const ongoing={...old,id:'ongoing',endAt:new Date(2026,8,12,12).toISOString()};
    const done={...base,id:'done',title:'領取包裹',done:true,dueAt:null};
    const all=[old,today,ongoing,done];
    assert.deepEqual(historyNotices(all,'all','',now).map(n=>n.id),['old','done']);
    assert.deepEqual(historyNotices(all,'completed','包裹',now).map(n=>n.id),['done']);
    assert.deepEqual(historyNotices(all,'past','',now).map(n=>n.id),['old']);
    assert.deepEqual(historyNotices([{...done,done:false}],'completed','',now),[]);
    assert.equal(historyNotices(all,'all','找不到',now).length,0);
  });
  it('月統計不會把其他月份算進來',()=>{
    const october={...base,id:'oct',dueAt:'2026-10-01T02:00:00.000Z'};
    assert.equal(noticesForMonth([base,october],new Date(2026,8,1)).length,1);
  });
});
