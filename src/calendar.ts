import type {Notice} from './domain';

export const dayKey=(value:Date|string|number)=>{
  const d=value instanceof Date?value:new Date(value);
  const p=(n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};

export const monthTitle=(month:Date)=>`${month.getFullYear()}年${month.getMonth()+1}月`;
// Device locale data can fall back to English even when zh-TW is requested.
export const displayDay=(date:Date)=>`${date.getMonth()+1}月${date.getDate()}日 星期${'日一二三四五六'[date.getDay()]}`;
export const displayTime=(date:Date)=>`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;

export function monthGrid(month:Date):Date[]{
  const first=new Date(month.getFullYear(),month.getMonth(),1);
  const start=new Date(first);
  start.setDate(first.getDate()-first.getDay());
  return Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
}

export function noticesForDay(notices:Notice[],key:string){
  return notices.filter(n=>!n.done&&n.dueAt&&dayKey(n.dueAt)===key)
    .sort((a,b)=>Date.parse(a.dueAt!)-Date.parse(b.dueAt!));
}

export function noticesForMonth(notices:Notice[],month:Date){
  return notices.filter(n=>!n.done&&n.dueAt).filter(n=>{
    const d=new Date(n.dueAt!);
    return d.getFullYear()===month.getFullYear()&&d.getMonth()===month.getMonth();
  });
}

export function shiftMonth(month:Date,delta:number){return new Date(month.getFullYear(),month.getMonth()+delta,1);}
