import type {Category, Importance, Notice} from './domain';

export const AI_MODELS = [
  ['gpt-5.6-luna','省錢 · GPT-5.6 Luna'],
  ['gpt-5.6-terra','推薦 · GPT-5.6 Terra'],
  ['gpt-5.6-sol','最準 · GPT-5.6 Sol'],
] as const;
export type AiModel = typeof AI_MODELS[number][0];

export type AiDecision =
  | {type:'create_calendar_event';title:string;startAt:string;endAt:string|null;allDay:boolean;location:string|null;reminderMinutes:number;category:Category;checklist:string[];importance:Importance;confidence:number;reason:string}
  | {type:'create_task';title:string;dueAt:string|null;reminderMinutes:number|null;category:Category;checklist:string[];importance:Importance;confidence:number;reason:string}
  | {type:'update_existing_event';eventId:string;title:string|null;startAt:string|null;endAt:string|null;location:string|null;reminderMinutes:number|null;importance:Importance;confidence:number;reason:string}
  | {type:'ask_user';title:string;proposedAt:string|null;question:string;category:Category;importance:Importance;confidence:number;reason:string}
  | {type:'ignore_notification';confidence:number;reason:string};

type AnalyzeArgs={
  apiKey:string;
  model:AiModel;
  appName:string;
  title:string;
  text:string;
  receivedAt:number;
  existing:Notice[];
};

const categories=['生活','學校','帳單','取件','活動'];
const importanceProperty={type:'string',enum:['normal','important','urgent'],description:'normal=一般但值得記錄；important=需要主動提醒；urgent=取消、改期、即將截止或其他應立刻注意的事項。低價值聊天應使用 ignore_notification。'};
const common={
  confidence:{type:'number',minimum:0,maximum:1,description:'0 到 1，代表你對這個動作的信心。'},
  reason:{type:'string',maxLength:240,description:'用繁體中文簡短說明為何選這個動作。'},
};
const tools=[
  {
    type:'function',name:'create_calendar_event',strict:true,
    description:'通知明確描述會在某個日期/時間發生的活動、會議、課程、比賽、預約、看診、出發、訂位等事件時使用。',
    parameters:{type:'object',additionalProperties:false,properties:{
      title:{type:'string',maxLength:100},
      start_at:{type:'string',description:'ISO 8601 日期時間，必須根據通知內容與收到通知時間推得；不得猜測。'},
      end_at:{type:['string','null'],description:'ISO 8601 結束時間；未知則 null。日期範圍事件可填。'},
      all_day:{type:'boolean'},
      location:{type:['string','null'],maxLength:200},
      reminder_minutes:{type:'integer',minimum:0,maximum:10080},
      category:{type:'string',enum:categories},
      checklist:{type:'array',items:{type:'string',maxLength:160},maxItems:8},
      importance:importanceProperty,
      ...common,
    },required:['title','start_at','end_at','all_day','location','reminder_minutes','category','checklist','importance','confidence','reason']}
  },
  {
    type:'function',name:'create_task',strict:true,
    description:'通知描述要完成、繳交、繳費、領取、回覆、準備等待辦/期限，而不是一個需要佔據行事曆時間區塊的活動時使用。',
    parameters:{type:'object',additionalProperties:false,properties:{
      title:{type:'string',maxLength:100},
      due_at:{type:['string','null'],description:'ISO 8601 截止時間；內容沒有可靠時間就 null，不要猜。'},
      reminder_minutes:{type:['integer','null'],minimum:0,maximum:10080},
      category:{type:'string',enum:categories},
      checklist:{type:'array',items:{type:'string',maxLength:160},maxItems:8},
      importance:importanceProperty,
      ...common,
    },required:['title','due_at','reminder_minutes','category','checklist','confidence','reason']}
  },
  {
    type:'function',name:'update_existing_event',strict:true,
    description:'通知明確是在更正、延期、提前、取消或更新既有行程時使用。event_id 必須來自提供的既有行程，不得自行捏造。',
    parameters:{type:'object',additionalProperties:false,properties:{
      event_id:{type:'string'},title:{type:['string','null'],maxLength:100},start_at:{type:['string','null']},end_at:{type:['string','null']},location:{type:['string','null'],maxLength:200},reminder_minutes:{type:['integer','null'],minimum:0,maximum:10080},importance:importanceProperty,...common,
    },required:['event_id','title','start_at','end_at','location','reminder_minutes','importance','confidence','reason']}
  },
  {
    type:'function',name:'ask_user',strict:true,
    description:'訊息很可能重要，但關鍵日期、時間、對象或意圖有歧義，直接建立行程有明顯風險時使用。',
    parameters:{type:'object',additionalProperties:false,properties:{
      title:{type:'string',maxLength:100},proposed_at:{type:['string','null']},question:{type:'string',maxLength:220},category:{type:'string',enum:categories},importance:importanceProperty,...common,
    },required:['title','proposed_at','question','category','importance','confidence','reason']}
  },
  {
    type:'function',name:'ignore_notification',strict:true,
    description:'一般聊天、廣告、社群互動、新聞、驗證碼、純狀態通知或不需要建立提醒/行程時使用。',
    parameters:{type:'object',additionalProperties:false,properties:{...common},required:['confidence','reason']}
  }
] as const;

