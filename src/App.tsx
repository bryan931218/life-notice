import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Switch,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as FS from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {CATEGORIES,EMPTY,dateFields,id,inferLiveNotification,inferNotice,parseDate,updateNotice,validateBackup,type Category,type Notice,type State} from './domain';
import {analyzeNotificationWithAI,analyzeScreenshotWithAI,type AiDecision} from './ai';
import * as api from './services';
import {Button,Chips,Field,Icon,confirm,notify,p,s} from './ui';
import {MonthCalendar} from './calendar-ui';
import {privacy} from './privacy';

type Tab='home'|'calendar'|'manual'|'settings';
type Draft={title:string;source:string;image?:string;category:Category;date:string;time:string;assignee:string;checks:string;remind:number|null;editing?:string};
const blank=():Draft=>({title:'',source:'',category:'生活',date:'',time:'',assignee:'我',checks:'',remind:60});
const fmt=(d:string|null)=>d?new Date(d).toLocaleString('zh-TW',{month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'}):'時間待確認';
const isAuto=(n:Notice)=>/^\[(?:AI)?自動偵測｜/.test(n.source);
const stripDetectedId=(source:string)=>source.replace(/\n\[偵測ID:[^\]]+\]$/,'');

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
  const [listenerEnabled,setListenerEnabled]=useState(false);
  const [autoCalendar,setAutoCalendar]=useState(false);
  const [aiConfig,setAiConfig]=useState<api.AiSettings>({enabled:false,model:'gpt-5.6-luna'});
  const [aiHasKey,setAiHasKey]=useState(false);
  const [aiKeyDraft,setAiKeyDraft]=useState('');
  const [showAiKey,setShowAiKey]=useState(false);
  const [advanced,setAdvanced]=useState(false);
  const [detailMore,setDetailMore]=useState(false);
  const [dataMore,setDataMore]=useState(false);
  const lock=useRef(false);
  const scroll=useRef<ScrollView>(null);
  const notice=data.notices.find(n=>n.id===selected);

  const commit=async(next:State,permission=false)=>{
    await api.persist(next);live.current=next;setData(next);
    try{await api.syncReminders(next.notices,permission)}catch{}
  };

  const importDetected=async(base?:State)=>{
    if(!api.notificationListenerSupported())return base??live.current;
    setListenerEnabled(api.notificationListenerEnabled());
    const calendarEnabled=await api.getAutoCalendarEnabled();setAutoCalendar(calendarEnabled);
    let settings=await api.getAiSettings();
    let key=settings.enabled?await api.getOpenAiKey():null;
    if(settings.enabled&&!key){settings={...settings,enabled:false};await api.setAiSettings(settings)}
    setAiConfig(settings);setAiHasKey(!!(await api.getOpenAiKey()));
    const detected=api.getDetectedNotifications().slice(0,12);
    if(!detected.length)return base??live.current;
    let next=base??live.current;
    const seen=new Set(next.notices.map(n=>n.source.match(/\[偵測ID:([^\]]+)\]/)?.[1]).filter(Boolean));
    const processed:string[]=[];let changed=false;
    for(const item of detected){
      if(seen.has(item.id)){processed.push(item.id);continue}
      const raw=[item.title,item.text].filter(Boolean).join('\n').trim();
      if(!raw){processed.push(item.id);continue}
      let made:Notice|null=null;
      if(settings.enabled&&key){
        try{
          const decision=await analyzeNotificationWithAI({apiKey:key,model:settings.model,appName:item.appName,title:item.title,text:item.text,receivedAt:item.receivedAt,existing:next.notices});
          if(decision.type==='ignore_notification'){processed.push(item.id);continue}
          if(decision.type==='update_existing_event'){
            const old=next.notices.find(n=>n.id===decision.eventId);
            if(old){
              const source=`${old.source}\n\n[AI 更正來源｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`;
              next={...next,notices:next.notices.map(n=>n.id===old.id?updateNotice(n,{title:decision.title??n.title,dueAt:decision.startAt??n.dueAt,endAt:decision.endAt??n.endAt,location:decision.location??n.location,remindMinutes:decision.reminderMinutes??n.remindMinutes,source,needsReview:decision.confidence<0.9,aiConfidence:decision.confidence,aiAction:decision.reason,importance:decision.importance}):n)};
              changed=true;processed.push(item.id);continue;
            }
          }
          made=aiNotice(decision,item,raw);
        }catch{}
      }
      if(!made){
        const inferred=inferLiveNotification(raw,item.receivedAt);
        if(!inferred.actionable){processed.push(item.id);continue}
        let dueAt:string|null=null;try{dueAt=inferred.date&&inferred.time?parseDate(inferred.date,inferred.time):null}catch{}
        const title=(inferred.title||item.text.split(/\n/).find(Boolean)||item.title||'重要事項').slice(0,100);
        made={id:id(),title,source:`[自動偵測｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`,category:inferred.category,dueAt,needsReview:!dueAt,assignee:'我',checklist:inferred.checklist.map(text=>({id:id(),text,done:false})),done:false,remindMinutes:dueAt&&item.score>=9?60:null,createdAt:new Date(item.receivedAt).toISOString(),updatedAt:new Date().toISOString(),history:[],importance:item.score>=12?'urgent':item.score>=9?'important':'normal'};
      }
      next={...next,notices:[made,...next.notices]};changed=true;
      const trusted=made.dueAt&&!made.needsReview&&(made.aiConfidence!==undefined?made.aiConfidence>=0.9:item.score>=9);
      if(calendarEnabled&&trusted){try{await api.addToSystemCalendar(made,`detected-${item.id}`)}catch{}}
      processed.push(item.id);
    }
    if(changed){await api.persist(next);live.current=next;setData(next);try{await api.syncReminders(next.notices)}catch{}}
    if(processed.length)api.markDetectedNotificationsProcessed(processed);
    return next;
  };

  const reload=async()=>{
    try{
      const d=await api.load();live.current=d;setData(d);setLoadError('');setReady(true);
      setListenerEnabled(api.notificationListenerEnabled());setAutoCalendar(await api.getAutoCalendarEnabled());
      const cfg=await api.getAiSettings();setAiConfig(cfg);setAiHasKey(await api.hasOpenAiKey());
      const merged=await importDetected(d);void api.syncReminders(merged.notices).catch(()=>{});
    }catch{setLoadError('本機資料無法讀取。請重新載入。')}
  };

  useEffect(()=>{
    void reload();
    const app=AppState.addEventListener('change',state=>{if(state==='active'){setListenerEnabled(api.notificationListenerEnabled());void importDetected()}});
    const timer=setInterval(()=>{if(AppState.currentState==='active')void importDetected()},15000);
    let response:ReturnType<typeof Notifications.addNotificationResponseReceivedListener>|undefined;
    if(Platform.OS!=='web'){
      response=Notifications.addNotificationResponseReceivedListener(r=>{const n=r.notification.request.content.data?.noticeId;if(typeof n==='string')setSelected(n)});
      Notifications.getLastNotificationResponseAsync().then(r=>{const n=r?.notification.request.content.data?.noticeId;if(typeof n==='string')setSelected(n)}).catch(()=>{});
    }
    return()=>{app.remove();clearInterval(timer);response?.remove()};
  },[]);
  useEffect(()=>{scroll.current?.scrollTo({y:0,animated:false});setAdvanced(false)},[tab]);
  useEffect(()=>{if(!selected)setDetailMore(false)},[selected]);

  const run=async(job:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await job()}catch(e){notify(e instanceof Error?e.message:'操作失敗，請稍後再試。')}finally{lock.current=false;setBusy(false)}};
  const patchDraft=(patch:Partial<Draft>)=>setDraft(d=>({...d,...patch}));
  const startManual=()=>{setDraft(blank());setWarnings([]);setMessage('');setAdvanced(false);setTab('manual')};
  const addForDate=(date:string)=>{setDraft({...blank(),date});setWarnings([]);setMessage('');setAdvanced(false);setTab('manual')};

  const applyInference=(source:string)=>{
    const r=inferNotice(source);setDraft(d=>({...d,source,title:r.title,category:r.category,date:r.date,time:r.time,checks:r.checklist.join('\n')}));setWarnings(r.warnings.slice(0,2));
  };
  const pasteText=()=>void run(async()=>{const text=(await Clipboard.getStringAsync()).slice(0,20000);if(!text.trim())throw new Error('剪貼簿沒有文字。');applyInference(text);setMessage('已整理剪貼簿內容。')});
  const pickImage=()=>void run(async()=>{
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1,allowsEditing:false});if(result.canceled)return;
    const asset=result.assets[0],uri=asset.uri;patchDraft({image:uri});
    const settings=await api.getAiSettings(),key=settings.enabled?await api.getOpenAiKey():null;
    if(settings.enabled&&key&&Platform.OS!=='web'){
      try{
        const base64=await FS.readAsStringAsync(uri,{encoding:FS.EncodingType.Base64});
        const decision=await analyzeScreenshotWithAI({apiKey:key,model:settings.model,base64,mimeType:asset.mimeType||'image/jpeg',receivedAt:Date.now(),existing:live.current.notices});
        let raw='';try{raw=await api.recognize(uri)}catch{}
        if(decision.type==='ignore_notification'){setDraft(d=>({...d,image:uri,source:raw}));setMessage('AI 判斷這張圖沒有需要建立的行程。');return}
        if(decision.type==='update_existing_event'){const old=live.current.notices.find(n=>n.id===decision.eventId);if(old){edit(old);setMessage('已找到對應的既有行程。')}return}
        const when=decision.type==='create_calendar_event'?decision.startAt:decision.type==='create_task'?decision.dueAt:decision.proposedAt;
        const f=dateFields(when),checks=decision.type==='ask_user'?[decision.question]:decision.checklist;
        setDraft(d=>({...d,image:uri,source:raw,title:decision.title,category:decision.category,date:f.date,time:f.time,checks:checks.join('\n'),remind:decision.type==='create_calendar_event'?decision.reminderMinutes:decision.type==='create_task'?decision.reminderMinutes:null}));
        setWarnings(decision.type==='ask_user'?[decision.question]:[]);setMessage('AI 已整理截圖。');return;
      }catch{}
    }
    const text=await api.recognize(uri);applyInference(text);setDraft(d=>({...d,image:uri}));setMessage('已整理截圖。');
  });

  const save=()=>void run(async()=>{
    const title=draft.title.trim();if(!title)throw new Error('請輸入行程名稱。');
    const dueAt=parseDate(draft.date,draft.time);
    let sourceImage:string|undefined=draft.image;
    if(sourceImage&&!sourceImage.startsWith(FS.documentDirectory??'__none__'))sourceImage=await api.keepImage(sourceImage);
    const checks=draft.checks.split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,50).map(text=>({id:id(),text,done:false}));
    const now=new Date().toISOString();let next:State;
    if(draft.editing){
      const old=live.current.notices.find(n=>n.id===draft.editing);if(!old)throw new Error('找不到要編輯的行程。');
      next={...live.current,notices:live.current.notices.map(n=>n.id===old.id?updateNotice(n,{title,source:draft.source.trim(),sourceImage,category:draft.category,dueAt,assignee:'我',checklist:checks,remindMinutes:draft.remind}):n)};
    }else{
      const item:Notice={id:id(),title,source:draft.source.trim(),sourceImage,category:draft.category,dueAt,assignee:'我',checklist:checks,done:false,remindMinutes:draft.remind,createdAt:now,updatedAt:now,history:[]};
      next={...live.current,notices:[item,...live.current.notices]};
    }
    await commit(next,true);setDraft(blank());setWarnings([]);setMessage('');setTab('home');
  });
  const edit=(n:Notice)=>{const f=dateFields(n.dueAt);setDraft({title:n.title,source:n.source,image:n.sourceImage,category:n.category,date:f.date,time:f.time,assignee:'我',checks:n.checklist.map(c=>c.text).join('\n'),remind:n.remindMinutes,editing:n.id});setWarnings([]);setMessage('');setAdvanced(false);setSelected(null);setTab('manual')};
  const toggle=(n:Notice)=>void run(async()=>commit({...live.current,notices:live.current.notices.map(x=>x.id===n.id?updateNotice(x,{done:!x.done}):x)}));
  const remove=(n:Notice)=>void run(async()=>{if(!(await confirm(`刪除「${n.title}」？`)))return;await api.removeImage(n.sourceImage);await commit({...live.current,notices:live.current.notices.filter(x=>x.id!==n.id)});setSelected(null)});
  const restore=()=>void run(async()=>{const result=await DocumentPicker.getDocumentAsync({type:'application/json',copyToCacheDirectory:true});if(result.canceled)return;const raw=await FS.readAsStringAsync(result.assets[0].uri);const restored=validateBackup(JSON.parse(raw));if(!(await confirm(`用備份中的 ${restored.notices.length} 則行程取代目前資料？`)))return;await commit(restored);notify('已還原備份。')});
  const enableAuto=()=>void run(async()=>{if(Platform.OS!=='android')throw new Error('iPhone 無法讀取其他 App 的通知內容。');await api.notificationAccess(true);api.openNotificationListenerSettings()});
  const toggleAutoCalendar=()=>void run(async()=>{const next=await api.setAutoCalendarEnabled(!autoCalendar);setAutoCalendar(next);if(!next&&!autoCalendar)throw new Error('沒有取得行事曆權限。')});
  const toggleAi=()=>void run(async()=>{
    if(!aiConfig.enabled&&!await api.hasOpenAiKey()){setShowAiKey(true);return}
    const next={...aiConfig,enabled:!aiConfig.enabled};await api.setAiSettings(next);setAiConfig(await api.getAiSettings());
  });
  const saveAiKey=()=>void run(async()=>{if(!aiKeyDraft.trim())throw new Error('請貼上新的 OpenAI API key。');await api.saveOpenAiKey(aiKeyDraft);setAiHasKey(true);setAiKeyDraft('');const next={...aiConfig,enabled:true};await api.setAiSettings(next);setAiConfig(await api.getAiSettings());setShowAiKey(false)});
  const setupQuickCapture=()=>void run(async()=>{
    let calendarOk=autoCalendar;
    if(!calendarOk){calendarOk=await api.setAutoCalendarEnabled(true);setAutoCalendar(calendarOk)}
    if(!calendarOk)throw new Error('快速擷取需要行事曆權限。');
    const requested=api.requestQuickCaptureTile();
    if(!requested)notify('請打開 Android「快速設定」的編輯畫面，加入「擷取行程」。');
  });

  const pending=data.notices.filter(n=>!n.done);
  const sorted=[...pending].sort((a,b)=>(a.dueAt?Date.parse(a.dueAt):Number.MAX_SAFE_INTEGER)-(b.dueAt?Date.parse(b.dueAt):Number.MAX_SAFE_INTEGER));
  const todayKey=new Date().toDateString();
  const today=sorted.filter(n=>n.dueAt&&new Date(n.dueAt).toDateString()===todayKey);
  const upcoming=sorted.filter(n=>n.dueAt&&new Date(n.dueAt).toDateString()!==todayKey&&Date.parse(n.dueAt)>=Date.now()-3600000).slice(0,5);
  const needsReview=sorted.filter(n=>isAuto(n)&&(!!n.needsReview||!n.dueAt)).slice(0,4);

  const card=(n:Notice)=><Pressable key={n.id} accessibilityRole="button" onPress={()=>setSelected(n.id)} style={s.card}>
    <View style={s.row}><View style={s.categoryDot}><Icon name={n.importance==='urgent'?'alert-circle-outline':isAuto(n)?'sparkles-outline':'calendar-outline'}/></View><View style={s.flex}><Text numberOfLines={2} style={s.cardTitle}>{n.title}</Text><Text style={s.caption}>{fmt(n.dueAt)}{n.location?` · ${n.location}`:''}</Text></View><Icon name="chevron-forward" color={p.muted} size={18}/></View>
  </Pressable>;
  const empty=(text:string)=><View style={[s.empty,{paddingVertical:22}]}><Icon name="checkmark-circle-outline" size={28}/><Text style={s.emptyTitle}>{text}</Text></View>;

  if(!ready)return <SafeAreaView style={[s.root,{alignItems:'center',justifyContent:'center'}]}><ActivityIndicator/></SafeAreaView>;
  if(loadError)return <SafeAreaView style={s.root}><View style={s.content}><Text style={s.warning}>{loadError}</Text><Button label="重新載入" onPress={()=>void reload()}/></View></SafeAreaView>;

  const screenTitle=tab==='home'?'今天':tab==='calendar'?'月曆':tab==='settings'?'設定':draft.editing?'編輯行程':'新增行程';

  return <SafeAreaView style={s.root}>
    <StatusBar style="dark"/>
    <View style={s.top}>
      {tab==='manual'?<Pressable accessibilityRole="button" onPress={()=>setTab('home')} style={s.row}><Icon name="chevron-back"/><Text style={s.brand}>返回</Text></Pressable>:<View style={s.row}><View style={s.logo}><Icon name="calendar" color="white" size={19}/></View><Text style={s.brand}>生活通知管家</Text></View>}
      {tab!=='manual'&&Platform.OS==='android'?<View style={s.listenerPill}><View style={[s.statusDot,listenerEnabled&&s.statusDotOn]}/><Text style={s.listenerText}>{listenerEnabled?'運作中':'未啟用'}</Text></View>:null}
    </View>

    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {tab==='home'&&<>
          <View style={[s.row,{justifyContent:'space-between',alignItems:'flex-end',marginBottom:14}]}><View><Text style={[s.heading,{marginBottom:2}]}>今天</Text><Text style={s.caption}>{new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'})}</Text></View></View>
          {Platform.OS==='android'&&!listenerEnabled&&<Pressable onPress={()=>void enableAuto()} style={[s.card,{paddingVertical:14}]}><View style={s.row}><View style={s.categoryDot}><Icon name="notifications-outline"/></View><View style={s.flex}><Text style={s.cardTitle}>開啟通知存取</Text><Text style={s.caption}>自動整理重要行程</Text></View><Text style={{color:p.green,fontWeight:'700'}}>開啟</Text></View></Pressable>}
          {needsReview.length>0&&<><Text style={s.sectionTitle}>待確認</Text>{needsReview.map(card)}</>}
          <Text style={s.sectionTitle}>行程</Text>{today.length?today.map(card):empty('今天沒有行程')}
          {upcoming.length>0&&<><Text style={s.sectionTitle}>接下來</Text>{upcoming.map(card)}</>}
        </>}

        {tab==='calendar'&&<MonthCalendar notices={pending} onOpen={setSelected} onAdd={addForDate}/>} 

        {tab==='manual'&&<>
          <Text style={[s.heading,{marginBottom:12}]}>{screenTitle}</Text>
          {!draft.editing&&<View style={[s.row,{marginBottom:8}]}><View style={s.flex}><Button label="截圖" secondary onPress={pickImage}/></View><View style={s.flex}><Button label="貼上文字" secondary onPress={pasteText}/></View></View>}
          {draft.image&&<Image accessibilityLabel="原始截圖" source={{uri:draft.image}} style={s.sourcePreview} resizeMode="contain"/>}
          {message?<Text style={s.info}>{message}</Text>:null}{warnings.map(w=><Text key={w} style={s.warning}>{w}</Text>)}
          <Field label="名稱" value={draft.title} max={100} onChange={title=>patchDraft({title})} placeholder="例如：系上會議"/>
          <View style={s.row}><View style={{flex:1.35}}><Field label="日期" value={draft.date} max={10} onChange={date=>patchDraft({date})} placeholder="YYYY-MM-DD"/></View><View style={s.flex}><Field label="時間" value={draft.time} max={5} onChange={time=>patchDraft({time})} placeholder="HH:mm"/></View></View>
          <Text style={s.label}>提醒</Text><Chips<number|null> values={[[null,'不提醒'],[0,'準時'],[60,'1 小時前'],[1440,'1 天前']]} value={draft.remind} onChange={remind=>patchDraft({remind})}/>
          <Pressable accessibilityRole="button" onPress={()=>setAdvanced(v=>!v)} style={[s.card,{paddingVertical:13,marginTop:8}]}><View style={s.row}><Icon name="options-outline"/><Text style={[s.cardTitle,s.flex,{marginBottom:0}]}>更多選項</Text><Icon name={advanced?'chevron-up':'chevron-down'} color={p.muted}/></View></Pressable>
          {advanced&&<><Text style={s.label}>分類</Text><Chips values={CATEGORIES.map(c=>[c,c] as const)} value={draft.category} onChange={category=>patchDraft({category})}/><Field label="準備事項" value={draft.checks} onChange={checks=>patchDraft({checks})} multiline placeholder="每行一項"/><Field label="原始內容" value={draft.source} onChange={source=>patchDraft({source})} multiline placeholder="通知或訊息原文"/></>}
          <Button label={draft.editing?'儲存':'加入行程'} disabled={busy} onPress={save}/>
        </>}

        {tab==='settings'&&<>
          <Text style={[s.heading,{marginBottom:16}]}>設定</Text>
          {Platform.OS==='android'&&<View style={s.card}><SettingRow icon="notifications-outline" title="自動偵測" subtitle={listenerEnabled?'已開啟':'未開啟'} action={<Button label={listenerEnabled?'管理':'開啟'} secondary onPress={()=>void enableAuto()}/>}/></View>}
          <View style={s.card}><SettingRow icon="sparkles-outline" title="AI 辨識" subtitle={aiConfig.enabled?'已開啟':'關閉'} action={<Switch value={aiConfig.enabled} onValueChange={()=>void toggleAi()}/>}/>{showAiKey||(!aiHasKey&&!aiConfig.enabled)?<><Field label="OpenAI API key" value={aiKeyDraft} onChange={setAiKeyDraft} secure max={220} placeholder="貼上新的 sk-... key"/><Button label="儲存並開啟 AI" onPress={saveAiKey}/></>:null}</View>
          {Platform.OS==='android'&&<View style={s.card}><SettingRow icon="calendar-outline" title="同步手機行事曆" subtitle={autoCalendar?'已開啟':'關閉'} action={<Switch value={autoCalendar} onValueChange={()=>void toggleAutoCalendar()}/>}/></View>}
          {Platform.OS==='android'&&<Pressable accessibilityRole="button" onPress={()=>void setupQuickCapture()} style={s.card}><SettingRow icon="flash-outline" title="快速擷取" subtitle="加入 Android 快速設定" action={<Icon name="chevron-forward" color={p.muted}/>}/></Pressable>}
          <Pressable accessibilityRole="button" onPress={()=>setDataMore(v=>!v)} style={s.card}><SettingRow icon="shield-checkmark-outline" title="資料與隱私" subtitle="備份、API key、刪除資料" action={<Icon name={dataMore?'chevron-up':'chevron-down'} color={p.muted}/>}/></Pressable>
          {dataMore&&<View style={s.card}><Button label="匯出備份" secondary onPress={()=>void run(()=>api.exportBackup(live.current))}/><Button label="還原備份" secondary onPress={restore}/><Button label="隱私權說明" secondary onPress={()=>setPolicy(true)}/>{aiHasKey&&<Button label="移除 API key" secondary onPress={()=>void run(async()=>{await api.clearOpenAiKey();setAiHasKey(false);setAiConfig(await api.getAiSettings());setShowAiKey(false)})}/>}<Text style={[s.caption,{textAlign:'center',marginVertical:8}]}>版本 1.4.0</Text><Button label="刪除全部資料" danger onPress={()=>void run(async()=>{if(await confirm('永久刪除這台裝置的全部行程與設定？')){api.clearDetectedNotifications();await api.erase();const next={...EMPTY,members:['我'],notices:[],welcomed:true};live.current=next;setData(next);setSelected(null);setTab('home')}})}/></View>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>

    {tab!=='manual'&&<><Pressable accessibilityRole="button" accessibilityLabel="新增行程" onPress={startManual} style={{position:'absolute',right:20,bottom:82,width:56,height:56,borderRadius:18,backgroundColor:p.green,alignItems:'center',justifyContent:'center',shadowColor:'#173B34',shadowOpacity:.2,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:7}}><Icon name="add" size={28} color="white"/></Pressable><SafeAreaView edges={['bottom']} style={s.bottom}><View style={s.tabs}>{([['home','今天','today-outline'],['calendar','月曆','calendar-outline'],['settings','設定','settings-outline']] as const).map(([key,label,icon])=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={s.tab}><Icon name={icon} color={tab===key?p.green:p.muted} size={23}/><Text style={[s.tabText,tab===key&&{color:p.green,fontWeight:'700'}]}>{label}</Text></Pressable>)}</View></SafeAreaView></>}

    <Modal visible={!!notice} onRequestClose={()=>setSelected(null)} animationType="slide"><SafeAreaView style={s.root}><View style={s.modalBar}><Pressable onPress={()=>setSelected(null)} style={s.row}><Icon name="chevron-back"/><Text style={s.brand}>返回</Text></Pressable></View>{notice&&<ScrollView contentContainerStyle={s.content}>
      {notice.needsReview&&<Text style={s.warning}>時間需要確認</Text>}
      <Text style={[s.heading,{marginBottom:8}]}>{notice.title}</Text><Text style={s.detailDate}>{fmt(notice.dueAt)}{notice.endAt?` ～ ${fmt(notice.endAt)}`:''}</Text>{notice.location&&<Text style={s.body}>📍 {notice.location}</Text>}
      {notice.checklist.length>0&&<>{notice.checklist.map(c=><Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{checked:c.done}} style={s.checkRow} onPress={()=>void run(async()=>commit({...live.current,notices:live.current.notices.map(n=>n.id===notice.id?updateNotice(n,{checklist:n.checklist.map(x=>x.id===c.id?{...x,done:!x.done}:x)}):n)}))}><Icon name={c.done?'checkbox':'square-outline'}/><Text style={[s.body,s.flex,c.done&&{textDecorationLine:'line-through',color:p.muted}]}>{c.text}</Text></Pressable>)}</>}
      <Button label={notice.done?'重新開啟':'完成'} onPress={()=>toggle(notice)}/><View style={s.row}><View style={s.flex}><Button label="編輯" secondary onPress={()=>edit(notice)}/></View>{notice.dueAt&&<View style={s.flex}><Button label="加入行事曆" secondary onPress={()=>void run(async()=>{if(Platform.OS==='android'){if(!autoCalendar){const ok=await api.setAutoCalendarEnabled(true);setAutoCalendar(ok);if(!ok)throw new Error('沒有取得行事曆權限。')}await api.addToSystemCalendar(notice,`manual-${notice.id}`);notify('已加入行事曆。')}else await api.exportCalendar(notice)})}/></View>}</View>
      <Pressable onPress={()=>setDetailMore(v=>!v)} style={[s.card,{marginTop:12,paddingVertical:13}]}><View style={s.row}><Text style={[s.cardTitle,s.flex,{marginBottom:0}]}>更多</Text><Icon name={detailMore?'chevron-up':'chevron-down'} color={p.muted}/></View></Pressable>
      {detailMore&&<><Button label="分享" secondary onPress={()=>void run(()=>api.shareNotice(notice))}/>{notice.source?<><Text style={s.sectionTitle}>原始內容</Text><Text selectable style={s.sourceText}>{stripDetectedId(notice.source)}</Text></>:null}{notice.sourceImage&&<Image source={{uri:notice.sourceImage}} style={s.sourceFull} resizeMode="contain"/>}<Button label="刪除行程" danger onPress={()=>remove(notice)}/></>}
    </ScrollView>}</SafeAreaView></Modal>

    <Modal visible={!data.welcomed&&!policy} animationType="fade" onRequestClose={()=>{}}><SafeAreaView style={s.root}><View style={[s.content,{flex:1,justifyContent:'center'}]}><View style={s.welcomeIcon}><Icon name="calendar-outline" size={44} color="white"/></View><Text style={s.heading}>自動整理重要通知</Text><Text style={[s.body,{marginBottom:22}]}>{Platform.OS==='android'?'授權通知存取後，只有重要行程、期限與異動會提醒你；一般聊天不打擾。':'iPhone 版可用截圖或貼上文字快速建立行程。'}</Text>{Platform.OS==='android'?<Button label="開啟通知存取" onPress={()=>void run(async()=>{await commit({...live.current,welcomed:true});await api.notificationAccess(true);api.openNotificationListenerSettings()})}/>:<Button label="開始使用" onPress={()=>void run(()=>commit({...live.current,welcomed:true}))}/>}<Button label="稍後" secondary onPress={()=>void run(()=>commit({...live.current,welcomed:true}))}/><Pressable onPress={()=>setPolicy(true)}><Text style={[s.caption,{textAlign:'center',padding:12}]}>隱私權說明</Text></Pressable></View></SafeAreaView></Modal>

    <Modal visible={policy} onRequestClose={()=>setPolicy(false)} animationType="slide"><SafeAreaView style={s.root}><View style={s.modalBar}><Text style={s.brand}>隱私權說明</Text><Pressable onPress={()=>setPolicy(false)}><Icon name="close"/></Pressable></View><ScrollView contentContainerStyle={s.content}><Text selectable style={s.body}>{privacy(Constants.expoConfig?.extra?.supportEmail)}</Text></ScrollView></SafeAreaView></Modal>
    {busy&&<View style={s.busy} pointerEvents="auto"><ActivityIndicator color="white"/></View>}
  </SafeAreaView>;
}

function SettingRow({icon,title,subtitle,action}:{icon:React.ComponentProps<typeof Icon>['name'];title:string;subtitle:string;action:React.ReactNode}){
  return <View style={s.row}><View style={s.categoryDot}><Icon name={icon}/></View><View style={s.flex}><Text style={[s.cardTitle,{marginBottom:1}]}>{title}</Text><Text style={s.caption}>{subtitle}</Text></View><View>{action}</View></View>;
}
