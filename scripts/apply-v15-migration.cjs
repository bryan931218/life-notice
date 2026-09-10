const fs=require('fs');

function writeIfChanged(path,next){
  const old=fs.readFileSync(path,'utf8');
  if(old!==next)fs.writeFileSync(path,next);
}
function mustReplace(text,oldValue,newValue,label){
  if(text.includes(newValue))return text;
  if(!text.includes(oldValue))throw new Error(`v1.5 migration: missing ${label}`);
  return text.replace(oldValue,newValue);
}

let domain=fs.readFileSync('src/domain.ts','utf8');
domain=mustReplace(
  domain,
  "importance?: Importance;\n  assignee: string;",
  "importance?: Importance; replySuggestions?: string[];\n  assignee: string;",
  'Notice.replySuggestions'
);
domain=mustReplace(
  domain,
  "|| !(n.importance === undefined || ['normal','important','urgent'].includes(n.importance)) || !(n.remindMinutes",
  "|| !(n.importance === undefined || ['normal','important','urgent'].includes(n.importance)) || !(n.replySuggestions === undefined || Array.isArray(n.replySuggestions) && n.replySuggestions.length <= 3 && n.replySuggestions.every(r => typeof r === 'string' && r.length > 0 && r.length <= 40)) || !(n.remindMinutes",
  'reply validation'
);
domain=mustReplace(
  domain,
  "importance:['normal','important','urgent'].includes(String(n.importance))?n.importance as Importance:undefined,assignee:",
  "importance:['normal','important','urgent'].includes(String(n.importance))?n.importance as Importance:undefined,replySuggestions:Array.isArray(n.replySuggestions)?n.replySuggestions.filter(r=>typeof r==='string'&&r.trim()).map(r=>r.trim().slice(0,40)).slice(0,3):undefined,assignee:",
  'reply backup projection'
);
writeIfChanged('src/domain.ts',domain);

let app=fs.readFileSync('src/App.tsx','utf8');
app=mustReplace(
  app,
  "import {privacy} from './privacy';",
  "import {privacy} from './privacy';\nimport {canReplyToNotification,replyToNotification} from './reply';",
  'reply import'
);
app=mustReplace(
  app,
  "if(decision.type==='ignore_notification'||decision.type==='update_existing_event')return null;",
  "if(decision.type==='ignore_notification'||decision.type==='update_existing_event'||decision.type==='cancel_existing_event'||decision.type==='complete_existing_task')return null;",
  'aiNotice non-create guard'
);
app=mustReplace(
  app,
  "aiAction:decision.reason,importance:decision.importance};",
  "aiAction:decision.reason,importance:decision.importance,replySuggestions:'replySuggestions' in decision?decision.replySuggestions:[]};",
  'persist reply suggestions'
);
app=mustReplace(
  app,
  "importance:decision.importance}):n)};",
  "importance:decision.importance,replySuggestions:decision.replySuggestions}):n)};",
  'update reply suggestions'
);
app=mustReplace(
  app,
  "          made=aiNotice(decision,item,raw);",
  "          if(decision.type==='cancel_existing_event'||decision.type==='complete_existing_task'){\n            const old=next.notices.find(n=>n.id===decision.eventId);\n            if(old){\n              const source=`${old.source}\\n\\n[AI 狀態更新｜${item.appName}]\\n${raw}\\n[偵測ID:${item.id}]`;\n              next={...next,notices:next.notices.map(n=>n.id===old.id?updateNotice(n,{done:true,source,needsReview:false,aiConfidence:decision.confidence,aiAction:decision.reason,importance:decision.type==='cancel_existing_event'?decision.importance:n.importance,replySuggestions:decision.replySuggestions}):n)};\n              changed=true;processed.push(item.id);continue;\n            }\n          }\n          made=aiNotice(decision,item,raw);",
  'cancel/complete handling'
);
app=mustReplace(
  app,
  "        if(decision.type==='update_existing_event'){const old=live.current.notices.find(n=>n.id===decision.eventId);if(old){edit(old);setMessage('已找到對應的既有行程。')}return}\n        const when=",
  "        if(decision.type==='update_existing_event'){const old=live.current.notices.find(n=>n.id===decision.eventId);if(old){edit(old);setMessage('已找到對應的既有行程。')}return}\n        if(decision.type==='cancel_existing_event'||decision.type==='complete_existing_task'){setMessage('AI 判斷這張圖是在更新既有項目。');return}\n        const when=",
  'screenshot update handling'
);
app=mustReplace(
  app,
  "      <Text style={[s.heading,{marginBottom:8}]}>{notice.title}</Text><Text style={s.detailDate}>{whenLabel(notice)}{notice.endAt?` ～ ${whenLabel({...notice,dueAt:notice.endAt})}`:''}</Text>{notice.location&&<Text style={s.body}>📍 {notice.location}</Text>}\n      {notice.checklist.length>0&&<>",
  "      <Text style={[s.heading,{marginBottom:8}]}>{notice.title}</Text><Text style={s.detailDate}>{whenLabel(notice)}{notice.endAt?` ～ ${whenLabel({...notice,dueAt:notice.endAt})}`:''}</Text>{notice.location&&<Text style={s.body}>📍 {notice.location}</Text>}\n      {notice.replySuggestions?.length&&canReplyToNotification(notice.source)&&<><Text style={s.sectionTitle}>快速回覆</Text><View style={s.chips}>{notice.replySuggestions.map(reply=><Pressable key={reply} accessibilityRole=\"button\" onPress={()=>void run(async()=>{await replyToNotification(notice.source,reply);notify('已回覆。')})} style={s.chip}><Text style={s.chipText}>{reply}</Text></Pressable>)}</View></>}\n      {notice.checklist.length>0&&<>",
  'quick reply buttons'
);
app=app.replace('版本 1.4.3','版本 1.5.0');
writeIfChanged('src/App.tsx',app);

const nativePath='modules/notice-listener/android/src/main/java/expo/modules/noticelistener/LifeNoticeListenerService.kt';
let native=fs.readFileSync(nativePath,'utf8');
native=native.replaceAll('Pair<Notification.Action, Array<RemoteInput>>?','Pair<Notification.Action, Array<out RemoteInput>>?');
native=mustReplace(
  native,
  '      inputs.forEach { input -> results.putCharSequence(input.resultKey, text.take(500)) }\n      RemoteInput.addResultsToIntent(inputs, intent, results)',
  '      inputs.forEach { input -> results.putCharSequence(input.resultKey, text.take(500)) }\n      val inputArray = inputs.map { it }.toTypedArray()\n      RemoteInput.addResultsToIntent(inputArray, intent, results)',
  'RemoteInput variance bridge'
);
writeIfChanged(nativePath,native);

console.log('v1.5 migration applied');