function validIso(value:unknown):value is string{return typeof value==='string'&&Number.isFinite(Date.parse(value));}
function category(v:unknown):Category{return categories.includes(String(v))?String(v) as Category:'生活';}
function cleanChecklist(v:unknown){return Array.isArray(v)?v.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).slice(0,8):[];}
function confidence(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}
function importance(v:unknown):Importance{return v==='urgent'?'urgent':v==='important'?'important':'normal';}

export function parseAiToolCall(call:{name?:unknown;arguments?:unknown}, existingIds=new Set<string>()):AiDecision{
  if(typeof call.name!=='string'||typeof call.arguments!=='string')throw new Error('AI 沒有回傳可執行的工具。');
  let a:any;try{a=JSON.parse(call.arguments)}catch{throw new Error('AI 工具參數格式錯誤。')}
  const reason=String(a.reason??'').slice(0,240), conf=confidence(a.confidence);
  if(call.name==='ignore_notification')return {type:'ignore_notification',confidence:conf,reason};
  if(call.name==='create_calendar_event'){
    if(!validIso(a.start_at))throw new Error('AI 沒有提供有效的行程時間。');
    return {type:'create_calendar_event',title:String(a.title??'').trim().slice(0,100)||'未命名行程',startAt:new Date(a.start_at).toISOString(),endAt:validIso(a.end_at)?new Date(a.end_at).toISOString():null,allDay:!!a.all_day,location:typeof a.location==='string'&&a.location.trim()?a.location.trim().slice(0,200):null,reminderMinutes:Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)),category:category(a.category),checklist:cleanChecklist(a.checklist),importance:importance(a.importance),confidence:conf,reason};
  }
  if(call.name==='create_task')return {type:'create_task',title:String(a.title??'').trim().slice(0,100)||'未命名待辦',dueAt:validIso(a.due_at)?new Date(a.due_at).toISOString():null,reminderMinutes:a.reminder_minutes===null?null:Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)),category:category(a.category),checklist:cleanChecklist(a.checklist),importance:importance(a.importance),confidence:conf,reason};
  if(call.name==='ask_user')return {type:'ask_user',title:String(a.title??'').trim().slice(0,100)||'需要確認的通知',proposedAt:validIso(a.proposed_at)?new Date(a.proposed_at).toISOString():null,question:String(a.question??'請確認這則通知。').slice(0,220),category:category(a.category),importance:importance(a.importance),confidence:conf,reason};
  if(call.name==='update_existing_event'){
    const eventId=String(a.event_id??'');if(!existingIds.has(eventId))throw new Error('AI 指定了不存在的既有行程。');
    return {type:'update_existing_event',eventId,title:typeof a.title==='string'&&a.title.trim()?a.title.trim().slice(0,100):null,startAt:validIso(a.start_at)?new Date(a.start_at).toISOString():null,endAt:validIso(a.end_at)?new Date(a.end_at).toISOString():null,location:typeof a.location==='string'&&a.location.trim()?a.location.trim().slice(0,200):null,reminderMinutes:a.reminder_minutes===null?null:Math.max(0,Math.min(10080,Number(a.reminder_minutes)||0)),importance:importance(a.importance),confidence:conf,reason};
  }
  throw new Error(`AI 回傳未知工具：${call.name}`);
}

