import type {Category, Importance, Notice} from './domain';
import {isGoogleMapsUrl,resolveGoogleMapsLinks,type SharedLinkInfo} from './links.ts';

export const AI_MODELS=[['gpt-5.6-luna','GPT-5.6 Luna']] as const;
export type AiModel=typeof AI_MODELS[number][0];

type Replyable={replySuggestions:string[]};
export type AiDecision=
  | ({type:'create_calendar_event';title:string;startAt:string;endAt:string|null;allDay:boolean;location:string|null;reminderMinutes:number;category:Category;checklist:string[];importance:Importance;confidence:number;reason:string}&Replyable)
  | ({type:'update_existing_event';eventId:string;title:string|null;startAt:string|null;endAt:string|null;location:string|null;reminderMinutes:number|null;importance:Importance;confidence:number;reason:string}&Replyable)
  | ({type:'cancel_existing_event';eventId:string;importance:Importance;confidence:number;reason:string}&Replyable)
  | ({type:'ask_user';title:string;proposedAt:string|null;question:string;category:Category;importance:Importance;confidence:number;reason:string}&Replyable)
  | {type:'ignore_notification';confidence:number;reason:string};

type AnalyzeArgs={apiKey:string;model:AiModel;appName:string;title:string;text:string;receivedAt:number;existing:Notice[]};
const categories=['生活','學校','帳單','取件','活動'];
const importanceProperty={type:'string',enum:['normal','important','urgent'],description:'normal=一般但值得記錄；important=需要主動提醒；urgent=取消、改期、即將截止或其他應立刻注意的事項。低價值聊天應使用 ignore_notification。'};
const common={confidence:{type:'number',minimum:0,maximum:1,description:'0 到 1，代表你對這個動作的信心。'},reason:{type:'string',maxLength:240,description:'用繁體中文簡短說明為何選這個動作。'}};
const EVENT_ONLY_INSTRUCTIONS=`你是生活通知管家的行程辨識助理。本 App 只收錄會出現在行事曆上的個人行程，不建立待辦、購物提醒、繳費提醒或一般任務。每次必須呼叫剛好一個主要工具：create_calendar_event、update_existing_event、cancel_existing_event、ask_user、ignore_notification。來源是聊天且值得回覆時，可另外呼叫 suggest_replies；它只提供建議，不會自動送出。

【建立門檻】只有內容能回答「使用者在何時要參加或發生什麼事」才建立行程，例如已約定的聚餐、會議、課程、考試、面試、看診、航班、入住、活動、訂位。必須有可由原文明確換算的日期；精確時間未知時才可建立全天行程。只有截止期限、付款日、取件期限、繳交日期、購買提醒或沒有日期的動作都使用 ignore_notification。

【多則訊息】notification_text 可能包含同一聊天室最近約 15 分鐘內最多 8 段訊息。依順序合併上下文；例如「今天吃好吃的」「在星月廣場」「我們訂20：15」合成今天 20:15 的聚餐。重複句只是通知更新，不可建立多筆。同一件事最後出現的新時間優先；若與 existing_upcoming_events 相符，使用 update_existing_event。

【時間基準】received_at 與 device_timezone 是可靠基準，今天、今晚、明天、明晚等相對日期必須換算。像「999 秒前」「2 分鐘前」是通知相對時間標記，絕對不是行程時間。只有時段時：早上 09:00、中午 12:00、下午 15:00、晚上 19:00，並在 reason 說明。真正有兩個合理行程時間才 ask_user，且 proposed_at 必須提供最合理候選；沒有合理候選就忽略。

【廣告與任務】促銷、折扣、優惠券、新品、購物方案、會員活動、購物倒數、立即購買、請備註姓名、填表、回覆、繳費、付款、領取、取件、截止日、新聞、公告、社群互動、遊戲獎勵、驗證碼與系統狀態一律 ignore_notification。文字含日期、倒數或「記得」也不能因此建立行程。只有已成立的個人預約、訂位、掛號、航班、會議邀請或活動報名，而且原文提供發生日期，才可能建立。

【郵件】Gmail、電子報與公告要更保守。活動宣傳日期、帳單日期、合約到期日、全校公告和服務公告都不是個人行程。只有清楚屬於收件者本人的已成立會議、預約、面試、課程、考試或旅行行程才建立。`;
const tools=[
  {type:'function',name:'create_calendar_event',strict:true,description:'通知或聊天明確描述某個時間會發生的活動、邀約、會議、課程、比賽、預約、看診、出發、訂位等事件。時間可由 received_at 與可靠相對時間推得。',parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:100},start_at:{type:'string',description:'ISO 8601 日期時間。依原文與 received_at/device_timezone 推得；不可憑空猜。'},end_at:{type:['string','null'],description:'ISO 8601 結束時間；未知則 null。'},all_day:{type:'boolean'},location:{type:['string','null'],maxLength:200},reminder_minutes:{type:'integer',minimum:0,maximum:10080},category:{type:'string',enum:categories},checklist:{type:'array',items:{type:'string',maxLength:160},maxItems:8},importance:importanceProperty,...common},required:['title','start_at','end_at','all_day','location','reminder_minutes','category','checklist','importance','confidence','reason']}},
  {type:'function',name:'update_existing_event',strict:true,description:'新通知明確是在更正、延期、提前、補地點、換地點或更新既有行程時使用。event_id 必須來自 existing_upcoming_events。未變更的欄位填 null；null 表示保留原值。',parameters:{type:'object',additionalProperties:false,properties:{event_id:{type:'string'},title:{type:['string','null'],maxLength:100},start_at:{type:['string','null']},end_at:{type:['string','null']},location:{type:['string','null'],maxLength:200},reminder_minutes:{type:['integer','null'],minimum:0,maximum:10080},importance:importanceProperty,...common},required:['event_id','title','start_at','end_at','location','reminder_minutes','importance','confidence','reason']}},
  {type:'function',name:'cancel_existing_event',strict:true,description:'通知明確表示 existing_upcoming_events 中某個行程已取消、不用去、不舉行時使用。不要另外建立一個「取消」行程。',parameters:{type:'object',additionalProperties:false,properties:{event_id:{type:'string'},importance:importanceProperty,...common},required:['event_id','importance','confidence','reason']}},
  {type:'function',name:'ask_user',strict:true,description:'內容明確是在約時間或描述行程，但存在兩個以上合理日期／時間，而且錯選會造成錯誤行程時使用。proposed_at 必須放最合理的一個候選時間；沒有任何合理行程時間就使用 ignore_notification。',parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:100},proposed_at:{type:['string','null']},question:{type:'string',maxLength:200},category:{type:'string',enum:categories},importance:importanceProperty,...common},required:['title','proposed_at','question','category','importance','confidence','reason']}},
  {type:'function',name:'ignore_notification',strict:true,description:'沒有明確個人行程日期／時間的一般聊天、任務、繳費、取件、購物、廣告、社群互動、新聞、驗證碼或系統狀態一律使用。',parameters:{type:'object',additionalProperties:false,properties:{...common},required:['confidence','reason']}},
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
  if(call.name==='ask_user')return {type:'ask_user',title:String(a.title??'').trim().slice(0,100)||'需要確認的通知',proposedAt:validIso(a.proposed_at)?new Date(a.proposed_at).toISOString():null,question:String(a.question??'').trim().slice(0,200)||'請確認這則通知。',category:category(a.category),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  if(call.name==='update_existing_event'){
    const eventId=String(a.event_id??'');if(!existingIds.has(eventId))throw new Error('AI 指定了不存在的既有行程。');
    return {type:'update_existing_event',eventId,title:typeof a.title==='string'&&a.title.trim()?a.title.trim().slice(0,100):null,startAt:validIso(a.start_at)?new Date(a.start_at).toISOString():null,endAt:validIso(a.end_at)?new Date(a.end_at).toISOString():null,location:typeof a.location==='string'&&a.location.trim()?a.location.trim().slice(0,200):null,reminderMinutes:a.reminder_minutes===null?null:Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  }
  if(call.name==='cancel_existing_event'){
    const eventId=String(a.event_id??'');if(!existingIds.has(eventId))throw new Error('AI 指定了不存在的既有行程。');
    return {type:'cancel_existing_event',eventId,importance:importance(a.importance),confidence:conf,reason,replySuggestions};
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
  const recent=existing.filter(n=>!n.done&&n.dueAt).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null}));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  let response:Response,json:any;
  try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},signal:controller.signal,body:JSON.stringify({
    model,store:false,reasoning:{effort:'low'},max_output_tokens:900,parallel_tool_calls:true,tool_choice:'required',tools,
    instructions:EVENT_ONLY_INSTRUCTIONS,input
  })});json=await response.json();}catch(error){if(controller.signal.aborted)throw new Error('AI 分析逾時，稍後會再試。');if(error instanceof TypeError)throw new Error('AI 暫時無法連線，稍後會再試。');throw error}finally{clearTimeout(timer)}
  if(!response.ok){throw new Error(response.status===401?'API key 無效或已撤銷，請到設定更換。':response.status===429?'API 額度不足或請求太頻繁，請檢查帳戶後再試。':response.status===403||response.status===404?'此金鑰無法使用指定模型，請檢查模型權限。':`AI 服務暫時失敗（${response.status}），通知已保留。`)}
  const calls=(Array.isArray(json.output)?json.output:[]).filter((x:any)=>x?.type==='function_call');
  return parseAiToolCalls(calls,new Set(recent.map(x=>x.id)));
}

