import type {Category, Importance, Notice} from './domain';

export const AI_MODELS = [
  ['gpt-5.6-luna','GPT-5.6 Luna'],
] as const;
export type AiModel = typeof AI_MODELS[number][0];

type Replyable={replySuggestions:string[]};
export type AiDecision =
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
  {type:'function',name:'create_calendar_event',strict:true,description:'通知或聊天明確描述某個時間會發生的活動、邀約、會議、課程、比賽、預約、看診、出發、訂位等事件。時間可由 received_at 與可靠相對時間推得。',parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:100},start_at:{type:'string',description:'ISO 8601 日期時間。依原文與 received_at/device_timezone 推得；不可憑空猜。'},end_at:{type:['string','null'],description:'ISO 8601 結束時間；未知則 null。'},all_day:{type:'boolean'},location:{type:['string','null'],maxLength:500},reminder_minutes:{type:'integer',minimum:0,maximum:10080},category:{type:'string',enum:categories},checklist:{type:'array',items:{type:'string',maxLength:160},maxItems:8},importance:importanceProperty,...common},required:['title','start_at','end_at','all_day','location','reminder_minutes','category','checklist','importance','confidence','reason']}},
  {type:'function',name:'create_task',strict:true,description:'通知描述使用者要完成、填寫、回覆、準備、購買、繳交、繳費、領取等待辦時使用。沒有期限完全可以建立 Todo。',parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:100},due_at:{type:['string','null'],description:'ISO 8601 截止時間；內容沒有明確期限就必須填 null。'},reminder_minutes:{type:['integer','null'],minimum:0,maximum:10080,description:'無期限 Todo 必須填 null。'},category:{type:'string',enum:categories},checklist:{type:'array',items:{type:'string',maxLength:160},maxItems:8},importance:importanceProperty,...common},required:['title','due_at','reminder_minutes','category','checklist','importance','confidence','reason']}},
  {type:'function',name:'update_existing_event',strict:true,description:'新通知明確是在更正、延期、提前、補地點、換地點或更新既有行程/待辦時使用。event_id 必須來自 existing_upcoming_events。',parameters:{type:'object',additionalProperties:false,properties:{event_id:{type:'string'},title:{type:['string','null'],maxLength:100},start_at:{type:['string','null']},end_at:{type:['string','null']},location:{type:['string','null'],maxLength:500},reminder_minutes:{type:['integer','null'],minimum:0,maximum:10080},importance:importanceProperty,...common},required:['event_id','title','start_at','end_at','location','reminder_minutes','importance','confidence','reason']}},
  {type:'function',name:'cancel_existing_event',strict:true,description:'通知明確表示 existing_upcoming_events 中某個行程已取消、不用去、不舉行時使用。不要另外建立一個「取消」行程。',parameters:{type:'object',additionalProperties:false,properties:{event_id:{type:'string'},importance:importanceProperty,...common},required:['event_id','importance','confidence','reason']}},
  {type:'function',name:'complete_existing_task',strict:true,description:'通知明確證明 existing_upcoming_events 中某個待辦已完成，例如已繳費、已提交、已領取。只有有清楚對應時使用。',parameters:{type:'object',additionalProperties:false,properties:{event_id:{type:'string'},...common},required:['event_id','confidence','reason']}},
  {type:'function',name:'ask_user',strict:true,description:'只有存在兩個以上合理解讀，而且錯選會造成錯誤行程時才使用。不要為了確認已能從 received_at 推得的今天/今晚/明天日期而詢問；不要只因為缺少精確鐘點就詢問。',parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:100},proposed_at:{type:['string','null']},question:{type:'string',maxLength:220},category:{type:'string',enum:categories},importance:importanceProperty,...common},required:['title','proposed_at','question','category','importance','confidence','reason']}},
  {type:'function',name:'ignore_notification',strict:true,description:'一般聊天、貼圖、廣告、社群互動、新聞、驗證碼、純狀態通知或不需要建立提醒/行程/待辦時使用。',parameters:{type:'object',additionalProperties:false,properties:{...common},required:['confidence','reason']}},
  {type:'function',name:'suggest_replies',strict:true,description:'輔助工具。當來源是聊天/訊息，而且對方正在詢問、邀約或需要回覆時，可在主要動作之外額外呼叫一次，產生 1 到 3 個自然、簡短的繁體中文回覆。App 只顯示按鈕，絕不自動送出。',parameters:{type:'object',additionalProperties:false,properties:{replies:{type:'array',minItems:1,maxItems:3,items:{type:'string',minLength:1,maxLength:40}}},required:['replies']}}
] as const;