async function requestDecision(apiKey:string, model:AiModel, input:any, existing:Notice[]):Promise<AiDecision>{
  const recent=existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null}));
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
    body:JSON.stringify({
      model,
      store:false,
      reasoning:{effort:'low'},
      max_output_tokens:900,
      parallel_tool_calls:false,
      tool_choice:'required',
      tools,
      instructions:'你是生活通知管家的行程判斷器。閱讀單一手機通知或截圖後，必須只選一個工具。重點是理解語意，不要只靠關鍵字。相對日期必須以提供的 received_at 與 device_timezone 換算。沒有足夠證據時絕對不要猜日期、時間、地點或人物；改用 ask_user。預設要安靜：一般聊天、貼圖、社群互動、廣告、新聞、純狀態通知，即使出現時間文字，只要使用者沒有明確要參加/完成/付款/領取/回覆的行動，就用 ignore_notification。只有值得放進行程或待辦的內容才 create；取消、改期、臨近期限等可標 urgent，需要主動注意的截止/預約/課程/會議標 important，其餘值得記錄但不緊急的才標 normal。若內容是既有活動的延期/更正，且 existing_upcoming_events 有明確對應，使用 update_existing_event。標題要短、自然、可直接放入行事曆。',
      input,
    })
  });
  const json:any=await response.json().catch(()=>({}));
  if(!response.ok){const msg=json?.error?.message||`HTTP ${response.status}`;throw new Error(`OpenAI API 失敗：${msg}`)}
  const calls=(Array.isArray(json.output)?json.output:[]).filter((x:any)=>x?.type==='function_call');
  if(calls.length!==1)throw new Error('AI 沒有選出唯一的處理動作。');
  return parseAiToolCall(calls[0],new Set(recent.map(x=>x.id)));
}

export async function analyzeNotificationWithAI(args:AnalyzeArgs):Promise<AiDecision>{
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei';
  const recent=args.existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null}));
  const payload={source_app:args.appName,notification_title:args.title,notification_text:args.text,received_at:new Date(args.receivedAt).toISOString(),device_timezone:timezone,existing_upcoming_events:recent};
  return requestDecision(args.apiKey,args.model,`請分析以下手機通知 JSON：\n${JSON.stringify(payload)}`,args.existing);
}

export async function analyzeScreenshotWithAI(args:{apiKey:string;model:AiModel;base64:string;mimeType:string;receivedAt:number;existing:Notice[]}):Promise<AiDecision>{
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei';
  const recent=args.existing.filter(n=>!n.done).slice(0,30).map(n=>({id:n.id,title:n.title,start_at:n.dueAt,end_at:n.endAt??null,location:n.location??null}));
  const context=`這是一張由使用者手動選取的通知/聊天截圖。請直接閱讀圖片，不要依賴 OCR。received_at=${new Date(args.receivedAt).toISOString()}，device_timezone=${timezone}。既有行程 JSON=${JSON.stringify(recent)}`;
  const input=[{role:'user',content:[{type:'input_text',text:context},{type:'input_image',image_url:`data:${args.mimeType};base64,${args.base64}`,detail:'high'}]}];
  return requestDecision(args.apiKey,args.model,input,args.existing);
}
