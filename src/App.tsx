import {displayDay,displayTime} from './calendar';
import {SettingsPanel} from './settings-panel';
import {HomeDashboard} from './home-ui';
import {EventEditor,DetailHeading,type Draft} from './editor-ui';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Image,KeyboardAvoidingView,Linking,Modal,Platform,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as FS from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {EMPTY,dateFields,id,inferLiveNotification,parseDate,updateNotice,validateBackup,type Notice,type State} from './domain';
import {analyzeNotificationWithAI,analyzeScreenshotWithAI,type AiDecision} from './ai';
import * as api from './services';
import {Button,Icon,confirm,notify,p,s} from './ui';
import {MonthCalendar} from './calendar-ui';
import {privacy} from './privacy';
import {canReplyToNotification,replyToNotification} from './reply';
import {displayLocation,extractUrls,firstGoogleMapsUrl,googleMapsSearchUrl,isGoogleMapsUrl,linkHost} from './links';

type Tab='home'|'calendar'|'manual'|'settings';
const blank=():Draft=>({title:'',source:'',category:'生活',date:'',time:'',endTime:'',endDate:'',location:'',assignee:'我',checks:'',remind:60});
const isAuto=(n:Notice)=>/^\[(?:AI)?自動偵測｜/.test(n.source);
const stripDetectedId=(source:string)=>source.replace(/\n\[偵測ID:[^\]]+\]$/,'');
const whenLabel=(n:Notice)=>n.dueAt?`${displayDay(new Date(n.dueAt))} ${n.allDay?'全天':displayTime(new Date(n.dueAt))}`:n.needsReview?'時間待確認':'無期限待辦';

