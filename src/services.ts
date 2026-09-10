import {PermissionsAndroid,Platform, Share} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {EMPTY,reminderPlan,toCalendar,validateBackup,type State,type Notice} from './domain';
import type {AiModel} from './ai';
const KEY='life-notice-v1';
const AUTO_CALENDAR_KEY='life-notice-auto-calendar-v1';
const AI_SETTINGS_KEY='life-notice-ai-settings-v1';
const ALERT_LEVEL_KEY='life-notice-alert-level-v1';
const OPENAI_KEY_KEY='life-notice-openai-key-v1';
const LUNA:AiModel='gpt-5.6-luna';
export type AiSettings={enabled:boolean;model:AiModel};
export type AlertLevel='important'|'balanced'|'all';
const DEFAULT_AI:AiSettings={enabled:false,model:LUNA};
const AUTO_SOURCE=/^\[(?:AI)?自動偵測｜/;
const OBVIOUS_NOISE=/Samsung\s*Rewards|Rewards|獲得\s*\d+\s*點|點數到帳|節能模式|省電模式|電池電量|剩餘電量|充電完成|裝置維護|系統更新|下載完成|安裝完成|同步完成|備份完成|已連線|VPN|截圖已儲存|驗證碼|認證碼|一次性密碼|\bOTP\b|verification\s*code|廣告|優惠券|限時優惠|促銷|折扣|猜你喜歡|熱門新聞|推薦文章|每日精選|購物優惠|會員好康|#請益|數位城市迷彩/i;

export function isObviousNoiseText(text:string){return OBVIOUS_NOISE.test(text);}

export type DetectedNotification={id:string;packageName:string;appName:string;title:string;text:string;receivedAt:number;score:number;reason:string};
const listener=Platform.OS==='android'?requireOptionalNativeModule<{isEnabled():boolean;openSettings():void;requestQuickTile():boolean;getDetected():DetectedNotification[];markProcessed(ids:string[]):void;clearDetected():void;setAiMode(enabled:boolean):void;setAlertLevel(level:string):void;addCalendarEvent(title:string,startAt:number,endAt:number,allDay:boolean,description:string,location:string,syncKey:string):string}>('NoticeListener'):null;
export function notificationListenerSupported(){return Platform.OS==='android'&&!!listener;}
export function notificationListenerEnabled(){return !!listener?.isEnabled();}
export function openNotificationListenerSettings(){if(!listener)throw new Error(Platform.OS==='ios'?'iPhone 無法讀取其他 App 的通知；請改用分享或截圖匯入。':'此版本尚未包含通知自動讀取模組。');listener.openSettings();}
export function requestQuickCaptureTile(){if(!listener)throw new Error('快速擷取只支援 Android 原生版。');return listener.requestQuickTile();}
export function getDetectedNotifications():DetectedNotification[]{
  const all=listener?.getDetected()??[];
  const ignored=all.filter(x=>isObviousNoiseText(`${x.appName}\n${x.title}\n${x.text}`));
  if(ignored.length)listener?.markProcessed(ignored.map(x=>x.id));
  return all.filter(x=>!isObviousNoiseText(`${x.appName}\n${x.title}\n${x.text}`));
}
export function markDetectedNotificationsProcessed(ids:string[]){listener?.markProcessed(ids);}
export function clearDetectedNotifications(){listener?.clearDetected();}

export async function getAiSettings():Promise<AiSettings>{
  const raw=await AsyncStorage.getItem(AI_SETTINGS_KEY);let enabled=false;
  if(raw){try{enabled=!!JSON.parse(raw).enabled}catch{}}
  const fixed={enabled,model:LUNA} as AiSettings;
  listener?.setAiMode(enabled);listener?.setAlertLevel('important');
  await AsyncStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(fixed));
  await AsyncStorage.setItem(ALERT_LEVEL_KEY,'important');
  return fixed;
}
export async function setAiSettings(settings:AiSettings){const fixed:AiSettings={enabled:settings.enabled,model:LUNA};await AsyncStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(fixed));listener?.setAiMode(fixed.enabled);listener?.setAlertLevel('important');}
export async function getAlertLevel():Promise<AlertLevel>{await AsyncStorage.setItem(ALERT_LEVEL_KEY,'important');listener?.setAlertLevel('important');return 'important';}
export async function setAlertLevel(_level:AlertLevel){await AsyncStorage.setItem(ALERT_LEVEL_KEY,'important');listener?.setAlertLevel('important');return 'important' as const;}
function checkedOpenAiKey(key:string){const value=key.trim();if(!/^sk-[A-Za-z0-9_-]{20,}$/.test(value))throw new Error('API key 格式看起來不正確。');return value;}
export async function verifyOpenAiKey(key:string){
  const value=checkedOpenAiKey(key);
  if(Platform.OS==='web')throw new Error('網頁預覽不保存 API key，請使用手機 App。');
  const response=await fetch('https://api.openai.com/v1/models/gpt-5.6-luna',{headers:{Authorization:`Bearer ${value}`}});
  if(!response.ok){const json:any=await response.json().catch(()=>({}));throw new Error(`AI 連線失敗：${json?.error?.message||`HTTP ${response.status}`}`)}
  return true;
}
export async function saveOpenAiKey(key:string){const value=checkedOpenAiKey(key);await verifyOpenAiKey(value);await SecureStore.setItemAsync(OPENAI_KEY_KEY,value);}
export async function getOpenAiKey(){if(Platform.OS==='web')return null;return SecureStore.getItemAsync(OPENAI_KEY_KEY);}
export async function hasOpenAiKey(){return !!(await getOpenAiKey());}
export async function clearOpenAiKey(){if(Platform.OS!=='web')await SecureStore.deleteItemAsync(OPENAI_KEY_KEY);const settings=await getAiSettings();await setAiSettings({...settings,enabled:false});}

