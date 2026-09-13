// Resolve dates in device local time. A notification uses receipt time; manual import uses today.
export function resolveDateText(text:string,base=new Date()){
 const dates=new Set<string>(),warnings:string[]=[];
 const key=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const relative=/大後天|後天|明天|明晚|今天|今晚|(?:下|這|本)?(?:週|星期|禮拜)[一二三四五六日天]/g;
 for(const m of text.matchAll(relative)){
  const d=new Date(base.getFullYear(),base.getMonth(),base.getDate()),token=m[0];
  if(/^(大後天|後天|明天|明晚|今天|今晚)$/.test(token))d.setDate(d.getDate()+({大後天:3,後天:2,明天:1,明晚:1,今天:0,今晚:0}[token]??0));
  else{const target='一二三四五六日'.indexOf(token.at(-1)==='天'?'日':token.at(-1)!);const today=(d.getDay()+6)%7;let delta=target-today;if(token.startsWith('下'))delta+=7;else if(!/^[這本]/.test(token)&&delta<0)delta+=7;d.setDate(d.getDate()+delta);}
  dates.add(key(d));
 }
 const numeric=/(?<!\d)(?:(20\d{2})[年/.-])?(\d{1,2})[月/.-](\d{1,2})(?:日|號)?(?!\d)/g;
 let invalid=false;
 for(const m of text.matchAll(numeric)){const year=Number(m[1]||base.getFullYear()),month=Number(m[2]),day=Number(m[3]),d=new Date(year,month-1,day);if(d.getMonth()!==month-1||d.getDate()!==day){invalid=true;continue;}dates.add(key(d));}
 const number=(s:string)=>{if(/^\d+$/.test(s))return Number(s);const digits='零一二三四五六七八九';s=s.replace(/兩/g,'二').replace(/〇/g,'零');if(s.includes('十')){const [a,b]=s.split('十');return (a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0);}return digits.indexOf(s);};
 const times=new Set<string>();
 for(const m of text.matchAll(/(上午|早上|中午|下午|晚上|晚間|凌晨|今晚|明晚)?\s*(\d{1,2}|[零〇一二兩三四五六七八九十]{1,3})\s*(?:[:：點時](半|\d{1,2}|[零〇一二兩三四五六七八九十]{1,3})?(?:分)?|\.(?=\D|$))/g)){
  let hour=number(m[2]),minute=m[3]==='半'?30:m[3]?number(m[3]):0;const part=m[1]||(/今晚|明晚/.test(text)?'晚上':'');
  if(/下午|晚上|晚間|今晚|明晚/.test(part)&&hour<12)hour+=12;if(part==='中午'&&hour<11)hour+=12;if(/凌晨|上午|早上/.test(part)&&hour===12)hour=0;
  if(hour<0||hour>23||minute<0||minute>59){invalid=true;continue;}times.add(`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
 }
 if(!times.size){const part=text.match(/早上|上午|中午|下午|晚上|晚間|今晚|明晚/)?.[0];if(part){times.add(({早上:'09:00',上午:'09:00',中午:'12:00',下午:'15:00',晚上:'19:00',晚間:'19:00',今晚:'19:00',明晚:'19:00'} as Record<string,string>)[part]);warnings.push('只有時段，已使用預設時間，請確認。');}}
 if(!dates.size&&times.size&&/早上|上午|中午|下午|晚上|晚間|凌晨/.test(text))dates.add(key(base));
 if(invalid||dates.size>1||times.size>1)return {date:'',time:'',needsReview:true,warnings:['日期或時間有衝突，請確認後再儲存。']};
 const date=[...dates][0]||'',time=[...times][0]||'';
 if(date&&new Date(`${date}T${time||'23:59'}:00`).getTime()<base.getTime())warnings.push('辨識到的時間已經過去，請確認。');
 return {date,time,needsReview:warnings.length>0,warnings};
}
