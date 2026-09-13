import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeScreenshotWithAI,parseAiToolCall} from '../src/ai.ts';
const args={apiKey:'sk-synthetic-only',model:'gpt-5.6-luna' as const,base64:'synthetic',mimeType:'image/png',receivedAt:Date.now(),existing:[]};
test('API 錯誤不洩漏金鑰或供應商原始回應',async()=>{const old=globalThis.fetch;try{globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'sk-private-value'}}),{status:401});await assert.rejects(analyzeScreenshotWithAI(args),e=>e instanceof Error&&e.message.includes('無效')&&!e.message.includes('sk-private'));}finally{globalThis.fetch=old}});
test('正確處理 429 與非工具回應',async()=>{const old=globalThis.fetch;try{globalThis.fetch=async()=>new Response('{}',{status:429});await assert.rejects(analyzeScreenshotWithAI(args),/額度/);globalThis.fetch=async()=>new Response('{"output":[]}');await assert.rejects(analyzeScreenshotWithAI(args),/唯一/);}finally{globalThis.fetch=old}});
test('不接受 null 工具參數',()=>assert.throws(()=>parseAiToolCall({name:'create_task',arguments:'null'}),/格式/));
test('不將二月三十日自動改成三月',()=>assert.throws(()=>parseAiToolCall({name:'create_task',arguments:JSON.stringify({due_at:'2026-02-30T09:00:00+08:00'})}),/日期/));
test('讀取 API 回應時也受逾時保護',async(t)=>{
 const old=globalThis.fetch;t.mock.timers.enable({apis:['setTimeout']});
 try{
  globalThis.fetch=async(_url,init)=>({ok:true,json:()=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted'))))}) as Response;
  const pending=analyzeScreenshotWithAI(args);await Promise.resolve();t.mock.timers.tick(30000);await assert.rejects(pending,/逾時/);
 }finally{globalThis.fetch=old;t.mock.timers.reset()}
});
test('不接受倒置的開始結束時間',()=>assert.throws(()=>parseAiToolCall({name:'create_calendar_event',arguments:JSON.stringify({start_at:'2026-09-20T10:00:00+08:00',end_at:'2026-09-20T09:00:00+08:00'})}),/結束/));
