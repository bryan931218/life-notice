export type Category = '生活' | '學校' | '帳單' | '取件' | '活動';
export type Importance = 'normal' | 'important' | 'urgent';
export type CheckItem = { id: string; text: string; done: boolean };
export type Revision = { at: string; title: string; dueAt: string | null; source: string };
export type Notice = {
  id: string; title: string; source: string; sourceImage?: string; category: Category;
  dueAt: string | null; endAt?: string | null; allDay?: boolean; location?: string; needsReview?: boolean; aiConfidence?: number; aiAction?: string; importance?: Importance;
  assignee: string; checklist: CheckItem[]; done: boolean;
  remindMinutes: number | null; createdAt: string; updatedAt: string; history: Revision[];
};
export type State = { version: 1; notices: Notice[]; members: string[]; welcomed: boolean };
export const EMPTY: State = { version: 1, notices: [], members: ['我'], welcomed: false };
export const CATEGORIES: Category[] = ['生活', '學校', '帳單', '取件', '活動'];
export const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function parseDate(date: string, time: string): string | null {
  if (!date.trim() && !time.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const h = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!m || !h) throw new Error('日期請填 YYYY-MM-DD，時間請填 HH:mm。');
  const [year, month, day] = m.slice(1).map(Number); const [hour, minute] = h.slice(1).map(Number);
  const d = new Date(year, month - 1, day, hour, minute);
  if (year < 2000 || year > 2100 || d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day || hour > 23 || minute > 59) throw new Error('日期或時間不存在，請重新確認。');
  return d.toISOString();
}
export function dateFields(iso: string | null) {
  if (!iso) return { date: '', time: '' }; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
export type Inference = {
  title: string;
  category: Category;
  date: string;
  time: string;
  checklist: string[];
  warnings: string[];
  confidence: '高'|'中'|'低';
  evidence: string[];
  kind: 'notice'|'chat'|'text';
  actionable: boolean;
};

const normalizeNoticeText = (source:string) => source
  .replace(/\r/g,'\n').replace(/[\u200B-\u200D\uFEFF]/g,'')
  .replace(/[：﹕]/g,':').replace(/[／]/g,'/').replace(/[－–—]/g,'-')
  .replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();

const UI_NOISE = /^(?:LINE|Messenger|Instagram|Facebook|Threads|Discord|Telegram|WhatsApp|YouTube|Safari|Chrome|搜尋|Search|返回|完成|取消|傳送|輸入訊息|訊息|聊天室|相簿|照片|貼圖|語音|更多|已讀|未讀|上午|下午|AM|PM|\d{1,2}:\d{2}|\d{1,3}%|5G|4G|LTE|Wi-?Fi)$/i;
const META_NOISE = /^(?:\d{1,2}:\d{2}\s*)?(?:已讀\s*)?\d*$|^[<>(){}\[\]|·•…\s]+$/;
const ACTION_WORDS = /(請|需|須|務必|記得|攜帶|準備|帶上|回覆|填寫|完成|繳交|繳費|付款|簽名|上傳|下載|出示|領取|集合|參加|報名|登記|預約|確認|截止|最晚|締切|提出|支払|返信|予約|集合|持参|参加)/i;
const DATE_CONTEXT = /(截止|最晚|期限|以前|之前|前完成|回覆|繳交|繳費|付款|報名|登記|繳款|活動|集合|開始|舉行|上課|比賽|會議|到校|領取|取件|預約|締切|期限|開始|集合|予約)/i;

function cleanLine(line:string) {
  return line
    .replace(/^[•●○▪︎■□✓✔☑→➜►\-*\s]+/,'')
    .replace(/^\d{1,2}:\d{2}\s+/,'')
    .replace(/\s+/g,' ')
    .trim();
}

function meaningfulLines(text:string) {
  return text.split(/\n+/)
    .map(cleanLine)
    .filter(Boolean)
    .filter(line => !UI_NOISE.test(line) && !META_NOISE.test(line))
    .filter(line => !/^https?:\/\//i.test(line))
    .filter(line => !/^[0-9\s:./\-]+$/.test(line));
}

function isValidDate(year:number, month:number, day:number) {
  const d = new Date(year,month-1,day);
  return d.getFullYear()===year && d.getMonth()===month-1 && d.getDate()===day;
}

function displayDate(year:number, month:number, day:number) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function inferNotice(source: string, now = new Date()): Inference {
  const text = normalizeNoticeText(source);
  const lines = meaningfulLines(text);
  const warnings:string[] = [];
  const evidence:string[] = [];

  const category:Category = /取貨|取件|包裹|超商|物流|貨到|荷物|受取/.test(text) ? '取件'
    : /繳費|帳單|繳款|付款|費用|支払|請求書/.test(text) ? '帳單'
    : /學校|老師|家長|班級|課程|作業|考試|教務|系辦|校外教學|教學|報告|学校|先生|授業|宿題|試験/.test(text) ? '學校'
    : /活動|報名|聚餐|講座|比賽|會議|イベント|申込|大会|会議/.test(text) ? '活動' : '生活';

  const chatSignals = (text.match(/(?:已讀|\b(?:AM|PM)\b|\d{1,2}:\d{2})/gi) ?? []).length;
  const kind:'notice'|'chat'|'text' = chatSignals >= 3 ? 'chat' : DATE_CONTEXT.test(text) || ACTION_WORDS.test(text) ? 'notice' : 'text';

  type Candidate={date:string;raw:string;index:number;score:number;hasYear:boolean};
  const candidates:Candidate[]=[];
  const dateRe=/(?:(?:民國\s*)?(20\d{2}|1\d{2})\s*[年/.\-])?\s*(1[0-2]|0?[1-9])\s*[月/.\-]\s*(3[01]|[12]\d|0?[1-9])\s*(?:日|號)?/g;
  for(const m of text.matchAll(dateRe)){
    const index=m.index??0;
    const rawYear=m[1] ? Number(m[1]) : null;
    const year=rawYear===null ? now.getFullYear() : rawYear < 1911 ? rawYear + 1911 : rawYear;
    const month=Number(m[2]), day=Number(m[3]);
    if(!isValidDate(year,month,day)) continue;
    const around=text.slice(Math.max(0,index-45),Math.min(text.length,index+m[0].length+45));
    let score=0;
    if(/截止|最晚|期限|前完成|以前|之前|回覆|繳交|繳費|付款|報名|登記|繳款|締切|提出期限|支払期限/.test(around))score+=12;
    if(/活動|集合|開始|舉行|上課|比賽|會議|到校|領取|取件|預約|イベント|集合|開始|会議|予約/.test(around))score+=7;
    if(/更正|更新|改為|延至|延期|変更|訂正/.test(around))score+=5;
    if(/公告日期|發布日期|發文日期|通知日期|投稿日|公開日/.test(around))score-=5;
    if(/\d{1,2}:\d{2}/.test(around))score+=2;
    let actualYear=year;
    if(rawYear===null){
      const d=new Date(actualYear,month-1,day);
      const diff=d.getTime()-now.getTime();
      if(diff < -45*86400000) actualYear += 1;
    }
    candidates.push({date:displayDate(actualYear,month,day),raw:m[0],index,score,hasYear:rawYear!==null});
  }

  let chosen:Candidate|undefined;
  if(candidates.length===1) chosen=candidates[0];
  if(candidates.length>1){
    const ranked=[...candidates].sort((a,b)=>b.score-a.score || a.index-b.index);
    if(ranked[0].score >= ranked[1].score + 3) chosen=ranked[0];
  }

  let date=chosen?.date ?? '';
  if(chosen){
    evidence.push(`日期依據：${chosen.raw.trim()}`);
    if(!chosen.hasYear) warnings.push(`原文沒有年份，先顯示 ${chosen.date.slice(0,4)} 年；儲存前請確認。`);
  } else if(candidates.length>1){
    warnings.push(`讀到 ${candidates.length} 個日期，但無法安全判斷哪一個才是提醒時間，請你選擇。`);
  }

  const relative=(text.match(/今天|今晚|明天|後天|大後天|本週|這週|下週|下星期|週[一二三四五六日天]|星期[一二三四五六日天]|今日|明日|明後日|今週|来週/g)??[]);
  if(relative.length) warnings.push(`讀到相對日期「${[...new Set(relative)].join('、')}」，為避免舊截圖造成錯誤，不會自動換算日期。`);
  if(relative.length && date){ date=''; warnings.push('同一則內容同時出現相對日期，因此不自動採用其他日期，避免把聊天日期或舊截圖日期當成截止日。'); }

  let time='';
  const timeCandidates=[...text.matchAll(/(上午|早上|中午|下午|晚上|晚間|凌晨|AM|PM)?\s*(\d{1,2})\s*(?:([:：點時])\s*(\d{1,2})?\s*(?:分)?)?/gi)]
    .map(m=>({m,index:m.index??0}))
    .filter(({m})=>Boolean(m[1]||m[3]) && Number(m[2])<=23 && Number(m[4]??0)<=59);
  if(timeCandidates.length){
    const reference=chosen?.index;
    const ranked=timeCandidates.map(x=>{
      const around=text.slice(Math.max(0,x.index-30),Math.min(text.length,x.index+x.m[0].length+30));
      let score=DATE_CONTEXT.test(around)?8:0;
      if(reference!==undefined) score += Math.max(0,6-Math.floor(Math.abs(x.index-reference)/45));
      if(/已讀|電量|battery/i.test(around)) score-=7;
      return {...x,score};
    }).sort((a,b)=>b.score-a.score || a.index-b.index);
    const picked=ranked[0];
    // Chat screenshots contain many message timestamps. Only accept a time automatically
    // when it is close to a selected date or has action/deadline context.
    if(kind!=='chat' || picked.score>=6){
      let hour=Number(picked.m[2]), minute=Number(picked.m[4]??0); const part=(picked.m[1]??'').toUpperCase();
      if(/下午|晚上|晚間|PM/.test(part)&&hour<12)hour+=12;
      if(part==='中午'&&hour<11)hour+=12;
      if(/上午|早上|AM/.test(part)&&hour===12)hour=0;
      if(part==='凌晨'&&hour===12)hour=0;
      time=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
      evidence.push(`時間依據：${picked.m[0].trim()}`);
    }
  }

  if(date && !time){
    time='23:59';
    warnings.push('只讀到日期，沒有明確時間；暫放 23:59 並標記需要你確認。');
  }
  if(date&&time){
    try{
      const iso=parseDate(date,time);
      if(iso&&new Date(iso)<now) warnings.push('整理出的時間已經過去，可能是舊截圖；請確認年份與日期。');
    }catch{
      date=''; time=''; warnings.push('日期／時間格式不可靠，已清空避免建立錯誤提醒。');
    }
  }

  const titleCandidates=lines
    .filter(l=>l.length>=2&&l.length<=100)
    .filter(l=>!/^(日期|時間|地點|截止|備註|說明|date|time|location)[:：]/i.test(l))
    .map((line,index)=>{
      let score=0;
      if(ACTION_WORDS.test(line))score+=9;
      if(DATE_CONTEXT.test(line))score+=6;
      if(/[!！?？]$/.test(line))score+=1;
      if(line.length>=6&&line.length<=45)score+=4;
      if(line.length>70)score-=4;
      if(/^[\d\W]+$/.test(line))score-=10;
      if(kind==='chat' && /^(?:[A-Za-z\u4e00-\u9fff]{1,12})$/.test(line))score-=2; // likely sender/header
      return {line,index,score};
    })
    .sort((a,b)=>b.score-a.score || a.index-b.index);
  const fallback=lines.find(l=>l.length>=2&&l.length<=80) ?? '';
  const title=(titleCandidates[0]?.line ?? fallback)
    .replace(/^[【\[「『〈《]|[】\]」』〉》]$/g,'')
    .replace(/^\d+[.、)]\s*/,'')
    .slice(0,80);
  if(title)evidence.push(`標題候選：${title}`);

  const checklist:string[]=[];
  const fragments=lines.flatMap(line=>line.split(/[。；;]+/).map(cleanLine).filter(Boolean));
  for(const fragment of fragments){
    if(!ACTION_WORDS.test(fragment))continue;
    const cleaned=fragment.replace(/^(提醒|注意|備註|請注意)[:：]?\s*/,'').trim();
    if(cleaned.length<3||cleaned.length>200)continue;
    if(!checklist.some(x=>x===cleaned))checklist.push(cleaned);
    if(checklist.length>=12)break;
  }
  if(checklist.length)evidence.push(`抓到 ${checklist.length} 個待辦／準備動作`);

  const actionable=Boolean(date || checklist.length || DATE_CONTEXT.test(text));
  let confidence:'高'|'中'|'低'='低';
  let score=(chosen?3:0)+(time?1:0)+(title?1:0)+(checklist.length?2:0)+(kind==='notice'?1:0);
  if(candidates.length>1&&!chosen)score-=2;
  if(relative.length)score-=1;
  if(score>=6)confidence='高'; else if(score>=3)confidence='中';

  if(!date){
    warnings.push(actionable
      ? '文字已讀取，但沒有找到足夠可靠的提醒日期；可以先保留內容，或手動補日期。'
      : '這張內容比較像一般圖片／聊天文字，不像有明確期限的通知；文字仍會完整保留。');
  }

  return {title,category,date,time,checklist,warnings,confidence,evidence,kind,actionable};
}

export function inferLiveNotification(source:string, receivedAt:number|Date = Date.now()):Inference {
  const base = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  const inferred = inferNotice(source, base);
  if (inferred.date) return inferred;

  const text = normalizeNoticeText(source);
  const match = text.match(/今天|今晚|明天|明晚|後天|大後天|這週|本週|下週|下星期|週[一二三四五六日天]|星期[一二三四五六日天]|禮拜[一二三四五六日天]/);
  if (!match) return inferred;

  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const token = match[0];
  if (token === '明天' || token === '明晚') d.setDate(d.getDate()+1);
  else if (token === '後天') d.setDate(d.getDate()+2);
  else if (token === '大後天') d.setDate(d.getDate()+3);
  else if (/^(週|星期|禮拜)/.test(token)) {
    const names = '日一二三四五六';
    const char = token[token.length-1] === '天' ? '日' : token[token.length-1];
    const target = names.indexOf(char);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate()+delta);
  } else if (/下週|下星期/.test(token)) {
    d.setDate(d.getDate() + (7 - d.getDay()) + 1);
  }

  const date = displayDate(d.getFullYear(), d.getMonth()+1, d.getDate());
  let time = inferred.time;
  if (!time) {
    const tm = text.match(/(上午|早上|中午|下午|晚上|晚間|凌晨)?\s*(\d{1,2})\s*([:：點時])\s*(\d{1,2})?\s*(?:分)?/);
    if (tm) {
      let hour = Number(tm[2]);
      const minute = Number(tm[4] ?? 0);
      const part = tm[1] ?? '';
      if (/下午|晚上|晚間/.test(part) && hour < 12) hour += 12;
      if (part === '中午' && hour < 11) hour += 12;
      if (/上午|早上/.test(part) && hour === 12) hour = 0;
      if (part === '凌晨' && hour === 12) hour = 0;
      if (hour <= 23 && minute <= 59) time = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    }
  }
  if (!time) time = '23:59';

  return {
    ...inferred,
    date,
    time,
    warnings: inferred.warnings.filter(w=>!w.includes('相對日期')).concat(time==='23:59' ? ['通知提到相對日期但沒有明確時間，先放在當天 23:59，請點開確認。'] : []),
    evidence: [...inferred.evidence, `即時通知時間：${token}（以收到通知的時間換算）`],
    confidence: inferred.confidence === '低' ? '中' : inferred.confidence,
    actionable: true,
  };
}

