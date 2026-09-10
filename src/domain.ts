export type Category = '生活' | '學校' | '帳單' | '取件' | '活動';
export type CheckItem = { id: string; text: string; done: boolean };
export type Revision = { at: string; title: string; dueAt: string | null; source: string };
export type Notice = {
  id: string; title: string; source: string; sourceImage?: string; category: Category;
  dueAt: string | null; assignee: string; checklist: CheckItem[]; done: boolean;
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
export function inferNotice(source: string, now = new Date()): { title: string; category: Category; date: string; time: string; checklist: string[]; warnings: string[] } {
  const lines = source.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
  const category: Category = /取貨|取件|包裹|超商/.test(source) ? '取件' : /繳費|帳單|繳款/.test(source) ? '帳單' : /學校|老師|家長|校外|班級/.test(source) ? '學校' : /活動|報名|聚餐/.test(source) ? '活動' : '生活';
  const warnings: string[] = []; let date = ''; let time = '';
  // Never guess relative dates in forwarded notices: their original send date is unknown.
  const matches = [...source.matchAll(/(?:(\d{4})[年/.-])?(\d{1,2})[月/.-](\d{1,2})(?:日|號)?/g)];
  if (matches.length === 1 && matches[0][1]) {
    const m = matches[0]; date = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  } else if (matches.length === 1) warnings.push('原文日期沒有年份，請補上年份，避免把舊通知排到今年。');
  if (matches.length > 1) warnings.push('原文含多個日期：請一次建立一個事項，分別確認報名截止、準備與活動日期。');
  if (/明天|後天|今天|下週|下星期|週[一二三四五六日天]|星期[一二三四五六日天]/.test(source)) warnings.push('相對日期需要對照原訊息發送日，請手動確認。');
  const times = [...source.matchAll(/(上午|下午|晚上|早上|中午)?\s*(\d{1,2})[:：](\d{2})/g)];
  if (times.length === 1) { let hour = Number(times[0][2]); const part = times[0][1]; if (/下午|晚上|中午/.test(part ?? '') && hour < 12) hour += 12; if (/上午|早上/.test(part ?? '') && hour === 12) hour = 0; time = `${String(hour).padStart(2,'0')}:${times[0][3]}`; }
  if (!time) warnings.push('未找到唯一明確時間，請自行設定；不會自動安排在午夜。');
  if (date && time) { try { const iso=parseDate(date,time); if (iso && new Date(iso) < now) warnings.push('辨識日期已過，請確認是否為舊通知。'); } catch { date='';time='';warnings.push('辨識到無效日期或時間，請自行確認。'); } }
  const checklist = lines.filter(s => /攜帶|準備|請帶|需帶|記得|回覆|填寫|完成|繳交/.test(s)).slice(0,12).map(s => s.replace(/^[•\-\d.、\s]+/, '').slice(0,200));
  return { title: (lines[0] || '').replace(/^[【\[]|[】\]]$/g,'').slice(0,80), category, date, time, checklist, warnings };
}
export function updateNotice(old: Notice, patch: Partial<Notice>, at = new Date().toISOString()): Notice {
  const changed = patch.title !== undefined && patch.title !== old.title || patch.dueAt !== undefined && patch.dueAt !== old.dueAt || patch.source !== undefined && patch.source !== old.source;
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
    if (!n || typeof n.id !== 'string' || n.id.length > 100 || ids.has(n.id) || typeof n.title !== 'string' || !n.title.trim() || n.title.length > 100 || typeof n.source !== 'string' || n.source.length > 20000 || !CATEGORIES.includes(n.category) || typeof n.assignee !== 'string' || n.assignee.length > 30 || typeof n.done !== 'boolean' || !Array.isArray(n.checklist) || n.checklist.length > 50 || !Array.isArray(n.history) || n.history.length > 20 || !(n.dueAt === null || typeof n.dueAt === 'string' && Number.isFinite(Date.parse(n.dueAt))) || !(n.remindMinutes === null || Number.isInteger(n.remindMinutes) && n.remindMinutes >= 0 && n.remindMinutes <= 43200)) throw new Error('備份包含無效事項。');
    for (const key of ['createdAt','updatedAt'] as const) if (typeof n[key] !== 'string' || !Number.isFinite(Date.parse(n[key]))) throw new Error('備份時間格式不正確。');
    for (const c of n.checklist) if (!c || typeof c.id !== 'string' || typeof c.text !== 'string' || c.text.length > 200 || typeof c.done !== 'boolean') throw new Error('準備清單格式不正確。');
    for (const h of n.history) if (!h || typeof h.at !== 'string' || !Number.isFinite(Date.parse(h.at)) || typeof h.title !== 'string' || h.title.length > 100 || typeof h.source !== 'string' || h.source.length > 20000 || !(h.dueAt === null || typeof h.dueAt === 'string' && Number.isFinite(Date.parse(h.dueAt)))) throw new Error('修改紀錄格式不正確。');
    ids.add(n.id);
  }
  // Explicit projection prevents restoring arbitrary device paths or unknown properties.
  const members = [...new Set(['我', ...s.members])];
  const allowedMembers = new Set(members);
  return { version: 1, welcomed: true, members, notices: s.notices.map(n => ({ id:n.id,title:n.title,source:n.source,category:n.category,dueAt:n.dueAt,assignee:allowedMembers.has(n.assignee)?n.assignee:'我',done:n.done,remindMinutes:n.remindMinutes,createdAt:n.createdAt,updatedAt:n.updatedAt,checklist:n.checklist.map(c=>({id:c.id,text:c.text,done:c.done})),history:n.history.map(h=>({at:h.at,title:h.title,dueAt:h.dueAt,source:h.source})) })) };
}
export function toCalendar(n: Notice): string {
  if (!n.dueAt) throw new Error('請先設定日期時間。');
  const esc = (s:string) => s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  const utc = (d:string) => new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const fold = (s:string) => { let line='', result=''; for(const char of s) { if(new TextEncoder().encode(line+char).length>73){result+=line+'\r\n ';line='';}line+=char;}return result+line; };
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Life Notice//ZH-TW','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${n.id}@life-notice.local`,`DTSTAMP:${utc(n.updatedAt)}`,`DTSTART:${utc(n.dueAt)}`,`DTEND:${utc(new Date(Date.parse(n.dueAt)+30*60000).toISOString())}`,`SUMMARY:${esc(n.title)}`,`DESCRIPTION:${esc(n.source+'\n負責人：'+n.assignee+'\n'+n.checklist.map(c=>(c.done?'☑ ':'□ ')+c.text).join('\n'))}`,'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