function validIso(value:unknown):value is string{return typeof value==='string'&&Number.isFinite(Date.parse(value));}
function category(v:unknown):Category{return categories.includes(String(v))?String(v) as Category:'生活';}
function cleanChecklist(v:unknown){return Array.isArray(v)?v.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).slice(0,8):[];}
function cleanReplies(v:unknown){return Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).map(x=>x.slice(0,40)))].slice(0,3):[];}
function confidence(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}
function importance(v:unknown):Importance{return v==='urgent'?'urgent':v==='important'?'important':'normal';}

export function parseAiToolCall(call:{name?:unknown;arguments?:unknown}, existingIds=new Set<string>()):AiDecision{
  if(typeof call.name!=='string'||typeof call.arguments!=='string')throw new Error('AI 沒有回傳可執行的工具。');
  let a:any;try{a=JSON.parse(call.arguments)}catch{throw new Error('AI 工具參數格式錯誤。')}
  const reason=String(a.reason??'').slice(0,240),conf=confidence(a.confidence),replySuggestions:string[]=[];
  if(call.name==='ignore_notification')return {type:'ignore_notification',confidence:conf,reason};
  if(call.name==='create_calendar_event'){
    if(!validIso(a.start_at))throw new Error('AI 沒有提供有效的行程時間。');
    return {type:'create_calendar_event',title:String(a.title??'').trim().slice(0,100)||'未命名行程',startAt:new Date(a.start_at).toISOString(),endAt:validIso(a.end_at)?new Date(a.end_at).toISOString():null,allDay:!!a.all_day,location:typeof a.location==='string'&&a.location.trim()?a.location.trim().slice(0,500):null,reminderMinutes:Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)),category:category(a.category),checklist:cleanChecklist(a.checklist),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  }
  if(call.name==='create_task'){
    const dueAt=validIso(a.due_at)?new Date(a.due_at).toISOString():null;
    return {type:'create_task',title:String(a.title??'').trim().slice(0,100)||'未命名待辦',dueAt,reminderMinutes:dueAt&&a.reminder_minutes!==null?Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)):null,category:category(a.category),checklist:cleanChecklist(a.checklist),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  }
  if(call.name==='ask_user')return {type:'ask_user',title:String(a.title??'').trim().slice(0,100)||'需要確認的通知',proposedAt:validIso(a.proposed_at)?new Date(a.proposed_at).toISOString():null,question:String(a.question??'請確認這則通知。').slice(0,220),category:category(a.category),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
  if(call.name==='update_existing_event'){
    const eventId=String(a.event_id??'');if(!existingIds.has(eventId))throw new Error('AI 指定了不存在的既有行程。');
    return {type:'update_existing_event',eventId,title:typeof a.title==='string'&&a.title.trim()?a.title.trim().slice(0,100):null,startAt:validIso(a.start_at)?new Date(a.start_at).toISOString():null,endAt:validIso(a.end_at)?new Date(a.end_at).toISOString():null,location:typeof a.location==='string'&&a.location.trim()?a.location.trim().slice(0,500):null,reminderMinutes:a.reminder_minutes===null?null:Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)),importance:importance(a.importance),confidence:conf,reason,replySuggestions};
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

function promoteNeedlessConfirmation(decision:AiDecision,text:string,receivedAt:number):AiDecision{
  if(decision.type!=='ask_user'||!decision.proposedAt)return decision;
  const at=Date.parse(decision.proposedAt);
  if(!Number.isFinite(at)||at<receivedAt-15*60*1000||at>receivedAt+36*60*60*1000)return decision;
  const cueCount=(text.match(/今天|今晚|明天|明晚|後天|大後天|上午|早上|中午|下午|晚上|晚間|凌晨/g)??[]).length;
  const appointment=/開會|會議|上課|考試|面試|吃飯|早餐|午餐|晚餐|宵夜|聚餐|見面|碰面|咖啡|電影|打球|練球|集合|看診|回診|預約|訂位|吃這家|去這家/.test(text);
  if(cueCount>3||!appointment)return decision;
  const title=/開會|會議/.test(text)?'開會':/早餐/.test(text)?'吃早餐':/午餐/.test(text)?'吃午餐':/晚餐|吃這家/.test(text)?'吃晚餐':/吃飯|聚餐/.test(text)?'吃飯':/見面|碰面/.test(text)?'見面':/打球|練球/.test(text)?'打球':decision.title.replace(/^確認\s*/,'').replace(/日期|時間/g,'').trim()||'行程';
  const map=text.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.[^/]+\/maps|maps\.google\.)\/[^\s]+/i)?.[0]??null;
  return {type:'create_calendar_event',title,startAt:new Date(at).toISOString(),endAt:null,allDay:false,location:map,reminderMinutes:60,category:'活動',checklist:[],importance:decision.importance,confidence:Math.max(0.86,decision.confidence),reason:'時間可由對話上下文與收到通知的時間安全推得，不需要再次確認。',replySuggestions:decision.replySuggestions};
}

