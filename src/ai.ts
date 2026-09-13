import type {Category, Importance, Notice} from './domain';
import {isGoogleMapsUrl,resolveGoogleMapsLinks,type SharedLinkInfo} from './links.ts';

export const AI_MODELS=[['gpt-5.6-luna','GPT-5.6 Luna']] as const;
export type AiModel=typeof AI_MODELS[number][0];

type Replyable={replySuggestions:string[]};
export type AiDecision=
  | ({type:'create_calendar_event';title:string;startAt:string;endAt:string|null;allDay:boolean;location:string|null;reminderMinutes:number;category:Category;checklist:string[];importance:Importance;confidence:number;reason:string}&Replyable)
  | ({type:'create_task';title:string;dueAt:string|null;reminderMinutes:number|null;category:Category;checklist:string[];importance:Importance;confidence:number;reason:string}&Replyable)
  | ({type:'update_existing_event';eventId:string;title:string|null;startAt:string|null;endAt:string|null;location:string|null;reminderMinutes:number|null;importance:Importance;confidence:number;reason:string}&Replyable)
  | ({type:'cancel_existing_event';eventId:string;importance:Importance;confidence:number;reason:string}&Replyable)
  | ({type:'complete_existing_task';eventId:string;confidence:number;reason:string}&Replyable)
  | ({type:'ask_user';title:string;proposedAt:string|null;question:string;category:Category;importance:Importance;confidence:number;reason:string}&Replyable)
  | {type:'ignore_notification';confidence:number;reason:string};

type AnalyzeArgs={apiKey:string;model:AiModel;appName:string;title:string;text:string;receivedAt:number;existing:Notice[]};
const categories=['生活','學校','帳單','取件','活動'];
const importanceProperty={type:'string',enum:['normal','important','urgent'],description:'normal=一般但值得記錄；important=需要主動提醒；urgent=取消、改期、即將截止或其他應立刻注意的事項。低價值聊天應使用 ignore_notification。'};
const common={confidence:{type:'number',minimum:0,maximum:1,description:'0 到 1，代表你對這個動作的信心。'},reason:{type:'string',maxLength:240,description:'用繁體中文簡短說明為何選這個動作。'}};
const tools=[
  {type:'function',name:'create_calendar_event',strict:true,description:'通知或聊天明確描述某個時間會發生的活動、邀約、會議、課程、比賽、預約、看診、出發、訂位等事件。時間可由 received_at 與可靠相對時間推得。',parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:100},start_at:{type:'string',description:'ISO 8601 日期時間。依原文與 received_at/device_timezone 推得；不可憑空猜。'},end_at:{type:['string','null'],description:'ISO 8601 結束時間；未知則 null。'},all_day:{type:'boolean'},location:{type:['string','null'],maxLength:200},reminder_minutes:{type:'integer',minimum:0,maximum:10080},category:{type:'string',enum:categories},checklist:{type:'array',items:{type:'string',maxLength:160},maxItems:8},importance:importanceProperty,...common},required:['title','start_at','end_at','all_day','location','reminder_minutes','category','checklist','importance','confidence','reason']}},
  {type:'function',name:'create_task',strict:true,description:'通知描述使用者要完成、填寫、回覆、準備、購買、繳交、繳費、領取等待辦時使用。沒有期限完全可以建立 Todo。',parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:100},due_at:{type:['string','null'],description:'ISO 8601 截止時間；內容沒有明確期限就必須填 null。'},reminder_minutes:{type:['integer','null'],minimum:0,maximum:10080,description:'無期限 Todo 必須填 null。'},category:{type:'string',enum:categories},checklist:{type:'array',items:{type:'string',maxLength:160},maxItems:8},importance:importanceProperty,...common},required:['title','due_at','reminder_minutes','category','checklist','importance','confidence','reason']}},
  {type:'function',name:'update_existing_event',strict:true,description:'新通知明確是在更正、延期、提前、補地點、換地點或更新既有行程/待辦時使用。event_id 必須來自 existing_upcoming_events。未變更的欄位填 null；null 表示保留原值。',parameters:{type:'object',additionalProperties:false,properties:{event_id:{type:'string'},title:{type:['string','null'],maxLength:100},start_at:{type:['string','null']},end_at:{type:['string','null']},location:{type:['string','null'],maxLength:200},reminder_minutes:{type:['integer','null'],minimum:0,maximum:10080},importance:importanceProperty,...common},required:['event_id','title','start_at','end_at','location','reminder_minutes','importance','confidence','reason']}},
  {type:'function',name:'cancel_existing_event',strict:true,description:'通知明確表示 existing_upcoming_events 中某個行程已取消、不用去、不舉行時使用。不要另外建立一個「取消」行程。',parameters:{type:'object',additionalProperties:false,properties:{event_id:{type:'string'},importance:importanceProperty,...common},required:['event_id','importance','confidence','reason']}},
  {type:'function',name:'complete_existing_task',strict:true,description:'通知明確證明 existing_upcoming_events 中某個待辦已完成，例如已繳費、已提交、已領取。只有有清楚對應時使用。',parameters:{type:'object',additionalProperties:false,properties:{event_id:{type:'string'},...common},required:['event_id','confidence','reason']}},
  {type:'function',name:'ask_user',strict:true,description:'只有存在兩個以上合理解讀，而且錯選會造成錯誤行程時才使用。不要為了確認已能從 received_at 推得的今天/今晚/明天日期而詢問；不要只因為缺少精確鐘點就詢問。',parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:100},proposed_at:{type:['string','null']},question:{type:'string',maxLength:200},category:{type:'string',enum:categories},importance:importanceProperty,...common},required:['title','proposed_at','question','category','importance','confidence','reason']}},
  {type:'function',name:'ignore_notification',strict:true,description:'一般聊天、貼圖、廣告、社群互動、新聞、驗證碼、純狀態通知或不需要建立提醒/行程/待辦時使用。',parameters:{type:'object',additionalProperties:false,properties:{...common},required:['confidence','reason']}},
  {type:'function',name:'suggest_replies',strict:true,description:'輔助工具。當來源是聊天/訊息，而且對方正在詢問、邀約或需要回覆時，可在主要動作之外額外呼叫一次，產生 1 到 3 個自然、簡短的繁體中文回覆。App 只顯示按鈕，絕不自動送出。',parameters:{type:'object',additionalProperties:false,properties:{replies:{type:'array',minItems:1,maxItems:3,items:{type:'string',minLength:1,maxLength:40}}},required:['replies']}}
] as const;

