import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,KeyboardAvoidingView,Linking,Modal,Platform,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as FS from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {CATEGORIES,EMPTY,dateFields,id,inferLiveNotification,inferNotice,parseDate,updateNotice,validateBackup,type Category,type Notice,type State} from './domain';
import {AI_MODELS,analyzeNotificationWithAI,analyzeScreenshotWithAI,type AiDecision,type AiModel} from './ai';
import * as api from './services';
import {Button,Chips,Field,Icon,confirm,notify,p,s} from './ui';
import {MonthCalendar} from './calendar-ui';
import {privacy} from './privacy';

type Tab='home'|'calendar'|'manual'|'settings';
type Draft={title:string;source:string;image?:string;category:Category;date:string;time:string;assignee:string;checks:string;remind:number|null;editing?:string};
const blank=():Draft=>({title:'',source:'',category:'生活',date:'',time:'',assignee:'我',checks:'',remind:60});
const fmt=(d:string|null)=>d?new Date(d).toLocaleString('zh-TW',{month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'}):'時間待確認';
const isAuto=(n:Notice)=>/^\[(?:AI)?自動偵測｜/.test(n.source);

function aiNotice(decision:AiDecision,item:api.DetectedNotification,raw:string):Notice|null{
  if(decision.type==='ignore_notification'||decision.type==='update_existing_event')return null;
  const now=new Date().toISOString(),createdAt=new Date(item.receivedAt).toISOString();
  const common={id:id(),source:`[AI自動偵測｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`,assignee:'我',done:false,createdAt,updatedAt:now,history:[],aiConfidence:decision.confidence,aiAction:decision.reason,importance:decision.importance};
  if(decision.type==='create_calendar_event')return {...common,title:decision.title,category:decision.category,dueAt:decision.startAt,endAt:decision.endAt,allDay:decision.allDay,location:decision.location??undefined,needsReview:decision.confidence<0.86,checklist:decision.checklist.map(text=>({id:id(),text,done:false})),remindMinutes:decision.importance==='normal'?null:decision.reminderMinutes};
  if(decision.type==='create_task')return {...common,title:decision.title,category:decision.category,dueAt:decision.dueAt,needsReview:decision.confidence<0.86||!decision.dueAt,checklist:decision.checklist.map(text=>({id:id(),text,done:false})),remindMinutes:decision.importance==='normal'?null:decision.dueAt?decision.reminderMinutes:null};
  return {...common,title:decision.title,category:decision.category,dueAt:decision.proposedAt,needsReview:true,checklist:[{id:id(),text:decision.question,done:false}],remindMinutes:null};
}


export default function App(){return <SafeAreaProvider><Main/></SafeAreaProvider>}

function Main(){
  const [data,setData]=useState<State>(EMPTY);
  const [ready,setReady]=useState(false);
  const [loadError,setLoadError]=useState('');
  const live=useRef(data);
  const [tab,setTab]=useState<Tab>('home');
  const [draft,setDraft]=useState<Draft>(blank);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [policy,setPolicy]=useState(false);
  const [notificationStatus,setNotificationStatus]=useState('提醒只會在授權後送達。');
  const [listenerEnabled,setListenerEnabled]=useState(false);
  const [autoCalendar,setAutoCalendar]=useState(false);
  const [autoMessage,setAutoMessage]=useState('');
  const [aiConfig,setAiConfig]=useState<api.AiSettings>({enabled:false,model:'gpt-5.6-terra'});
  const [aiHasKey,setAiHasKey]=useState(false);
  const [aiKeyDraft,setAiKeyDraft]=useState('');
  const [aiStatus,setAiStatus]=useState('AI 功能預設關閉。');
  const [alertLevel,setAlertLevel]=useState<api.AlertLevel>('important');
  const lock=useRef(false);
  const scroll=useRef<ScrollView>(null);
  const notice=data.notices.find(n=>n.id===selected);

  const commit=async(next:State,permission=false)=>{
    await api.persist(next);
    live.current=next;
    setData(next);
    try{setNotificationStatus(await api.syncReminders(next.notices,permission))}catch{setNotificationStatus('資料已保存，但提醒未排程成功。請到設定重試。')}
  };

  const importDetected=async(base?:State)=>{
    if(!api.notificationListenerSupported())return base??live.current;
    setListenerEnabled(api.notificationListenerEnabled());
    const calendarEnabled=await api.getAutoCalendarEnabled();setAutoCalendar(calendarEnabled);
    let settings=await api.getAiSettings();
    let key=settings.enabled?await api.getOpenAiKey():null;
    if(settings.enabled&&!key){settings={...settings,enabled:false};await api.setAiSettings(settings);setAiStatus('找不到 API key，已自動切回純本機模式。');}
    else await api.setAiSettings(settings);
    setAiConfig(settings);setAiHasKey(!!key);
    const detected=api.getDetectedNotifications().slice(0,8);
    if(!detected.length)return base??live.current;
    let next=base??live.current;
    const seen=new Set(next.notices.map(n=>n.source.match(/\[偵測ID:([^\]]+)\]/)?.[1]).filter(Boolean));
    const processed:string[]=[];let created=0,ignored=0,updated=0,aiFailed=0;
    for(const item of detected){
      if(seen.has(item.id)){processed.push(item.id);continue;}
      const raw=[item.title,item.text].filter(Boolean).join('\n').trim();if(!raw){processed.push(item.id);continue;}
      let made:Notice|null=null,decision:AiDecision|null=null;
      if(settings.enabled&&key){
        try{
          decision=await analyzeNotificationWithAI({apiKey:key,model:settings.model,appName:item.appName,title:item.title,text:item.text,receivedAt:item.receivedAt,existing:next.notices});
          if(decision.type==='ignore_notification'){ignored++;processed.push(item.id);continue;}
          if(decision.type==='update_existing_event'){
            const change=decision;
            const old=next.notices.find(n=>n.id===change.eventId);
            if(old){
              const source=`${old.source}\n\n[AI 更正來源｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`;
              next={...next,notices:next.notices.map(n=>n.id===old.id?updateNotice(n,{title:change.title??n.title,dueAt:change.startAt??n.dueAt,endAt:change.endAt??n.endAt,location:change.location??n.location,remindMinutes:change.reminderMinutes??n.remindMinutes,source,needsReview:change.confidence<0.9,aiConfidence:change.confidence,aiAction:change.reason,importance:change.importance}):n)};
              updated++;processed.push(item.id);continue;
            }
          }
          made=aiNotice(decision,item,raw);
        }catch(e){aiFailed++;setAiStatus(e instanceof Error?e.message:'AI 分析暫時失敗，已改用本機備援。');}
      }
      if(!made){
        const inferred=inferLiveNotification(raw,item.receivedAt);
        if(settings.enabled&&key&&!inferred.actionable){processed.push(item.id);continue;}
        let dueAt:string|null=null;try{dueAt=inferred.date&&inferred.time?parseDate(inferred.date,inferred.time):null}catch{dueAt=null}
        const title=(inferred.title||item.text.split(/\n/).find(Boolean)||item.title||'偵測到的重要訊息').slice(0,100);
        made={id:id(),title,source:`[自動偵測｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`,category:inferred.category,dueAt,needsReview:!dueAt,assignee:'我',checklist:inferred.checklist.map(text=>({id:id(),text,done:false})),done:false,remindMinutes:dueAt&&item.score>=9?60:null,createdAt:new Date(item.receivedAt).toISOString(),updatedAt:new Date().toISOString(),history:[],importance:item.score>=12?'urgent':item.score>=9?'important':'normal'};
      }
      next={...next,notices:[made,...next.notices]};created++;
      const trusted=made.dueAt&&!made.needsReview&&(made.aiConfidence!==undefined?made.aiConfidence>=0.9:item.score>=9);
      if(calendarEnabled&&trusted){try{await api.addToSystemCalendar(made,`detected-${item.id}`)}catch{}}
      processed.push(item.id);
    }
    if(created||updated){await api.persist(next);live.current=next;setData(next);try{setNotificationStatus(await api.syncReminders(next.notices))}catch{}}
    if(processed.length)api.markDetectedNotificationsProcessed(processed);
    if(settings.enabled&&key){setAiStatus(aiFailed?`AI 有 ${aiFailed} 則失敗，已用本機規則備援。`:`AI 已分析：新增 ${created}、更新 ${updated}、略過 ${ignored}。`);}
    setAutoMessage(created||updated?`剛剛整理 ${created+updated} 則重要通知。`:ignored?`AI 剛剛略過 ${ignored} 則不需要建立行程的通知。`:'');
    return next;
  };

  const reload=async()=>{
    try{
      const d=await api.load();live.current=d;setData(d);setLoadError('');setReady(true);
      setListenerEnabled(api.notificationListenerEnabled());
      setAutoCalendar(await api.getAutoCalendarEnabled());
      const cfg=await api.getAiSettings();setAiConfig(cfg);setAiHasKey(await api.hasOpenAiKey());setAlertLevel(await api.getAlertLevel());
      const merged=await importDetected(d);
      api.syncReminders(merged.notices).then(setNotificationStatus).catch(()=>setNotificationStatus('提醒排程失敗，請到設定重試。'));
    }catch{setLoadError('本機資料無法讀取。為避免覆蓋原資料，目前停止寫入，請先重新載入。')}
  };

  useEffect(()=>{
    void reload();
    const app=AppState.addEventListener('change',state=>{if(state==='active'){setListenerEnabled(api.notificationListenerEnabled());void importDetected();}});
    const timer=setInterval(()=>{if(AppState.currentState==='active')void importDetected()},15000);
    let response:ReturnType<typeof Notifications.addNotificationResponseReceivedListener>|undefined;
    if(Platform.OS!=='web'){
      response=Notifications.addNotificationResponseReceivedListener(r=>{const n=r.notification.request.content.data?.noticeId;if(typeof n==='string')setSelected(n)});
      Notifications.getLastNotificationResponseAsync().then(r=>{const n=r?.notification.request.content.data?.noticeId;if(typeof n==='string')setSelected(n)}).catch(()=>{});
    }
    return()=>{app.remove();clearInterval(timer);response?.remove()};
  },[]);
  useEffect(()=>{scroll.current?.scrollTo({y:0,animated:false})},[tab]);

  const run=async(job:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await job()}catch(e){notify(e instanceof Error?e.message:'操作失敗，請稍後重試。')}finally{lock.current=false;setBusy(false)}};
  const patchDraft=(patch:Partial<Draft>)=>setDraft(d=>({...d,...patch}));
  const startManual=()=>{setDraft(blank());setWarnings([]);setMessage('');setTab('manual')};
  const addForDate=(date:string)=>{setDraft({...blank(),date});setWarnings([]);setMessage('已帶入日期，補上時間與標題即可。');setTab('manual')};
  const parse=()=>{
    if(!draft.source.trim()){notify('請先貼上文字，或選擇一張截圖。');return}
    const r=inferNotice(draft.source);
    setDraft(d=>({...d,title:r.title,category:r.category,date:r.date,time:r.time,checks:r.checklist.join('\n')}));
    setWarnings(r.warnings);setMessage(`已讀取文字，辨識信心：${r.confidence}。請只確認下方幾個重點即可。`);
  };
  const pickImage=()=>void run(async()=>{
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1,allowsEditing:false});if(result.canceled)return;
    const asset=result.assets[0],uri=asset.uri;patchDraft({image:uri});
    const settings=await api.getAiSettings(),key=settings.enabled?await api.getOpenAiKey():null;
    if(settings.enabled&&key&&Platform.OS!=='web'){
      try{
        const base64=await FS.readAsStringAsync(uri,{encoding:FS.EncodingType.Base64});
        const decision=await analyzeScreenshotWithAI({apiKey:key,model:settings.model,base64,mimeType:asset.mimeType||'image/jpeg',receivedAt:Date.now(),existing:live.current.notices});
        let ocr='';try{ocr=await api.recognize(uri)}catch{}
        patchDraft({source:ocr||'[AI 已直接閱讀原始截圖；OCR 無可靠文字]'});
        if(decision.type==='ignore_notification'){setMessage(`AI 判斷這張圖不需要建立行程：${decision.reason}`);return;}
        if(decision.type==='update_existing_event'){const old=live.current.notices.find(n=>n.id===decision.eventId);if(old){edit(old);setMessage(`AI 判斷這是既有行程的更新：${decision.reason}`);}return;}
        const when=decision.type==='create_calendar_event'?decision.startAt:decision.type==='create_task'?decision.dueAt:decision.proposedAt;
        const f=dateFields(when);const title=decision.title,category=decision.category;
        const checks=decision.type==='ask_user'?[decision.question]:decision.checklist;
        setDraft(d=>({...d,image:uri,source:ocr||'[AI 已直接閱讀原始截圖]',title,category,date:f.date,time:f.time,checks:checks.join('\n'),remind:decision.type==='create_calendar_event'?decision.reminderMinutes:decision.type==='create_task'?decision.reminderMinutes:null}));
        setWarnings(decision.type==='ask_user'?[decision.question]:[]);setMessage(`AI 已直接看圖整理（信心 ${Math.round(decision.confidence*100)}%）：${decision.reason}`);return;
      }catch(e){setMessage(`${e instanceof Error?e.message:'AI 看圖失敗'}；已改用手機本機 OCR。`);}
    }
    try{const text=await api.recognize(uri);patchDraft({source:text});const r=inferNotice(text);setDraft(d=>({...d,title:r.title,category:r.category,date:r.date,time:r.time,checks:r.checklist.join('\n')}));setWarnings(r.warnings);setMessage('已用手機本機 OCR 整理。開啟 AI 後，截圖會改成由模型直接看原圖，不再依賴 OCR 結果。')}catch(e){setMessage(e instanceof Error?e.message:'截圖讀取失敗。')}
  });
  const save=()=>void run(async()=>{
    const title=draft.title.trim();if(!title)throw new Error('請確認事項標題。');
    const dueAt=parseDate(draft.date,draft.time);
    let sourceImage:string|undefined=draft.image;
    if(sourceImage&&!sourceImage.startsWith(FS.documentDirectory??'__none__'))sourceImage=await api.keepImage(sourceImage);
    const checks=draft.checks.split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,50).map(text=>({id:id(),text,done:false}));
    const now=new Date().toISOString();
    let next:State;
    if(draft.editing){
      const old=live.current.notices.find(n=>n.id===draft.editing);if(!old)throw new Error('找不到要編輯的事項。');
      next={...live.current,notices:live.current.notices.map(n=>n.id===old.id?updateNotice(n,{title,source:draft.source.trim(),sourceImage,category:draft.category,dueAt,assignee:draft.assignee,checklist:checks,remindMinutes:draft.remind}):n)};
    }else{
      const item:Notice={id:id(),title,source:draft.source.trim(),sourceImage,category:draft.category,dueAt,assignee:draft.assignee,checklist:checks,done:false,remindMinutes:draft.remind,createdAt:now,updatedAt:now,history:[]};
      next={...live.current,notices:[item,...live.current.notices]};
    }
    await commit(next,true);setDraft(blank());setWarnings([]);setMessage('');setTab('home');
  });
  const edit=(n:Notice)=>{const f=dateFields(n.dueAt);setDraft({title:n.title,source:n.source,image:n.sourceImage,category:n.category,date:f.date,time:f.time,assignee:n.assignee,checks:n.checklist.map(c=>c.text).join('\n'),remind:n.remindMinutes,editing:n.id});setWarnings([]);setMessage('');setSelected(null);setTab('manual')};
  const toggle=(n:Notice)=>void run(async()=>commit({...live.current,notices:live.current.notices.map(x=>x.id===n.id?updateNotice(x,{done:!x.done}):x)}));
  const remove=(n:Notice)=>void run(async()=>{if(!(await confirm(`刪除「${n.title}」？`)))return;await api.removeImage(n.sourceImage);await commit({...live.current,notices:live.current.notices.filter(x=>x.id!==n.id)});setSelected(null)});
  const restore=()=>void run(async()=>{
    const result=await DocumentPicker.getDocumentAsync({type:'application/json',copyToCacheDirectory:true});if(result.canceled)return;
    const raw=await FS.readAsStringAsync(result.assets[0].uri);const restored=validateBackup(JSON.parse(raw));
    if(!(await confirm(`將用備份中的 ${restored.notices.length} 則事項取代目前資料，繼續嗎？`)))return;
    await commit(restored);notify('備份已還原。');
  });
  const enableAuto=async()=>{
    if(Platform.OS!=='android'){notify('iPhone 系統不允許第三方 App 讀取其他 App 的通知內容。iPhone 版會保留分享與截圖匯入。');return}
    await api.notificationAccess(true);
    api.openNotificationListenerSettings();
  };
  const toggleAutoCalendar=()=>void run(async()=>{
    const next=await api.setAutoCalendarEnabled(!autoCalendar);
    setAutoCalendar(next);
    if(!next&&!autoCalendar) notify('沒有取得行事曆權限。自動偵測仍會正常加入 App 內行程。');
    else notify(next?'已開啟：高信心且有明確時間的行程會自動同步到手機行事曆。':'已關閉手機行事曆自動同步。');
  });
  const saveAiKey=()=>void run(async()=>{
    if(!aiKeyDraft.trim())throw new Error('請先貼上新的 OpenAI API key。');
    await api.saveOpenAiKey(aiKeyDraft);setAiHasKey(true);setAiKeyDraft('');setAiStatus('API key 已保存於手機安全儲存區，不會寫入備份或 GitHub。');
  });
  const toggleAi=()=>void run(async()=>{
    if(!aiConfig.enabled&&!await api.hasOpenAiKey())throw new Error('請先儲存 OpenAI API key，再開啟 AI。');
    const next={...aiConfig,enabled:!aiConfig.enabled};await api.setAiSettings(next);setAiConfig(next);setAiStatus(next.enabled?'AI 已開啟：候選通知內容會送到 OpenAI API 做語意判斷。':'已切回純本機模式：通知內容不會送到 OpenAI。');
  });
  const changeAiModel=(model:AiModel)=>void run(async()=>{const next={...aiConfig,model};await api.setAiSettings(next);setAiConfig(next);});
  const changeAlertLevel=(level:api.AlertLevel)=>void run(async()=>{await api.setAlertLevel(level);setAlertLevel(level);notify(level==='important'?'已設為「重要才提醒」：一般聊天只會靜默略過。':level==='balanced'?'已設為「平衡」：較明確的行程也會即時提醒。':'已設為「較積極」：更多候選通知可能會提醒。')});
  const pasteAndSaveAiKey=()=>void run(async()=>{const key=(await Clipboard.getStringAsync()).trim();if(!key)throw new Error('剪貼簿沒有內容。');await api.saveOpenAiKey(key);setAiHasKey(true);setAiKeyDraft('');setAiStatus('已從剪貼簿保存 API key。');});
  const testAi=()=>void run(async()=>{const key=await api.getOpenAiKey();if(!key)throw new Error('請先儲存 API key。');const d=await analyzeNotificationWithAI({apiKey:key,model:aiConfig.model,appName:'測試',title:'測試通知',text:'明天下午 7 點和同學開會，記得帶報告',receivedAt:Date.now(),existing:live.current.notices});setAiStatus(`AI 測試成功：${d.type}（${Math.round(d.confidence*100)}%）`);notify('AI 連線成功。');});

  const pending=data.notices.filter(n=>!n.done);
  const sorted=[...pending].sort((a,b)=>(a.dueAt?Date.parse(a.dueAt):Number.MAX_SAFE_INTEGER)-(b.dueAt?Date.parse(b.dueAt):Number.MAX_SAFE_INTEGER));
  const todayKey=new Date().toDateString();
  const today=sorted.filter(n=>n.dueAt&&new Date(n.dueAt).toDateString()===todayKey);
  const nextWeek=sorted.filter(n=>n.dueAt&&new Date(n.dueAt).toDateString()!==todayKey).slice(0,5);
  const needsReview=sorted.filter(n=>isAuto(n)&&(!!n.needsReview||!n.dueAt));
  const autoCount=pending.filter(isAuto).length;

  const card=(n:Notice)=><Pressable key={n.id} accessibilityRole="button" onPress={()=>setSelected(n.id)} style={s.card}>
    <View style={s.row}><View style={s.categoryDot}><Icon name={isAuto(n)?'sparkles-outline':'calendar-outline'}/></View><View style={s.flex}><Text style={s.cardTitle}>{n.title}</Text><Text style={s.caption}>{fmt(n.dueAt)} · {n.category}{n.importance==='urgent'?' · 緊急':n.importance==='important'?' · 重要':''}{isAuto(n)?' · 自動偵測':''}</Text></View><Icon name="chevron-forward" color={p.muted}/></View>
  </Pressable>;
  const empty=(title:string,body:string)=><View style={s.empty}><Icon name="checkmark-circle-outline" size={32}/><Text style={s.emptyTitle}>{title}</Text><Text style={[s.caption,{textAlign:'center'}]}>{body}</Text></View>;

  if(!ready)return <SafeAreaView style={[s.root,{alignItems:'center',justifyContent:'center'}]}><ActivityIndicator/><Text style={s.caption}>正在載入…</Text></SafeAreaView>;
  if(loadError)return <SafeAreaView style={s.root}><View style={s.content}><Text style={s.warning}>{loadError}</Text><Button label="重新載入" onPress={()=>void reload()}/></View></SafeAreaView>;

  return <SafeAreaView style={s.root}>
    <StatusBar style="dark"/>
    <View style={s.top}><View style={s.row}><View style={s.logo}><Icon name="notifications" color="white"/></View><View><Text style={s.brand}>生活通知管家</Text><Text style={s.local}>{aiConfig.enabled?'AI 智慧辨識':'純本機'} · {alertLevel==='important'?'重要才提醒':alertLevel==='balanced'?'平衡提醒':'較積極提醒'}</Text></View></View>{Platform.OS==='android'&&<View style={[s.listenerPill,listenerEnabled&&s.listenerPillOn]}><View style={[s.statusDot,listenerEnabled&&s.statusDotOn]}/><Text style={[s.listenerText,listenerEnabled&&{color:p.green}]}>{listenerEnabled?'自動偵測中':'尚未開啟'}</Text></View>}</View>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {tab==='home'&&<>
          <Text style={s.eyebrow}>你的通知助理</Text>
          <Text style={s.heading}>重要訊息進來時，<Text style={{color:p.green}}>幫你先記住。</Text></Text>
          {Platform.OS==='android'&&!listenerEnabled&&<View style={s.heroCard}><View style={s.heroIcon}><Icon name="notifications-outline" size={34} color="white"/></View><Text style={s.heroTitle}>先開啟「通知存取」</Text><Text style={s.body}>開啟後，Messenger、簡訊與其他 App 的新通知會在手機本機判斷。偵測到日期、時間、截止或重要待辦時，就會提醒你並放進行程。</Text><Button label="開啟自動偵測" onPress={()=>void enableAuto()}/><Text style={s.caption}>你可以隨時在 Android 系統設定關閉。訊息內容不會上傳到我們的伺服器。</Text></View>}
          {Platform.OS==='android'&&listenerEnabled&&<View style={s.heroCard}><View style={s.row}><View style={[s.heroIcon,{width:48,height:48,borderRadius:16}]}><Icon name="shield-checkmark-outline" color="white"/></View><View style={s.flex}><Text style={s.heroTitle}>自動偵測已開啟</Text><Text style={s.caption}>{aiConfig.enabled?'你照常用 Messenger；候選通知會由 AI 理解語意。':'你照常用 Messenger；目前用手機本機規則判斷。'}</Text></View></View>{autoMessage?<Text style={s.info}>{autoMessage}</Text>:null}<View style={s.metricRow}><View style={s.metric}><Text style={s.metricNum}>{autoCount}</Text><Text style={s.caption}>自動整理中</Text></View><View style={s.metric}><Text style={s.metricNum}>{needsReview.length}</Text><Text style={s.caption}>時間待確認</Text></View></View></View>}
          {Platform.OS==='ios'&&<Text style={s.info}>iPhone 無法直接讀其他 App 的通知。你仍可從分享選單或截圖匯入；加入行事曆則可使用 iOS Calendar 權限。</Text>}
          <View style={s.dashboardCard}><View style={s.dashboardHead}><View><Text style={s.dashboardLabel}>今日摘要</Text><Text style={s.dashboardDate}>{new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'})}</Text></View><View style={s.summaryBadge}><Icon name="sparkles" size={15}/><Text style={s.summaryBadgeText}>{needsReview.length?`${needsReview.length} 則待確認`:'目前都整理好了'}</Text></View></View><View style={s.summaryGrid}><View style={s.summaryItem}><Text style={s.summaryBig}>{today.length}</Text><Text style={s.caption}>今天行程</Text></View><View style={s.summaryItem}><Text style={s.summaryBig}>{nextWeek.length}</Text><Text style={s.caption}>近期行程</Text></View><View style={s.summaryItem}><Text style={s.summaryBig}>{pending.filter(n=>n.importance==='urgent').length}</Text><Text style={s.caption}>緊急事項</Text></View></View><View style={s.quickRow}><Pressable style={s.quickAction} onPress={()=>setTab('calendar')}><View style={s.quickIcon}><Icon name="calendar-outline"/></View><View><Text style={s.quickTitle}>打開月曆</Text><Text style={s.caption}>查看每天行程</Text></View></Pressable><Pressable style={s.quickAction} onPress={startManual}><View style={s.quickIcon}><Icon name="add-outline"/></View><View><Text style={s.quickTitle}>快速新增</Text><Text style={s.caption}>手動補一筆</Text></View></Pressable></View></View>
          <Text style={s.sectionTitle}>今天</Text>{today.length?today.map(card):empty('今天目前沒有行程','有新的重要通知時，會自動出現在這裡。')}
          {needsReview.length>0&&<><Text style={s.sectionTitle}>需要你看一眼</Text><Text style={s.caption}>這些訊息看起來重要，但通知裡沒有明確時間。點開補一下就好。</Text>{needsReview.slice(0,3).map(card)}</>}
          {nextWeek.length>0&&<><Text style={s.sectionTitle}>接下來</Text>{nextWeek.map(card)}</>}
          <Button label="打開我的月曆" secondary onPress={()=>setTab('calendar')}/>
        </>}

        {tab==='calendar'&&<>
          <Text style={s.eyebrow}>月曆</Text><Text style={s.heading}>每天要做什麼，<Text style={{color:p.green}}>一眼就看到。</Text></Text>
          <MonthCalendar notices={pending} onOpen={setSelected} onAdd={addForDate}/>
        </>}

        {tab==='manual'&&<>
          <Text style={s.eyebrow}>備用輸入</Text><Text style={s.heading}>{draft.editing?'修改這則行程':'沒有通知也能手動加入。'}</Text>
          {!draft.editing&&<><Text style={s.body}>平常建議使用自動偵測。只有舊截圖、紙本公告或沒有跳通知的內容，才需要這裡。</Text><View style={s.choiceGrid}><Pressable style={s.choiceCard} onPress={pickImage}><Icon name="image-outline" size={28}/><Text style={s.cardTitle}>從截圖讀取</Text><Text style={s.caption}>適合舊通知或紙本照片</Text></Pressable><Pressable style={s.choiceCard} onPress={()=>void run(async()=>{const text=(await Clipboard.getStringAsync()).slice(0,20000);if(!text.trim())throw new Error('剪貼簿沒有文字。');const r=inferNotice(text);setDraft(d=>({...d,source:text,title:r.title,category:r.category,date:r.date,time:r.time,checks:r.checklist.join('\n')}));setWarnings(r.warnings);setMessage('已整理剪貼簿文字，請確認標題、日期與提醒後加入行程。')})}><Icon name="clipboard-outline" size={28}/><Text style={s.cardTitle}>貼上文字</Text><Text style={s.caption}>最快、最準的手動方式</Text></Pressable></View></>}
          {draft.image&&<Image accessibilityLabel="原始通知截圖" source={{uri:draft.image}} style={s.sourcePreview} resizeMode="contain"/>}
          <Field label="原始內容" value={draft.source} onChange={source=>patchDraft({source})} multiline placeholder="貼上通知、聊天內容、繳費或活動訊息…"/>
          <Button label="重新整理內容" secondary onPress={parse}/>
          {message?<Text style={s.info}>{message}</Text>:null}{warnings.slice(0,3).map(w=><Text key={w} style={s.warning}>{w}</Text>)}
          <Text style={s.sectionTitle}>只需要確認 3 件事</Text>
          <Field label="1. 這件事叫什麼？" value={draft.title} max={100} onChange={title=>patchDraft({title})} placeholder="例如：明天 19:00 和同學開會"/>
          <View style={s.row}><View style={{flex:1.35}}><Field label="2. 日期" value={draft.date} max={10} onChange={date=>patchDraft({date})} placeholder="YYYY-MM-DD"/></View><View style={s.flex}><Field label="時間" value={draft.time} max={5} onChange={time=>patchDraft({time})} placeholder="HH:mm"/></View></View>
          <Text style={s.label}>3. 要提前多久提醒？</Text><Chips<number|null> values={[[null,'不提醒'],[0,'準時'],[60,'1小時前'],[1440,'1天前']]} value={draft.remind} onChange={remind=>patchDraft({remind})}/>
          <Text style={s.label}>分類</Text><Chips values={CATEGORIES.map(c=>[c,c])} value={draft.category} onChange={category=>patchDraft({category})}/>
          <Field label="準備事項（選填，每行一項）" value={draft.checks} onChange={checks=>patchDraft({checks})} multiline placeholder={'帶證件\n回覆老師\n準備報告'}/>
          <Button label={draft.editing?'儲存修改':'加入行程'} disabled={busy} onPress={save}/>
          {!draft.editing&&<Button label="清空" secondary onPress={()=>{setDraft(blank());setWarnings([]);setMessage('')}}/>}
        </>}

        {tab==='settings'&&<>
          <Text style={s.eyebrow}>設定</Text><Text style={s.heading}>自動化與隱私</Text>
          <View style={s.card}><Text style={s.sectionTitle}>自動讀取通知</Text>{Platform.OS==='android'?<><Text style={s.body}>{listenerEnabled?'已開啟。新通知會在本機判斷重要性。':'尚未開啟，因此 App 不會看到 Messenger 等其他 App 的通知。'}</Text><Button label={listenerEnabled?'管理通知存取':'開啟通知存取'} secondary={listenerEnabled} onPress={()=>void enableAuto()}/><Text style={s.caption}>只有 Android 提供這項系統能力；你可在系統頁面隨時撤銷。</Text></>:<Text style={s.body}>iOS 不允許第三方 App 讀取其他 App 的通知內容，因此使用分享/截圖匯入。</Text>}</View>
          <View style={s.card}><View style={s.row}><View style={s.categoryDot}><Icon name="volume-low-outline"/></View><View style={s.flex}><Text style={s.sectionTitle}>提醒敏感度</Text><Text style={s.caption}>預設只在真的重要時打擾你</Text></View></View><Text style={s.body}>不重要的聊天與社群訊息只會靜默判斷，不會多跳一個通知。這裡只控制「剛收到通知時要不要立刻提醒」，行程本身的預約提醒仍照你設定的時間。</Text><Chips<api.AlertLevel> values={[["important","重要才提醒"],["balanced","平衡"],["all","較積極"]]} value={alertLevel} onChange={changeAlertLevel}/><Text style={s.caption}>{alertLevel==='important'?'建議：取消、改期、截止、付款、取件、會議等明確重要內容才會跳。':alertLevel==='balanced'?'明確日期＋行程語意通常會提醒。':'會顯示更多候選，可能比較吵。'}</Text></View>
          <View style={s.card}><View style={s.row}><View style={s.categoryDot}><Icon name="sparkles-outline"/></View><View style={s.flex}><Text style={s.sectionTitle}>AI 智慧辨識（可選）</Text><Text style={s.caption}>{aiConfig.enabled?'已開啟':'目前使用純本機模式'}</Text></View></View>
            <Text style={s.body}>{aiConfig.enabled?'候選通知的標題與文字會送到 OpenAI API，由模型自行選擇「建立行程、建立待辦、更新既有行程、要求確認、忽略」工具。':'關閉時完全不呼叫 OpenAI；仍可使用本機通知偵測與規則解析。'}</Text>
            <Text style={s.label}>模型</Text><Chips<AiModel> values={AI_MODELS} value={aiConfig.model} onChange={changeAiModel}/>
            <Field label="OpenAI API key" value={aiKeyDraft} onChange={setAiKeyDraft} secure max={220} placeholder={aiHasKey?'已安全儲存；貼入新 key 可更換':'貼上新的 sk-... API key'}/>
            <Button label="儲存這把 API key" secondary onPress={saveAiKey}/><Button label="從剪貼簿貼入並儲存" secondary onPress={pasteAndSaveAiKey}/>
            {aiHasKey&&<><Button label={aiConfig.enabled?'改用純本機模式':'開啟 AI 智慧辨識'} onPress={toggleAi}/><Button label="測試 AI 連線" secondary onPress={testAi}/><Button label="刪除手機中的 API key" secondary onPress={()=>void run(async()=>{await api.clearOpenAiKey();setAiHasKey(false);setAiConfig(c=>({...c,enabled:false}));setAiStatus('API key 已從手機安全儲存區刪除。')})}/></>}
            <Text style={s.info}>{aiStatus}</Text><Text style={s.caption}>AI 關閉時不會把通知送到 OpenAI。AI 開啟時只傳送候選通知/你選的截圖；API 回應設定 store=false。正式公開上架前應改用後端代理，不應在 App 內共用開發者 API key。</Text>
          </View>
          {Platform.OS==='android'&&<View style={s.card}><Text style={s.sectionTitle}>同步到手機行事曆</Text><Text style={s.body}>{autoCalendar?'已開啟：只有高信心且有明確日期時間的自動行程會寫入手機 Calendar。':'預設關閉，避免誤判直接污染你的 Google / Samsung Calendar。'}</Text><Button label={autoCalendar?'關閉自動同步':'開啟自動同步'} secondary={autoCalendar} onPress={toggleAutoCalendar}/><Text style={s.caption}>開啟時 Android 會要求日曆讀寫權限；中低信心項目仍只留在 App 內等你確認。</Text></View>}
          <View style={s.card}><Text style={s.sectionTitle}>提醒</Text><Text style={s.body}>{notificationStatus}</Text><Button label="允許提醒並重新排程" secondary onPress={()=>void run(async()=>setNotificationStatus(await api.syncReminders(live.current.notices,true)))}/><Button label="10 秒後測試提醒" secondary onPress={()=>void run(async()=>{await api.testReminder();notify('已安排 10 秒後測試提醒。')})}/></View>
          <View style={s.card}><Text style={s.sectionTitle}>手動輸入與備份</Text><Button label="手動新增一則" secondary onPress={startManual}/><Button label="匯出文字備份" secondary onPress={()=>void run(()=>api.exportBackup(live.current))}/><Button label="從備份還原" secondary onPress={restore}/></View>
          <View style={s.card}><Text style={s.sectionTitle}>隱私</Text><Text style={s.body}>{aiConfig.enabled?'AI 模式下，候選通知文字與你主動選取的截圖會傳送至 OpenAI API；App 要求 API 不保存 Response。關閉 AI 後，通知與 OCR 只在裝置端處理。':'目前是純本機模式：通知文字與截圖 OCR 不會傳送到 OpenAI。'}</Text><Button label="隱私權政策與使用說明" secondary onPress={()=>setPolicy(true)}/>{Platform.OS!=='web'&&<Button label="開啟 App 系統設定" secondary onPress={()=>void Linking.openSettings()}/>}<Text style={s.caption}>版本 1.3.0 · 自動偵測仍可能誤判，重要時間請以原始訊息為準。</Text></View>
          <Button label="刪除這台裝置的全部資料" danger onPress={()=>void run(async()=>{if(await confirm('永久刪除全部行程、原圖與提醒？')){api.clearDetectedNotifications();await api.erase();const next={...EMPTY,members:['我'],notices:[],welcomed:true};live.current=next;setData(next);setDraft(blank());setSelected(null);setTab('home')}})}/>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>

    <SafeAreaView edges={['bottom']} style={s.bottom}><View style={s.tabs}>{([
      ['home','首頁','home-outline'],['calendar','月曆','calendar-outline'],['manual','新增','add-circle-outline'],['settings','設定','settings-outline']
    ] as const).map(([key,label,icon])=><Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={s.tab}><Icon name={icon} color={tab===key?p.green:p.muted} size={24}/><Text style={[s.tabText,tab===key&&{color:p.green,fontWeight:'700'}]}>{label}</Text></Pressable>)}</View></SafeAreaView>

    <Modal visible={!!notice} onRequestClose={()=>setSelected(null)} animationType="slide"><SafeAreaView style={s.root}><View style={s.modalBar}><Text style={s.label}>行程詳情</Text><Button label="關閉" secondary onPress={()=>setSelected(null)}/></View>{notice&&<ScrollView contentContainerStyle={s.content}>
      {notice.importance==='urgent'&&<Text style={s.warning}>這是一則緊急事項，請優先確認原始訊息與時間。</Text>}{isAuto(notice)&&<Text style={s.info}>{notice.aiConfidence!==undefined?`AI 自動整理 · 信心 ${Math.round(notice.aiConfidence*100)}%${notice.needsReview?' · 需要確認':''}`:'這則是從手機通知自動整理的。請確認時間是否符合原訊息。'}</Text>}
      <Text style={s.eyebrow}>{notice.category}{isAuto(notice)?' · 自動偵測':''}</Text><Text style={s.heading}>{notice.title}</Text><Text style={s.detailDate}>{fmt(notice.dueAt)}{notice.endAt?` ～ ${fmt(notice.endAt)}`:''}</Text>{notice.location&&<Text style={s.body}>📍 {notice.location}</Text>}{notice.aiAction&&<Text style={s.caption}>AI 判斷：{notice.aiAction}</Text>}
      {!notice.dueAt&&<Button label="補上時間" onPress={()=>edit(notice)}/>}<Button label={notice.done?'重新開啟':'標記完成'} onPress={()=>toggle(notice)}/><Button label="編輯行程" secondary onPress={()=>edit(notice)}/>{notice.dueAt&&<Button label="加入手機行事曆" secondary onPress={()=>void run(async()=>{if(Platform.OS==='android'){if(!autoCalendar){const ok=await api.setAutoCalendarEnabled(true);setAutoCalendar(ok);if(!ok)throw new Error('沒有取得行事曆權限。')}await api.addToSystemCalendar(notice,`manual-${notice.id}`);notify('已加入手機行事曆。')}else await api.exportCalendar(notice)})}/>}<Button label="分享" secondary onPress={()=>void run(()=>api.shareNotice(notice))}/>
      {notice.checklist.length>0&&<><Text style={s.sectionTitle}>待辦</Text>{notice.checklist.map(c=><Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{checked:c.done}} style={s.checkRow} onPress={()=>void run(async()=>commit({...live.current,notices:live.current.notices.map(n=>n.id===notice.id?updateNotice(n,{checklist:n.checklist.map(x=>x.id===c.id?{...x,done:!x.done}:x)}):n)}))}><Icon name={c.done?'checkbox':'square-outline'}/><Text style={[s.body,s.flex,c.done&&{textDecorationLine:'line-through',color:p.muted}]}>{c.text}</Text></Pressable>)}</>}
      <Text style={s.sectionTitle}>原始訊息</Text><Text selectable style={s.sourceText}>{notice.source.replace(/\n\[偵測ID:[^\]]+\]$/,'')}</Text>{notice.sourceImage&&<Image source={{uri:notice.sourceImage}} style={s.sourceFull} resizeMode="contain"/>}<Button label="刪除這則行程" danger onPress={()=>remove(notice)}/>
    </ScrollView>}</SafeAreaView></Modal>

    <Modal visible={!data.welcomed&&!policy} animationType="fade" onRequestClose={()=>{}}><SafeAreaView style={s.root}><ScrollView contentContainerStyle={[s.content,{paddingTop:42}]}>
      <View style={s.welcomeIcon}><Icon name="notifications-outline" size={48} color="white"/></View><Text style={s.eyebrow}>第一次只做一件事</Text><Text style={s.heading}>讓重要通知，<Text style={{color:p.green}}>自己變成行程。</Text></Text>
      <View style={s.stepCard}><Text style={s.stepNum}>1</Text><View style={s.flex}><Text style={s.cardTitle}>開啟通知存取</Text><Text style={s.body}>{Platform.OS==='android'?'Android 會把新通知文字交給生活通知管家在本機判斷。':'iPhone 不提供其他 App 通知內容，因此使用分享或截圖。'}</Text></View></View>
      <View style={s.stepCard}><Text style={s.stepNum}>2</Text><View style={s.flex}><Text style={s.cardTitle}>照常使用手機</Text><Text style={s.body}>看到「明天 7 點開會」、「9/15 前繳費」、「包裹請於週五前領取」這類內容時，App 會自動抓出來。</Text></View></View>
      <View style={s.stepCard}><Text style={s.stepNum}>3</Text><View style={s.flex}><Text style={s.cardTitle}>收到提醒，行程已整理</Text><Text style={s.body}>高信心內容直接排進 App 行程；時間不完整的則放到「需要你看一眼」。之後可在設定選擇是否開啟 AI 語意辨識。</Text></View></View>
      {Platform.OS==='android'?<Button label="開始：開啟自動偵測" onPress={()=>void run(async()=>{await commit({...live.current,welcomed:true});await api.notificationAccess(true);api.openNotificationListenerSettings()})}/>:<Button label="開始使用" onPress={()=>void run(()=>commit({...live.current,welcomed:true}))}/>}<Button label="先閱讀隱私說明" secondary onPress={()=>setPolicy(true)}/>
    </ScrollView></SafeAreaView></Modal>

    <Modal visible={policy} onRequestClose={()=>setPolicy(false)} animationType="slide"><SafeAreaView style={s.root}><View style={s.modalBar}><Text style={s.label}>隱私與使用說明</Text><Button label="關閉" secondary onPress={()=>setPolicy(false)}/></View><ScrollView contentContainerStyle={s.content}><Text style={s.heading}>通知內容留在你的手機。</Text><Text selectable style={s.body}>{privacy(Constants.expoConfig?.extra?.supportEmail)}</Text></ScrollView></SafeAreaView></Modal>
    {busy&&<View style={s.busy} pointerEvents="auto"><ActivityIndicator color="white"/><Text style={{color:'white'}}>正在處理…</Text></View>}
  </SafeAreaView>;
}