async function requestDecision(apiKey:string,model:AiModel,input:any,existing:Notice[]):Promise<AiDecision>{
  const recent=existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null,is_todo:!n.dueAt}));
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({
    model,store:false,reasoning:{effort:'low'},max_output_tokens:900,parallel_tool_calls:true,tool_choice:'required',tools,
    instructions:'你是生活通知管家的通知助理。每次分析必須呼叫剛好一個主要動作工具：create_calendar_event、create_task、update_existing_event、cancel_existing_event、complete_existing_task、ask_user、ignore_notification 其中之一。如果來源是聊天且值得回覆，可以另外再呼叫 suggest_replies 一次；suggest_replies 永遠只是建議，App 不會自動送出。\n\n【多則訊息上下文】notification_text 可能不是單一訊息，而是同一 App、同一聊天室最近約 15 分鐘內最多 8 段訊息，格式可能包含「[12 秒前] ...」。請把它們依時間當作同一段對話理解，允許一則提供日期、一則提供時間、下一則只提供地點或 Google Maps 連結。不要把每一行當成獨立事件。重複出現的相同句子只是通知更新，不代表多個事件。若已有一筆 existing_upcoming_events 與這段對話的同一約定明顯相符，而後續只是補充時間/地點/連結或改期，優先 update_existing_event，不要 create 第二筆。\n\n【時間推理】received_at 與 device_timezone 是可靠基準。相對日期必須換算。若訊息在凌晨 02:47 收到並說「晚上10.開會」，22:00 尚未發生，直接建立同一天 22:00，不要問是不是今天。「明天十點」就是隔天 10:00。「10.要吃飯嗎」在日期/邀約語境可理解為 10 點。若只有時段沒有精確鐘點，也不要因此 ask_user：為了月曆放置，早上/上午用 09:00，中午用 12:00，下午用 15:00，晚上/晚間/今晚/明晚用 19:00，並在 reason 說明為時段預設。只有時刻已明顯過去、上下文出現互相衝突的日期時間且無法判定最後版本、或真的有兩個合理日期時才 ask_user。\n\n【聊天邀約與地點】「明天晚上吃這家喔」加下一則 https://maps.app.goo.gl/... 是成立的約定：建立明天晚上的吃飯行程。若地圖連結附近有店名就用店名作 location；只有 URL 時，location 至少保留完整 Google Maps URL，不可因為只有網址而忽略。標題要像真正行事曆，例如「和陳亭霓吃晚餐」「開會」，不要寫「確認日期」「收到通知」。聊天中的問句邀約，只要時間與活動足夠明確就可建立行程並另外 suggest_replies。\n\n【其他動作】沒有期限但動作明確的事情用 create_task 且 due_at=null。取消既有事件用 cancel_existing_event，不新增「取消」行程；完成通知用 complete_existing_task；更改時間/地點用 update_existing_event。一般聊天、貼圖、廣告、社群互動、新聞、驗證碼、系統狀態等用 ignore_notification。只有錯誤建立風險真的高時才 ask_user。',input
  })});
  const json:any=await response.json().catch(()=>({}));
  if(!response.ok){const msg=json?.error?.message||`HTTP ${response.status}`;throw new Error(`OpenAI API 失敗：${msg}`)}
  const calls=(Array.isArray(json.output)?json.output:[]).filter((x:any)=>x?.type==='function_call');
  return parseAiToolCalls(calls,new Set(recent.map(x=>x.id)));
}

export async function analyzeNotificationWithAI(args:AnalyzeArgs):Promise<AiDecision>{
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei';
  const recent=args.existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null,is_todo:!n.dueAt}));
  const payload={source_app:args.appName,conversation_title:args.title,notification_text:args.text,received_at:new Date(args.receivedAt).toISOString(),device_timezone:timezone,existing_upcoming_events:recent};
  const decision=await requestDecision(args.apiKey,args.model,`請分析以下手機通知／最近對話 JSON：\n${JSON.stringify(payload)}`,args.existing);
  return promoteNeedlessConfirmation(decision,args.text,args.receivedAt);
}

export async function analyzeScreenshotWithAI(args:{apiKey:string;model:AiModel;base64:string;mimeType:string;receivedAt:number;existing:Notice[]}):Promise<AiDecision>{
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei';
  const recent=args.existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null,is_todo:!n.dueAt}));
  const context=`這是一張由使用者手動選取的通知/聊天截圖。請直接閱讀圖片，不要依賴 OCR。received_at=${new Date(args.receivedAt).toISOString()}，device_timezone=${timezone}。既有行程 JSON=${JSON.stringify(recent)}`;
  const input=[{role:'user',content:[{type:'input_text',text:context},{type:'input_image',image_url:`data:${args.mimeType};base64,${args.base64}`,detail:'high'}]}];
  return requestDecision(args.apiKey,args.model,input,args.existing);
}