function aiNotice(decision:AiDecision,item:api.DetectedNotification,raw:string):Notice|null{
  if(decision.type==='ignore_notification'||decision.type==='update_existing_event'||decision.type==='cancel_existing_event'||decision.type==='complete_existing_task')return null;
  const now=new Date().toISOString(),createdAt=new Date(item.receivedAt).toISOString();
  const common={id:id(),source:`[AI自動偵測｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`,assignee:'我',done:false,createdAt,updatedAt:now,history:[],aiConfidence:decision.confidence,aiAction:decision.reason,importance:decision.importance,replySuggestions:'replySuggestions' in decision?decision.replySuggestions:[]};
  if(decision.type==='create_calendar_event')return {...common,title:decision.title,category:decision.category,dueAt:decision.startAt,endAt:decision.endAt,allDay:decision.allDay,location:decision.location??undefined,needsReview:decision.confidence<0.86,checklist:decision.checklist.map(text=>({id:id(),text,done:false})),remindMinutes:decision.importance==='normal'?null:decision.reminderMinutes};
  if(decision.type==='create_task')return {...common,title:decision.title,category:decision.category,dueAt:decision.dueAt,needsReview:decision.confidence<0.65,checklist:decision.checklist.map(text=>({id:id(),text,done:false})),remindMinutes:decision.dueAt?decision.reminderMinutes:null};
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
  const [importIssue,setImportIssue]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [policy,setPolicy]=useState(false);
  const [listenerEnabled,setListenerEnabled]=useState(false);
  const [detailMore,setDetailMore]=useState(false);
  const [defaultReminder,setDefaultReminder]=useState<number|null>(60);
  const refreshSettings=async()=>{setDefaultReminder(await api.getDefaultReminder())};
  const lock=useRef(false);
  const importPromise=useRef<Promise<State>|null>(null);
  const scroll=useRef<ScrollView>(null);
  const draftStart=useRef<Draft>(blank());
  const returnTab=useRef<'home'|'calendar'>('home');
  const notice=data.notices.find(n=>n.id===selected);
  const noticeLinks=notice?extractUrls(notice.source):[];
  const noticeMapUrl=notice?(firstGoogleMapsUrl(notice.source)??(notice.location?(isGoogleMapsUrl(notice.location)?notice.location:googleMapsSearchUrl(notice.location)):null)):null;
  const noticeWebLinks=noticeLinks.filter(url=>!isGoogleMapsUrl(url)).slice(0,3);

  const commit=async(next:State,permission=false)=>{
    await api.persist(next);live.current=next;setData(next);
    try{const result=await api.syncReminders(next.notices,permission);if(permission&&result==='提醒尚未授權。')notify('項目已儲存，但手機尚未允許通知，因此沒有排程提醒。')}
    catch{if(permission)notify('項目已儲存，但提醒排程失敗；可到設定重新排程。')}
  };

  const doImportDetected=async(base?:State)=>{
    if(lock.current)return base??live.current;
    if(!api.notificationListenerSupported())return base??live.current;
    setListenerEnabled(api.notificationListenerEnabled());
    const calendarEnabled=await api.getAutoCalendarEnabled();
    let settings=await api.getAiSettings();
    let key=settings.enabled?await api.getOpenAiKey():null;
    if(settings.enabled&&!key){settings={...settings,enabled:false};await api.setAiSettings(settings)}
    const detected=api.getDetectedNotifications().slice(0,12);
    if(!detected.length)return base??live.current;
    let next=base??live.current;
    const seen=new Set(next.notices.map(n=>n.source.match(/\[偵測ID:([^\]]+)\]/)?.[1]).filter(Boolean));
    const processed:string[]=[];let changed=false,hadFailure=false;
    for(const item of detected){
      if(seen.has(item.id)){processed.push(item.id);continue}
      const raw=[item.title,item.text].filter(Boolean).join('\n').trim();
      if(!raw){processed.push(item.id);continue}
      const sourcePolicy=api.notificationPolicy(item);
      if(sourcePolicy==='ignore'){processed.push(item.id);continue}
      let made:Notice|null=null;
      if(settings.enabled&&key){
        try{
          const decision=await analyzeNotificationWithAI({apiKey:key,model:settings.model,appName:item.appName,title:item.title,text:item.text,receivedAt:item.receivedAt,existing:next.notices});
          if(decision.type==='ignore_notification'){processed.push(item.id);continue}
          if(decision.type==='update_existing_event'){
            const old=next.notices.find(n=>n.id===decision.eventId);
            if(old){
              const source=`${old.source}\n\n[AI 更正來源｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`;
              next={...next,notices:next.notices.map(n=>n.id===old.id?updateNotice(n,{title:decision.title??n.title,dueAt:decision.startAt??n.dueAt,endAt:decision.endAt??(decision.startAt?null:n.endAt),location:decision.location??n.location,remindMinutes:decision.reminderMinutes??n.remindMinutes,source,needsReview:decision.confidence<0.9,aiConfidence:decision.confidence,aiAction:decision.reason,importance:decision.importance,replySuggestions:decision.replySuggestions}):n)};
              if(calendarEnabled&&decision.confidence>=0.9){const updated=next.notices.find(n=>n.id===old.id);if(updated?.dueAt)try{await api.addToSystemCalendar(updated)}catch{hadFailure=true;setImportIssue('App 內已更新，手機行事曆未能更新，請從詳情重試。')}}
              changed=true;processed.push(item.id);continue;
            }
          }
          if(decision.type==='cancel_existing_event'||decision.type==='complete_existing_task'){
            const old=next.notices.find(n=>n.id===decision.eventId);
            if(old){
              const source=`${old.source}\n\n[AI 狀態更新｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`;
              next={...next,notices:next.notices.map(n=>n.id===old.id?updateNotice(n,{done:true,source,needsReview:false,aiConfidence:decision.confidence,aiAction:decision.reason,importance:decision.type==='cancel_existing_event'?decision.importance:n.importance,replySuggestions:decision.replySuggestions}):n)};
              changed=true;processed.push(item.id);continue;
            }
          }
          made=aiNotice(decision,item,raw);
        }catch{hadFailure=true;setImportIssue('AI 暫時無法分析，通知已保留，稍後重新整理。');break;}
      }

      if(!made){
        const inferred=inferLiveNotification(raw,item.receivedAt);
        if(!inferred.actionable){processed.push(item.id);continue}
        let dueAt:string|null=null;try{dueAt=inferred.date?parseDate(inferred.date,inferred.time):null}catch{}
        const todo=!dueAt&&inferred.checklist.length>0;
        const title=(inferred.title||item.text.split(/\n/).find(Boolean)||item.title||'待辦事項').slice(0,100);
        made={id:id(),title,source:`[自動偵測｜${item.appName}]\n${raw}\n[偵測ID:${item.id}]`,category:inferred.category,dueAt,allDay:!!dueAt&&!inferred.time,needsReview:sourcePolicy==='ai_required'||inferred.warnings.length>0||!dueAt&&!todo,assignee:'我',checklist:inferred.checklist.map(text=>({id:id(),text,done:false})),done:false,remindMinutes:dueAt&&item.score>=9?60:null,createdAt:new Date(item.receivedAt).toISOString(),updatedAt:new Date().toISOString(),history:[],importance:item.score>=12?'urgent':item.score>=9?'important':'normal'};
      }
      next={...next,notices:[made,...next.notices]};changed=true;
      const trusted=made.dueAt&&!made.needsReview&&(made.aiConfidence!==undefined?made.aiConfidence>=0.9:item.score>=9);
      if(calendarEnabled&&trusted){try{await api.addToSystemCalendar(made,`detected-${item.id}`)}catch{hadFailure=true;setImportIssue('項目已保存在 App，但手機行事曆寫入失敗，請檢查行事曆權限及帳戶。')}}
      processed.push(item.id);
    }
    if(changed){await api.persist(next);live.current=next;setData(next);try{await api.syncReminders(next.notices)}catch{}}
    if(processed.length)api.markDetectedNotificationsProcessed(processed);
    if(!hadFailure)setImportIssue('');
    return next;
  };

  const importDetected=(base?:State):Promise<State>=>{
    if(importPromise.current)return importPromise.current;
    const task=doImportDetected(base);importPromise.current=task;
    return task.finally(()=>{if(importPromise.current===task)importPromise.current=null});
  };

  const reload=async()=>{
    try{
      const d=await api.load();live.current=d;setData(d);setLoadError('');setReady(true);
      setListenerEnabled(api.notificationListenerEnabled());
      void importDetected(d).then(merged=>api.syncReminders(merged.notices)).catch(()=>setImportIssue('自動整理暫時失敗，通知已保留。'));
    }catch{setLoadError('本機資料無法讀取。請重新載入。')}
  };

  useEffect(()=>{
    void reload();void refreshSettings().catch(()=>{});
    const refresh=()=>{setListenerEnabled(api.notificationListenerEnabled());void importDetected().catch(()=>setImportIssue('自動整理暫時失敗，通知已保留。'));};
    const app=AppState.addEventListener('change',state=>{if(state==='active')refresh()});
    const timer=setInterval(()=>{if(AppState.currentState==='active')refresh()},30000);
    let response:ReturnType<typeof Notifications.addNotificationResponseReceivedListener>|undefined;
    if(Platform.OS!=='web'){
      response=Notifications.addNotificationResponseReceivedListener(r=>{const n=r.notification.request.content.data?.noticeId;if(typeof n==='string')setSelected(n)});
      Notifications.getLastNotificationResponseAsync().then(r=>{const n=r?.notification.request.content.data?.noticeId;if(typeof n==='string')setSelected(n)}).catch(()=>{});
    }
    return()=>{app.remove();clearInterval(timer);response?.remove()};
  },[]);
  useEffect(()=>{scroll.current?.scrollTo({y:0,animated:false})},[tab]);
  useEffect(()=>{if(!selected)setDetailMore(false)},[selected]);

  const run=async(job:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await importPromise.current;await job()}catch(e){notify(e instanceof Error?e.message:'操作失敗，請稍後再試。')}finally{lock.current=false;setBusy(false)}};
  const patchDraft=(patch:Partial<Draft>)=>setDraft(d=>({...d,...patch}));
  const openDraft=(next:Draft,origin:'home'|'calendar')=>{draftStart.current=next;returnTab.current=origin;setDraft(next);setWarnings([]);setMessage('');setTab('manual')};
  const startManual=()=>openDraft({...blank(),remind:defaultReminder},tab==='calendar'?'calendar':'home');
  const addForDate=(date:string)=>openDraft({...blank(),date,remind:defaultReminder},'calendar');
  const leaveManual=async()=>{if(JSON.stringify(draft)!==JSON.stringify(draftStart.current)&&!await confirm('放棄尚未儲存的內容？'))return;setDraft(blank());setTab(returnTab.current)};
  useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(tab!=='manual')return false;void leaveManual();return true;});return()=>sub.remove()},[tab,draft]);
  const applyInference=(source:string)=>{
    const r=inferLiveNotification(source,Date.now());
    setDraft(d=>({...d,source,title:r.title,category:r.category,date:r.date,time:r.time,checks:r.checklist.join('\n')}));
    setWarnings(!r.date&&r.actionable?['沒有偵測到期限，會建立成待辦。']:r.warnings.slice(0,2));
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
        if(decision.type==='ignore_notification'){setDraft(d=>({...d,image:uri,source:raw}));setMessage('AI 判斷這張圖沒有需要建立的行程或待辦。');return}
        if(decision.type==='update_existing_event'){const old=live.current.notices.find(n=>n.id===decision.eventId);if(old){edit(old);const start=dateFields(decision.startAt??old.dueAt),end=dateFields(decision.endAt??(decision.startAt?null:old.endAt??null));patchDraft({title:decision.title??old.title,date:start.date,time:old.allDay?'':start.time,endDate:end.date,endTime:end.time,location:decision.location??old.location??'',remind:decision.reminderMinutes??old.remindMinutes,image:uri,source:raw});setMessage('已套用辨識到的更正，請確認後儲存。')}return}
        if(decision.type==='cancel_existing_event'||decision.type==='complete_existing_task'){const old=live.current.notices.find(n=>n.id===decision.eventId);if(old&&await confirm(`將「${old.title}」標記為${decision.type==='cancel_existing_event'?'已取消':'已完成'}？`)){await commit({...live.current,notices:live.current.notices.map(n=>n.id===old.id?updateNotice(n,{done:true,needsReview:false,aiAction:decision.reason}):n)});setDraft(blank());setTab(returnTab.current)}else setMessage('未套用狀態變更。');return}
        const when=decision.type==='create_calendar_event'?decision.startAt:decision.type==='create_task'?decision.dueAt:decision.proposedAt;
        const f=dateFields(when),checks=decision.type==='ask_user'?[decision.question]:decision.checklist;
        setDraft(d=>({...d,image:uri,source:raw,title:decision.title,category:decision.category,date:f.date,time:decision.type==='create_calendar_event'&&decision.allDay?'':f.time,endTime:decision.type==='create_calendar_event'?dateFields(decision.endAt).time:'',endDate:decision.type==='create_calendar_event'?dateFields(decision.endAt).date:'',location:decision.type==='create_calendar_event'?decision.location??'':'',checks:checks.join('\n'),remind:decision.type==='create_calendar_event'?decision.reminderMinutes:decision.type==='create_task'?decision.reminderMinutes:null}));
        setWarnings(decision.type==='ask_user'?[decision.question]:[]);setMessage(decision.type==='create_task'&&!decision.dueAt?'AI 已整理成無期限待辦。':'AI 已整理截圖。');return;
      }catch(e){setMessage(e instanceof Error?`AI 失敗：${e.message}`:'AI 分析失敗，已改用本機辨識。')}
    }
    const text=await api.recognize(uri);applyInference(text);setDraft(d=>({...d,image:uri}));if(!message)setMessage('已整理截圖。');
  });

  const save=()=>void run(async()=>{
    const title=draft.title.trim();if(!title)throw new Error('請輸入名稱。');
    const dueAt=parseDate(draft.date,draft.time),allDay=!!dueAt&&!draft.time.trim();
    if(draft.endDate&&draft.endDate!==draft.date&&!draft.endTime&&!allDay)throw new Error('填寫結束日期時，也需要結束時間。');
    const old=live.current.notices.find(n=>n.id===draft.editing);
    const endAt=dueAt&&!allDay&&draft.endTime.trim()?parseDate(draft.endDate||draft.date,draft.endTime):allDay&&old?.allDay&&old.dueAt===dueAt?old.endAt??null:null;
    if(endAt&&Date.parse(endAt)<=Date.parse(dueAt!))throw new Error('結束時間必須晚於開始時間。');
    const location=dueAt&&draft.location.trim()?draft.location.trim().slice(0,200):undefined;
    let sourceImage:string|undefined=draft.image;
    if(sourceImage&&!sourceImage.startsWith(FS.documentDirectory??'__none__'))sourceImage=await api.keepImage(sourceImage);
    const oldChecks=live.current.notices.find(n=>n.id===draft.editing)?.checklist??[];const checks=[...new Set(draft.checks.split(/\n+/).map(x=>x.trim().slice(0,200)).filter(Boolean))].slice(0,50).map(text=>oldChecks.find(c=>c.text===text)??{id:id(),text,done:false});
    const now=new Date().toISOString();const remindMinutes=dueAt?draft.remind:null;let next:State;
    if(draft.editing){
      const old=live.current.notices.find(n=>n.id===draft.editing);if(!old)throw new Error('找不到要編輯的項目。');
      next={...live.current,notices:live.current.notices.map(n=>n.id===old.id?updateNotice(n,{title,source:draft.source.trim(),sourceImage,category:draft.category,dueAt,endAt,allDay,location,needsReview:false,assignee:'我',checklist:checks,remindMinutes}):n)};
    }else{
      const item:Notice={id:id(),title,source:draft.source.trim(),sourceImage,category:draft.category,dueAt,endAt,allDay,location,needsReview:false,assignee:'我',checklist:checks,done:false,remindMinutes,createdAt:now,updatedAt:now,history:[]};
      next={...live.current,notices:[item,...live.current.notices]};
    }
    await commit(next,!!dueAt&&remindMinutes!==null);setDraft(blank());setWarnings([]);setMessage('');setTab(returnTab.current);
  });
  const edit=(n:Notice)=>{const f=dateFields(n.dueAt),end=dateFields(n.endAt??null);const next:Draft={title:n.title,source:n.source,image:n.sourceImage,category:n.category,date:f.date,time:n.allDay?'':f.time,endTime:n.allDay?'':end.time,endDate:end.date,location:n.location??'',assignee:'我',checks:n.checklist.map(c=>c.text).join('\n'),remind:n.remindMinutes,editing:n.id};setSelected(null);openDraft(next,tab==='calendar'?'calendar':'home')};
  const toggle=(n:Notice)=>void run(async()=>commit({...live.current,notices:live.current.notices.map(x=>x.id===n.id?updateNotice(x,{done:!x.done}):x)}));
  const completeAndClose=(n:Notice)=>void run(async()=>{await commit({...live.current,notices:live.current.notices.map(x=>x.id===n.id?updateNotice(x,{done:true}):x)});setSelected(null)});
  const remove=(n:Notice)=>void run(async()=>{if(!(await confirm(`從 App 刪除「${n.title}」？已加入手機行事曆的副本會保留。`)))return;await commit({...live.current,notices:live.current.notices.filter(x=>x.id!==n.id)});setSelected(null);await api.removeImage(n.sourceImage)});
  const restore=()=>void run(async()=>{const result=await DocumentPicker.getDocumentAsync({type:'application/json',copyToCacheDirectory:true});if(result.canceled)return;const raw=await FS.readAsStringAsync(result.assets[0].uri);const restored=validateBackup(JSON.parse(raw));if(!(await confirm(`用備份中的 ${restored.notices.length} 個項目取代目前資料？`)))return;await commit(restored);notify('已還原備份。')});
  if(!ready&&!loadError)return <SafeAreaView style={[s.root,{alignItems:'center',justifyContent:'center'}]}><ActivityIndicator/></SafeAreaView>;
  if(loadError)return <SafeAreaView style={s.root}><View style={s.content}><Text style={s.warning}>{loadError}</Text><Button label="重新載入" onPress={()=>void reload()}/></View></SafeAreaView>;


  return <SafeAreaView style={s.root}>
    <StatusBar style="dark"/>
    <View style={s.top}>{tab==='manual'?<Pressable accessibilityRole="button" onPress={()=>void leaveManual()} style={s.row}><Icon name="chevron-back"/><Text style={s.brand}>返回</Text></Pressable>:<View style={s.row}><View style={s.logo}><Icon name="calendar" color="white" size={19}/></View><Text style={s.brand}>生活通知管家</Text></View>}{tab!=='manual'&&Platform.OS==='android'?<View style={s.listenerPill}><View style={[s.statusDot,listenerEnabled&&s.statusDotOn]}/><Text style={s.listenerText}>{listenerEnabled?'運作中':'未啟用'}</Text></View>:null}</View>

    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {tab==='home'&&<HomeDashboard notices={data.notices} onOpen={setSelected} onToggle={toggle} onAdd={startManual} onCapture={type=>{startManual();if(type==='image')pickImage();else pasteText()}} onCalendar={()=>setTab('calendar')} onSettings={()=>setTab('settings')} listenerEnabled={Platform.OS!=='android'||listenerEnabled} issue={importIssue}/>}

        {tab==='calendar'&&<MonthCalendar notices={data.notices} onOpen={setSelected} onAdd={addForDate}/>}

        {tab==='manual'&&<EventEditor draft={draft} patch={patchDraft} onImage={pickImage} onPaste={pasteText} onSave={save} busy={busy} message={message} warnings={warnings}/>}

        {tab==='settings'&&<SettingsPanel data={data} onChange={refreshSettings} onRestore={restore} onPrivacy={()=>setPolicy(true)} onErase={()=>void run(async()=>{if(await confirm('永久清除此 App 的事件、截圖、金鑰及監聽設定？已加入手機行事曆的副本會保留。')){api.clearDetectedNotifications();await api.erase();const next={...EMPTY,members:['我'],notices:[],welcomed:true};await api.persist(next);live.current=next;setData(next);setListenerEnabled(false);setSelected(null);setTab('home');await refreshSettings();}})}/>}

      </ScrollView>
    </KeyboardAvoidingView>

    {tab==='manual'&&<View style={{paddingHorizontal:20,paddingVertical:6,backgroundColor:p.paper,borderTopWidth:1,borderTopColor:p.border}}><Button label={draft.editing?'儲存變更':draft.date||draft.time?'加入行程':'加入待辦'} disabled={busy} onPress={save}/></View>}
    {tab!=='manual'&&<SafeAreaView edges={['bottom']} style={s.bottom}><View style={s.tabs}>{([['home','今天','today-outline'],['calendar','月曆','calendar-outline'],['settings','設定','settings-outline']] as const).map(([key,label,icon])=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={[s.tab,tab===key&&{backgroundColor:p.mint,borderRadius:22,marginHorizontal:8}]}><Icon name={icon} color={tab===key?p.green:p.muted} size={23}/><Text style={[s.tabText,tab===key&&{color:p.green,fontWeight:'700'}]}>{label}</Text></Pressable>)}</View></SafeAreaView>}

    <Modal visible={!!notice} onRequestClose={()=>setSelected(null)} animationType="slide"><SafeAreaView style={s.root}><View style={s.modalBar}><Pressable onPress={()=>setSelected(null)} style={s.row}><Icon name="chevron-back"/><Text style={s.brand}>返回</Text></Pressable></View>{notice&&<ScrollView contentContainerStyle={s.content}>
      {notice.done&&<Text style={s.info}>已完成</Text>}{notice.needsReview&&<Text style={s.warning}>這則內容需要確認</Text>}
      <DetailHeading notice={notice} when={whenLabel(notice)}/>{displayLocation(notice.location)&&<Text style={s.body}>📍 {displayLocation(notice.location)}</Text>}{noticeMapUrl&&<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(noticeMapUrl).catch(()=>notify('無法開啟 Google Maps。'))} style={[s.chip,{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7,marginTop:8}]}><Icon name="navigate-outline" size={17}/><Text style={[s.chipText,{color:p.green,fontWeight:'700'}]}>在 Google Maps 開啟</Text></Pressable>}{noticeWebLinks.length>0&&<View style={s.chips}>{noticeWebLinks.map(url=><Pressable key={url} accessibilityRole="link" onPress={()=>void Linking.openURL(url).catch(()=>notify('無法開啟連結。'))} style={[s.chip,{flexDirection:'row',alignItems:'center',gap:7}]}><Icon name="link-outline" size={16}/><Text style={s.chipText}>開啟 {linkHost(url)}</Text></Pressable>)}</View>}
      {!!notice.replySuggestions?.length&&canReplyToNotification(notice.source)&&<><Text style={s.sectionTitle}>快速回覆</Text><View style={s.chips}>{notice.replySuggestions.map(reply=><Pressable key={reply} accessibilityRole="button" onPress={()=>void run(async()=>{if(!await confirm(`傳送回覆「${reply}」？`))return;await replyToNotification(notice.source,reply);notify('已回覆。')})} style={s.chip}><Text style={s.chipText}>{reply}</Text></Pressable>)}</View></>}
      {notice.checklist.length>0&&<>{notice.checklist.map(c=><Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{checked:c.done}} style={s.checkRow} onPress={()=>void run(async()=>commit({...live.current,notices:live.current.notices.map(n=>n.id===notice.id?updateNotice(n,{checklist:n.checklist.map(x=>x.id===c.id?{...x,done:!x.done}:x)}):n)}))}><Icon name={c.done?'checkbox':'square-outline'}/><Text style={[s.body,s.flex,c.done&&{textDecorationLine:'line-through',color:p.muted}]}>{c.text}</Text></Pressable>)}</>}
      <Button label={notice.done?"恢復為未完成":"標記已完成"} secondary={notice.done} onPress={()=>notice.done?toggle(notice):completeAndClose(notice)}/><View style={s.row}><View style={s.flex}><Button label="編輯" secondary onPress={()=>edit(notice)}/></View>{notice.dueAt&&<View style={s.flex}><Button label="加入行事曆" secondary onPress={()=>void run(async()=>{if(Platform.OS==='android'){await api.requestCalendarPermission();const result=await api.addToSystemCalendar(notice,`manual-${notice.id}`);notify(result==='already-synced'?'舊版加入的行程已有副本，請到手機行事曆編輯。':result==='updated'?'已更新手機行事曆。':'已加入行事曆。')}else await api.exportCalendar(notice)})}/></View>}</View>
      <Pressable onPress={()=>setDetailMore(v=>!v)} style={[s.card,{marginTop:12,paddingVertical:13}]}><View style={s.row}><Text style={[s.cardTitle,s.flex,{marginBottom:0}]}>更多</Text><Icon name={detailMore?'chevron-up':'chevron-down'} color={p.muted}/></View></Pressable>
      {detailMore&&<><Button label="分享" secondary onPress={()=>void run(()=>api.shareNotice(notice))}/>{notice.source?<><Text style={s.sectionTitle}>原始內容</Text><Text selectable style={s.sourceText}>{stripDetectedId(notice.source)}</Text></>:null}{notice.sourceImage&&<Image source={{uri:notice.sourceImage}} style={s.sourceFull} resizeMode="contain"/>}{notice.history.length>0&&<><Text style={s.sectionTitle}>修改紀錄</Text>{notice.history.map((h,i)=><View key={i} style={s.card}><Text style={s.caption}>{new Date(h.at).toLocaleString('zh-TW')}</Text><Text style={s.body}>{h.title}</Text><Text style={s.caption}>{h.dueAt?new Date(h.dueAt).toLocaleString('zh-TW'):'無期限待辦'}</Text></View>)}</>}<Button label="刪除" danger onPress={()=>remove(notice)}/></>}
    </ScrollView>}</SafeAreaView></Modal>

    <Modal visible={!data.welcomed&&!policy} animationType="fade" onRequestClose={()=>{}}><SafeAreaView style={s.root}><View style={[s.content,{flex:1,justifyContent:'center'}]}><View style={s.welcomeIcon}><Icon name="calendar-outline" size={44} color="white"/></View><Text style={s.heading}>整理重要通知</Text><Text style={[s.body,{marginBottom:22}]}>{Platform.OS==='android'?'先選擇要監聽的 App。只有你勾選的 App 才會被讀取；有時間的內容變行程，沒有期限的任務變待辦。':'iPhone 版可用截圖或貼上文字建立行程與待辦。'}</Text>{Platform.OS==='android'?<Button label="選擇監聽 App" onPress={()=>void run(async()=>{await commit({...live.current,welcomed:true});await api.notificationAccess(true);api.openNotificationListenerSettings()})}/>:<Button label="開始使用" onPress={()=>void run(()=>commit({...live.current,welcomed:true}))}/>}<Button label="稍後" secondary onPress={()=>void run(()=>commit({...live.current,welcomed:true}))}/><Pressable onPress={()=>setPolicy(true)}><Text style={[s.caption,{textAlign:'center',padding:12}]}>隱私權說明</Text></Pressable></View></SafeAreaView></Modal>

    <Modal visible={policy} onRequestClose={()=>setPolicy(false)} animationType="slide"><SafeAreaView style={s.root}><View style={s.modalBar}><Text style={s.brand}>隱私權說明</Text><Pressable onPress={()=>setPolicy(false)}><Icon name="close"/></Pressable></View><ScrollView contentContainerStyle={s.content}><Text selectable style={s.body}>{privacy(Constants.expoConfig?.extra?.supportEmail)}</Text></ScrollView></SafeAreaView></Modal>
    {busy&&<View style={s.busy} pointerEvents="auto"><ActivityIndicator color="white"/></View>}
  </SafeAreaView>;
}