export async function getAutoCalendarEnabled(){return Platform.OS==='android'&&(await AsyncStorage.getItem(AUTO_CALENDAR_KEY))==='1';}
export async function setAutoCalendarEnabled(enabled:boolean){
  if(Platform.OS!=='android'){await AsyncStorage.setItem(AUTO_CALENDAR_KEY,'0');return false;}
  if(enabled){
    const result=await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.READ_CALENDAR,PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR]);
    const granted=result[PermissionsAndroid.PERMISSIONS.READ_CALENDAR]===PermissionsAndroid.RESULTS.GRANTED&&result[PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR]===PermissionsAndroid.RESULTS.GRANTED;
    if(!granted){await AsyncStorage.setItem(AUTO_CALENDAR_KEY,'0');return false;}
  }
  await AsyncStorage.setItem(AUTO_CALENDAR_KEY,enabled?'1':'0');return enabled;
}
export async function addToSystemCalendar(n:Notice,syncKey='manual'){
  if(Platform.OS!=='android'||!listener)throw new Error('這個測試版目前只在 Android 支援直接寫入手機行事曆。');
  if(!n.dueAt)throw new Error('這則行程還沒有可用的日期時間。');
  const read=await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALENDAR),write=await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR);
  if(!read||!write)throw new Error('請先在設定開啟「同步手機行事曆」。');
  const start=Date.parse(n.dueAt);const end=n.endAt&&Date.parse(n.endAt)>start?Date.parse(n.endAt):start+30*60000;
  return listener.addCalendarEvent(n.title,start,end,!!n.allDay,n.source,n.location??'',syncKey);
}
export async function load():Promise<State>{
  const raw=await AsyncStorage.getItem(KEY);if(!raw)return {...EMPTY,members:[...EMPTY.members],notices:[]};
  const saved=JSON.parse(raw);const validated=validateBackup(saved);
  const restored=validated.notices.map((n,i)=>({...n,sourceImage:typeof saved.notices[i]?.sourceImage==='string' && FS.documentDirectory && saved.notices[i].sourceImage.startsWith(FS.documentDirectory)?saved.notices[i].sourceImage:undefined}));
  const seen=new Set<string>();
  const notices=restored.filter(n=>{
    if(!AUTO_SOURCE.test(n.source))return true;
    if(isObviousNoiseText(`${n.title}\n${n.source}`))return false;
    const normalized=n.source.replace(/\n?\[偵測ID:[^\]]+\]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const fingerprint=`${n.title.trim().toLowerCase()}|${n.dueAt??''}|${normalized}`;
    if(seen.has(fingerprint))return false;seen.add(fingerprint);return true;
  });
  const result={...validated,welcomed:!!saved.welcomed,notices};
  if(notices.length!==restored.length)await AsyncStorage.setItem(KEY,JSON.stringify(result));
  return result;
}
export async function persist(s:State){await AsyncStorage.setItem(KEY,JSON.stringify(s));}
export async function recognize(uri:string):Promise<string>{const ocr=requireOptionalNativeModule<{recognize(uri:string):Promise<string>}>('NoticeOcr');if(!ocr)throw new Error('此安裝包缺少截圖辨識模組，請更新到最新版 APK。');return ocr.recognize(uri);}
export async function keepImage(uri:string):Promise<string>{if(Platform.OS==='web')return uri;const folder=FS.documentDirectory+'sources/';await FS.makeDirectoryAsync(folder,{intermediates:true});const dest=folder+Date.now()+'-'+Math.random().toString(36).slice(2)+'.jpg';await FS.copyAsync({from:uri,to:dest});return dest;}
export async function removeImage(uri?:string){if(uri && FS.documentDirectory && uri.startsWith(FS.documentDirectory+'sources/'))await FS.deleteAsync(uri,{idempotent:true});}
if(Platform.OS!=='web')Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
export async function notificationAccess(request=false){if(Platform.OS==='web')return false;if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('life-notices',{name:'行程提醒',importance:Notifications.AndroidImportance.HIGH});let p=await Notifications.getPermissionsAsync();if(!p.granted && request)p=await Notifications.requestPermissionsAsync();return p.granted || p.ios?.status===Notifications.IosAuthorizationStatus.PROVISIONAL;}
let queue=Promise.resolve();
export function syncReminders(notices:Notice[],request=false):Promise<string>{let result='';const job=queue.then(async()=>{
  if(Platform.OS==='web'){result='網頁預覽不提供背景提醒。';return;}
  if(!(await notificationAccess(request))){result='提醒尚未授權。';return;}
  const desired=reminderPlan(notices);const scheduled=await Notifications.getAllScheduledNotificationsAsync();
  const wanted=new Map(desired.map(p=>['life-'+p.id,p]));
  for(const old of scheduled.filter(s=>s.identifier.startsWith('life-'))){const p=wanted.get(old.identifier);if(p && old.content.data?.at===p.at && old.content.title===p.title)wanted.delete(old.identifier);else await Notifications.cancelScheduledNotificationAsync(old.identifier);}
  for(const [identifier,p] of wanted)await Notifications.scheduleNotificationAsync({identifier,content:{title:p.title,body:'行程快到了，點開查看。',sound:'default',data:{noticeId:p.id,at:p.at}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(p.at),channelId:'life-notices'}});
  const total=notices.filter(n=>!n.done&&n.dueAt&&n.remindMinutes!==null&&Date.parse(n.dueAt)-n.remindMinutes*60000>Date.now()).length;
  result=total>40?'已排程最近 40 筆提醒。':`已排程 ${desired.length} 筆提醒。`;
});queue=job.catch(()=>{});return job.then(()=>result);}
export async function testReminder(){if(!(await notificationAccess(true)))throw new Error('請先在系統設定允許通知。');await Notifications.scheduleNotificationAsync({content:{title:'生活通知管家',body:'測試提醒',sound:'default'},trigger:{type:Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds:10,channelId:'life-notices'}});}
export async function exportFile(name:string,content:string,type:string){if(Platform.OS==='web'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}const path=FS.cacheDirectory+name;await FS.writeAsStringAsync(path,content,{encoding:FS.EncodingType.UTF8});if(!(await Sharing.isAvailableAsync()))throw new Error('這台裝置無法開啟系統分享。');await Sharing.shareAsync(path,{mimeType:type,UTI:type==='text/calendar'?'com.apple.ical.ics':'public.json'});}
export async function exportBackup(s:State){const clean=validateBackup(s);await exportFile('life-notice-backup.json',JSON.stringify(clean,null,2),'application/json');}
export async function exportCalendar(n:Notice){await exportFile('life-notice.ics',toCalendar(n),'text/calendar');}
export async function shareNotice(n:Notice){await Share.share({title:n.title,message:`${n.title}\n${n.dueAt?new Date(n.dueAt).toLocaleString('zh-TW'):'尚未設定日期'}\n${n.checklist.map(c=>`${c.done?'☑':'□'} ${c.text}`).join('\n')}\n\n原始通知：\n${n.source}`});}
export async function erase(){if(Platform.OS!=='web'){await Notifications.cancelAllScheduledNotificationsAsync();await FS.deleteAsync(FS.documentDirectory+'sources/',{idempotent:true});for(const name of ['life-notice-backup.json','life-notice.ics'])await FS.deleteAsync(FS.cacheDirectory+name,{idempotent:true});}await AsyncStorage.multiRemove([KEY,AUTO_CALENDAR_KEY,AI_SETTINGS_KEY,ALERT_LEVEL_KEY]);if(Platform.OS!=='web')await SecureStore.deleteItemAsync(OPENAI_KEY_KEY);listener?.setAiMode(false);listener?.setAlertLevel('important');}