function validIso(value:unknown):value is string{
  if(typeof value!=='string')return false;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!m||!Number.isFinite(Date.parse(value)))return false;
  const [y,mo,d,h,mi,se]=m.slice(1,7).map(x=>Number(x||0));
  const day=new Date(Date.UTC(y,mo-1,d));
  return day.getUTCFullYear()===y&&day.getUTCMonth()===mo-1&&day.getUTCDate()===d&&h<24&&mi<60&&se<60;
}
function category(v:unknown):Category{return categories.includes(String(v))?String(v) as Category:'生活';}
function cleanChecklist(v:unknown){return Array.isArray(v)?v.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,160)).filter(Boolean).slice(0,8):[];}
function cleanReplies(v:unknown){return Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).map(x=>x.slice(0,40)))].slice(0,3):[];}
function confidence(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}
function importance(v:unknown):Importance{return v==='urgent'?'urgent':v==='important'?'important':'normal';}

export function parseAiToolCall(call:{name?:unknown;arguments?:unknown},existingIds=new Set<string>()):AiDecision{
  if(typeof call.name!=='string'||typeof call.arguments!=='string')throw new Error('AI 沒有回傳可執行的工具。');
  let a:any;try{a=JSON.parse(call.arguments);if(!a||typeof a!=='object'||Array.isArray(a))throw new Error()}catch{throw new Error('AI 工具參數格式錯誤。')}
  const reason=String(a.reason??'').slice(0,240),conf=confidence(a.confidence),replySuggestions:string[]=[];
  for(const field of ['start_at','end_at','due_at','proposed_at'])if(a[field]!==null&&a[field]!==undefined&&!validIso(a[field]))throw new Error('AI 提供的日期或時區格式不正確，請確認。');
  if(call.name==='ignore_notification')return {type:'ignore_notification',confidence:conf,reason};
  if(call.name==='create_calendar_event'){
    if(!validIso(a.start_at))throw new Error('AI 沒有提供有效的行程時間。');
    if(a.end_at!==null&&a.end_at!==undefined&&(!validIso(a.end_at)||Date.parse(a.end_at)<=Date.parse(a.start_at)))throw new Error('AI 提供的結束時間不正確，請確認。');
    return {type:'create_calendar_event',title:String(a.title??'').trim().slice(0,100)||'未命名行程',startAt:new Date(a.start_at).toISOString(),endAt:validIso(a.end_at)?new Date(a.end_at).toISOString():null,allDay:!!a.all_day,location:typeof a.location==='string'&&a.location.trim()?a.location.trim().slice(0,200):null,reminderMinutes:Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)),category:category(a.category),checklist:cleanChecklist(a.checklist),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  }
  if(call.name==='create_task'){
    const dueAt=validIso(a.due_at)?new Date(a.due_at).toISOString():null;
    return {type:'create_task',title:String(a.title??'').trim().slice(0,100)||'未命名待辦',dueAt,reminderMinutes:dueAt&&a.reminder_minutes!==null?Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)):null,category:category(a.category),checklist:cleanChecklist(a.checklist),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  }
  if(call.name==='ask_user')return {type:'ask_user',title:String(a.title??'').trim().slice(0,100)||'需要確認的通知',proposedAt:validIso(a.proposed_at)?new Date(a.proposed_at).toISOString():null,question:String(a.question??'').trim().slice(0,200)||'請確認這則通知。',category:category(a.category),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  if(call.name==='update_existing_event'){
    const eventId=String(a.event_id??'');if(!existingIds.has(eventId))throw new Error('AI 指定了不存在的既有行程。');
    return {type:'update_existing_event',eventId,title:typeof a.title==='string'&&a.title.trim()?a.title.trim().slice(0,100):null,startAt:validIso(a.start_at)?new Date(a.start_at).toISOString():null,endAt:validIso(a.end_at)?new Date(a.end_at).toISOString():null,location:typeof a.location==='string'&&a.location.trim()?a.location.trim().slice(0,200):null,reminderMinutes:a.reminder_minutes===null?null:Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  }
  if(call.name==='cancel_existing_event'){
    const eventId=String(a.event_id??'');if(!existingIds.has(eventId))throw new Error('AI 指定了不存在的既有行程。');
    return {type:'cancel_existing_event',eventId,importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  }
  if(call.name==='complete_existing_task'){
    const eventId=String(a.event_id??'');if(!existingIds.has(eventId))throw new Error('AI 指定了不存在的既有待辦。');
    return {type:'complete_existing_task',eventId,confidence:conf,reason,replySuggestions};
  }
  throw new Error(`AI 回傳未知工具：${call.name}`);
}

export function parseAiToolCalls(calls:{name?:unknown;arguments?:unknown}[],existingIds=new Set<string>()):AiDecision{
  const primaries=calls.filter(c=>c.name!=='suggest_replies');
  if(primaries.length!==1)throw new Error('AI 沒有選出唯一的主要處理動作。');
  const primary=parseAiToolCall(primaries[0],existingIds);
  if(primary.type==='ignore_notification')return primary;
  const replyCall=calls.find(c=>c.name==='suggest_replies');
  if(!replyCall||typeof replyCall.arguments!=='string')return primary;
  let parsed:any;try{parsed=JSON.parse(replyCall.arguments)}catch{return primary}
  return {...primary,replySuggestions:cleanReplies(parsed.replies)};
}

function applyResolvedLocation(decision:AiDecision,links:SharedLinkInfo[]):AiDecision{
  if(decision.type!=='create_calendar_event'&&decision.type!=='update_existing_event')return decision;
  const map=links.find(x=>x.type==='google_maps');
  if(!map)return decision;
  const current=decision.location;
  const shouldReplace=!current||isGoogleMapsUrl(current);
  if(!shouldReplace)return decision;
  return {...decision,location:(map.placeName??map.originalUrl).slice(0,200)};
}

async function requestDecision(apiKey:string,model:AiModel,input:any,existing:Notice[]):Promise<AiDecision>{
  const recent=existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null,is_todo:!n.dueAt}));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  let response:Response,json:any;
  try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},signal:controller.signal,body:JSON.stringify({
    model,store:false,reasoning:{effort:'low'},max_output_tokens:900,parallel_tool_calls:true,tool_choice:'required',tools,
    instructions:'你是生活通知管家的通知助理。每次分析必須呼叫剛好一個主要動作工具：create_calendar_event、create_task、update_existing_event、cancel_existing_event、complete_existing_task、ask_user、ignore_notification 其中之一。如果來源是聊天且值得回覆，可以另外再呼叫 suggest_replies 一次；suggest_replies 永遠只是建議，App 不會自動送出。\n\n【多則訊息上下文】notification_text 可能不是單一訊息，而是同一 App、同一聊天室最近約 15 分鐘內最多 8 段訊息，格式可能包含「[12 秒前] ...」或「姓名：內容」。請依出現順序把所有分段訊息合成同一段對話；一則可能只說活動、下一則只說地點、最後一則才說時間，例如「今天吃好吃的」「在星月廣場」「我們訂20：15」應合成今天 20:15 在星月廣場吃飯。Android 若有提供對話歷史，內容可能同時包含雙方訊息，可共同用來判斷是否已達成約定。不要把每一行建立成獨立事件。重複句子只是通知更新；同一件事出現不同時間時，優先採用對話中最後提出或最後確認的版本。若已有一筆 existing_upcoming_events 與同一約定相符，後續補充時間、地點或改期時優先 update_existing_event。\n\n【時間推理】received_at 與 device_timezone 是可靠基準。相對日期必須換算。若訊息在凌晨 02:47 收到並說「晚上10.開會」，22:00 尚未發生，直接建立同一天 22:00，不要問是不是今天。「明天十點」就是隔天 10:00。「10.要吃飯嗎」在日期/邀約語境可理解為 10 點。只有「晚上8.30要吃飯嗎」且當天 20:30 尚未發生時，也應理解為收到當天 20:30。若只有時段沒有精確鐘點，早上/上午用 09:00，中午用 12:00，下午用 15:00，晚上/晚間/今晚/明晚用 19:00，並在 reason 說明。只有時刻已明顯過去、上下文仍有多個未定案時間，或真的有兩個合理日期時才 ask_user。\n\n【聊天邀約與地點】resolved_links 是 App 在送給 AI 前對 Google Maps 短網址做的解析結果。若 resolved_links 中 place_name 有值，優先把該店名/地點名放進 location；原始網址會由 App 另外保存並提供可點擊的 Google Maps 按鈕，不要把網址混進標題。聊天中的問句邀約，只要時間與活動足夠明確就可建立行程並另外 suggest_replies。\n\n【廣告與垃圾訊息】促銷、折扣、優惠券、新品、購物倒數、會員活動、新聞、社群按讚/追蹤、遊戲獎勵、驗證碼與系統狀態必須使用 ignore_notification，不能因為有日期、截止、立即購買或領取等詞就建立待辦。只有內容明確針對收件者已存在的訂單、帳單、預約、訂位、掛號、航班、包裹、報名或付款義務時才建立。\n\n【Gmail 郵件】Gmail 必須比聊天來源更保守。日期、金額、合約到期日、新聞/公告中的活動日期，都不等於使用者的個人行程。多封新郵件/摘要通知、全校公告、校務公告、電子報、服務公告、軟體授權或產品到期資訊，原則上使用 ignore_notification。只有郵件清楚直接要求收件者本人完成動作，或有明確的個人會議、預約或行程，才 create_task/create_calendar_event。\n\n【其他動作】沒有期限但動作明確的事情用 create_task 且 due_at=null。取消既有事件用 cancel_existing_event；完成通知用 complete_existing_task；更改時間/地點用 update_existing_event。一般聊天用 ignore_notification。只有錯誤建立風險真的高時才 ask_user。',input
  })});json=await response.json();}catch(error){if(controller.signal.aborted)throw new Error('AI 分析逾時，稍後會再試。');if(error instanceof TypeError)throw new Error('AI 暫時無法連線，稍後會再試。');throw error}finally{clearTimeout(timer)}
  if(!response.ok){throw new Error(response.status===401?'API key 無效或已撤銷，請到設定更換。':response.status===429?'API 額度不足或請求太頻繁，請檢查帳戶後再試。':response.status===403||response.status===404?'此金鑰無法使用指定模型，請檢查模型權限。':`AI 服務暫時失敗（${response.status}），通知已保留。`)}
  const calls=(Array.isArray(json.output)?json.output:[]).filter((x:any)=>x?.type==='function_call');
  return parseAiToolCalls(calls,new Set(recent.map(x=>x.id)));
}