export async function analyzeNotificationWithAI(args:AnalyzeArgs):Promise<AiDecision>{
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei';
  const recent=args.existing.filter(n=>!n.done&&n.dueAt).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null}));
  const resolvedLinks=await resolveGoogleMapsLinks(`${args.title}\n${args.text}`);
  const payload={source_app:args.appName,conversation_title:args.title,notification_text:args.text,received_at:new Date(args.receivedAt).toISOString(),device_timezone:timezone,resolved_links:resolvedLinks.map(x=>({type:x.type,original_url:x.originalUrl,resolved_url:x.resolvedUrl,place_name:x.placeName})),existing_upcoming_events:recent};
  const raw=await requestDecision(args.apiKey,args.model,`請分析以下手機通知／最近對話 JSON：\n${JSON.stringify(payload)}`,args.existing);
  return applyResolvedLocation(raw,resolvedLinks);
}

export async function analyzeScreenshotWithAI(args:{apiKey:string;model:AiModel;base64:string;mimeType:string;receivedAt:number;existing:Notice[]}):Promise<AiDecision>{
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei';
  const recent=args.existing.filter(n=>!n.done&&n.dueAt).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null}));
  const context=`這是一張由使用者手動選取的通知/聊天截圖。請直接閱讀圖片，不要依賴 OCR。received_at=${new Date(args.receivedAt).toISOString()}，device_timezone=${timezone}。既有行程 JSON=${JSON.stringify(recent)}`;
  const input=[{role:'user',content:[{type:'input_text',text:context},{type:'input_image',image_url:`data:${args.mimeType};base64,${args.base64}`,detail:'high'}]}];
  return requestDecision(args.apiKey,args.model,input,args.existing);
}