export function updateNotice(old: Notice, patch: Partial<Notice>, at = new Date().toISOString()): Notice {
  const changed = patch.title !== undefined && patch.title !== old.title || patch.dueAt !== undefined && patch.dueAt !== old.dueAt || patch.endAt !== undefined && patch.endAt !== old.endAt || patch.location !== undefined && patch.location !== old.location || patch.source !== undefined && patch.source !== old.source;
  return { ...old, ...patch, id: old.id, createdAt: old.createdAt, updatedAt: at, history: changed ? [{ at, title: old.title, dueAt: old.dueAt, source: old.source }, ...old.history].slice(0,20) : old.history };
}
export function reminderPlan(notices: Notice[], now = Date.now()) {
  return notices.filter(n => !n.done && n.dueAt && n.remindMinutes !== null).map(n => ({ id: n.id, title: n.title, at: new Date(n.dueAt!).getTime() - n.remindMinutes! * 60000 })).filter(n => n.at > now).sort((a,b) => a.at-b.at).slice(0,40);
}
export function validateBackup(value: unknown): State {
  const s = value as State;
  if (!s || s.version !== 1 || !Array.isArray(s.notices) || s.notices.length > 2000 || !Array.isArray(s.members) || s.members.length > 20) throw new Error('備份格式或版本不支援。');
  if (!s.members.every(m => typeof m === 'string' && m.trim().length > 0 && m.length <= 30)) throw new Error('成員資料不正確。');
  const ids = new Set<string>();
  for (const n of s.notices) {
    if (!n || typeof n.id !== 'string' || n.id.length > 100 || ids.has(n.id) || typeof n.title !== 'string' || !n.title.trim() || n.title.length > 100 || typeof n.source !== 'string' || n.source.length > 20000 || !CATEGORIES.includes(n.category) || typeof n.assignee !== 'string' || n.assignee.length > 30 || typeof n.done !== 'boolean' || !Array.isArray(n.checklist) || n.checklist.length > 50 || !Array.isArray(n.history) || n.history.length > 20 || !(n.dueAt === null || typeof n.dueAt === 'string' && Number.isFinite(Date.parse(n.dueAt))) || !(n.endAt === undefined || n.endAt === null || typeof n.endAt === 'string' && Number.isFinite(Date.parse(n.endAt))) || !(n.location === undefined || typeof n.location === 'string' && n.location.length <= 200) || !(n.needsReview === undefined || typeof n.needsReview === 'boolean') || !(n.aiConfidence === undefined || typeof n.aiConfidence === 'number' && n.aiConfidence >= 0 && n.aiConfidence <= 1) || !(n.importance === undefined || ['normal','important','urgent'].includes(n.importance)) || !(n.remindMinutes === null || Number.isInteger(n.remindMinutes) && n.remindMinutes >= 0 && n.remindMinutes <= 43200)) throw new Error('備份包含無效事項。');
    for (const key of ['createdAt','updatedAt'] as const) if (typeof n[key] !== 'string' || !Number.isFinite(Date.parse(n[key]))) throw new Error('備份時間格式不正確。');
    for (const c of n.checklist) if (!c || typeof c.id !== 'string' || typeof c.text !== 'string' || c.text.length > 200 || typeof c.done !== 'boolean') throw new Error('準備清單格式不正確。');
    for (const h of n.history) if (!h || typeof h.at !== 'string' || !Number.isFinite(Date.parse(h.at)) || typeof h.title !== 'string' || h.title.length > 100 || typeof h.source !== 'string' || h.source.length > 20000 || !(h.dueAt === null || typeof h.dueAt === 'string' && Number.isFinite(Date.parse(h.dueAt)))) throw new Error('修改紀錄格式不正確。');
    ids.add(n.id);
  }
  // Explicit projection prevents restoring arbitrary device paths or unknown properties.
  const members = [...new Set(['我', ...s.members])];
  return { version: 1, welcomed: true, members, notices: s.notices.map(n => ({ id:n.id,title:n.title,source:n.source,category:n.category,dueAt:n.dueAt,endAt:n.endAt??null,allDay:!!n.allDay,location:typeof n.location==='string'?n.location:undefined,needsReview:!!n.needsReview,aiConfidence:typeof n.aiConfidence==='number'?n.aiConfidence:undefined,aiAction:typeof n.aiAction==='string'?n.aiAction.slice(0,240):undefined,importance:['normal','important','urgent'].includes(String(n.importance))?n.importance as Importance:undefined,assignee:members.includes(n.assignee)?n.assignee:'我',done:n.done,remindMinutes:n.remindMinutes,createdAt:n.createdAt,updatedAt:n.updatedAt,checklist:n.checklist.map(c=>({id:c.id,text:c.text,done:c.done})),history:n.history.map(h=>({at:h.at,title:h.title,dueAt:h.dueAt,source:h.source})) })) };
}
export function toCalendar(n: Notice): string {
  if (!n.dueAt) throw new Error('請先設定日期時間。');
  const esc = (s:string) => s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  const utc = (d:string) => new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const fold = (s:string) => { let line='', result=''; for(const char of s) { if(new TextEncoder().encode(line+char).length>73){result+=line+'\r\n ';line='';}line+=char;}return result+line; };
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Life Notice//ZH-TW','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${n.id}@life-notice.local`,`DTSTAMP:${utc(n.updatedAt)}`,`DTSTART:${utc(n.dueAt)}`,`DTEND:${utc(n.endAt&&Date.parse(n.endAt)>Date.parse(n.dueAt)?n.endAt:new Date(Date.parse(n.dueAt)+30*60000).toISOString())}`,`SUMMARY:${esc(n.title)}`,...(n.location?[`LOCATION:${esc(n.location)}`]:[]),`DESCRIPTION:${esc(n.source+'\n負責人：'+n.assignee+'\n'+n.checklist.map(c=>(c.done?'☑ ':'□ ')+c.text).join('\n'))}`,'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