export async function analyzeNotificationWithAI(args:AnalyzeArgs):Promise<AiDecision>{
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei';
  const recent=args.existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null,is_todo:!n.dueAt}));
  const resolvedLinks=await resolveGoogleMapsLinks(`${args.title}\n${args.text}`);
  const payload={source_app:args.appName,conversation_title:args.title,notification_text:args.text,received_at:new Date(args.receivedAt).toISOString(),device_timezone:timezone,resolved_links:resolvedLinks.map(x=>({type:x.type,original_url:x.originalUrl,resolved_url:x.resolvedUrl,place_name:x.placeName})),existing_upcoming_events:recent};
  const raw=await requestDecision(args.apiKey,args.model,`請分析以下手機通知／最近對話 JSON：\n${JSON.stringify(payload)}`,args.existing);
  return applyResolvedLocation(raw,resolvedLinks);
}

export async function analyzeScreenshotWithAI(args:{apiKey:string;model:AiModel;base64:string;mimeType:string;receivedAt:number;existing:Notice[]}):Promise<AiDecision>{
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei';
  const recent=args.existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null,is_todo:!n.dueAt}));
  const context=`這是一張由使用者手動選取的通知/聊天截圖。請直接閱讀圖片，不要依賴 OCR。received_at=${new Date(args.receivedAt).toISOString()}，device_timezone=${timezone}。既有行程 JSON=${JSON.stringify(recent)}`;
  const input=[{role:'user',content:[{type:'input_text',text:context},{type:'input_image',image_url:`data:${args.mimeType};base64,${args.base64}`,detail:'high'}]}];
  return requestDecision(args.apiKey,args.model,input,args.existing);
}
