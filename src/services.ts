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
export type AiSettings={enabled:boolean;model:AiModel};
export type AlertLevel='important'|'balanced'|'all';
const DEFAULT_AI:AiSettings={enabled:false,model:'gpt-5.6-terra'};

export type DetectedNotification={id:string;packageName:string;appName:string;title:string;text:string;receivedAt:number;score:number;reason:string};
const listener=Platform.OS==='android'?requireOptionalNativeModule<{isEnabled():boolean;openSettings():void;getDetected():DetectedNotification[];markProcessed(ids:string[]):void;clearDetected():void;setAiMode(enabled:boolean):void;setAlertLevel(level:string):void;addCalendarEvent(title:string,startAt:number,endAt:number,allDay:boolean,description:string,location:string,syncKey:string):string}>('NoticeListener'):null;
export function notificationListenerSupported(){return Platform.OS==='android'&&!!listener;}
export function notificationListenerEnabled(){return !!listener?.isEnabled();}
export function openNotificationListenerSettings(){if(!listener)throw new Error(Platform.OS==='ios'?'iPhone 無法讀取其他 App 的通知；請改用分享或截圖匯入。':'此版本尚未包含通知自動讀取模組。');listener.openSettings();}
export function getDetectedNotifications():DetectedNotification[]{return listener?.getDetected()??[];}
export function markDetectedNotificationsProcessed(ids:string[]){listener?.markProcessed(ids);}
export function clearDetectedNotifications(){listener?.clearDetected();}

export async function getAiSettings():Promise<AiSettings>{
  const raw=await AsyncStorage.getItem(AI_SETTINGS_KEY);if(!raw)return DEFAULT_AI;
  try{const v=JSON.parse(raw);const model:AiModel=v.model==='gpt-5.6-luna'?'gpt-5.6-luna':v.model==='gpt-5.6-sol'?'gpt-5.6-sol':'gpt-5.6-terra';return {enabled:!!v.enabled,model};}catch{return DEFAULT_AI;}
}
export async function setAiSettings(settings:AiSettings){await AsyncStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(settings));listener?.setAiMode(settings.enabled);}
export async function getAlertLevel():Promise<AlertLevel>{const v=await AsyncStorage.getItem(ALERT_LEVEL_KEY);const level:AlertLevel=v==='all'?'all':v==='balanced'?'balanced':'important';listener?.setAlertLevel(level);return level;}
export async function setAlertLevel(level:AlertLevel){await AsyncStorage.setItem(ALERT_LEVEL_KEY,level);listener?.setAlertLevel(level);return level;}
export async function saveOpenAiKey(key:string){const value=key.trim();if(!/^sk-[A-Za-z0-9_-]{20,}$/.test(value))throw new Error('API key 格式看起來不正確。');if(Platform.OS==='web')throw new Error('網頁預覽不保存 API key，請使用手機 App。');await SecureStore.setItemAsync(OPENAI_KEY_KEY,value);}
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
  if(!read||!write)throw new Error('請先在設定開啟「自動同步到手機行事曆」，授權 Calendar 存取。');
  const start=Date.parse(n.dueAt);const end=n.endAt&&Date.parse(n.endAt)>start?Date.parse(n.endAt):start+30*60000;
  return listener.addCalendarEvent(n.title,start,end,!!n.allDay,n.source,n.location??'',syncKey);
}
export async function load():Promise<State>{const raw=await AsyncStorage.getItem(KEY);if(!raw)return {...EMPTY,members:[...EMPTY.members],notices:[]};const saved=JSON.parse(raw);const validated=validateBackup(saved);return {...validated,welcomed:!!saved.welcomed,notices:validated.notices.map((n,i)=>({...n,sourceImage:typeof saved.notices[i].sourceImage==='string' && FS.documentDirectory && saved.notices[i].sourceImage.startsWith(FS.documentDirectory)?saved.notices[i].sourceImage:undefined}))};}
export async function persist(s:State){await AsyncStorage.setItem(KEY,JSON.stringify(s));}
export async function recognize(uri:string):Promise<string>{const ocr=requireOptionalNativeModule<{recognize(uri:string):Promise<string>}>('NoticeOcr');if(!ocr)throw new Error('截圖辨識需要安裝原生測試版。此預覽可先貼上文字，截圖仍可作為附件保存。');return ocr.recognize(uri);}
export async function keepImage(uri:string):Promise<string>{if(Platform.OS==='web')return uri;const folder=FS.documentDirectory+'sources/';await FS.makeDirectoryAsync(folder,{intermediates:true});const dest=folder+Date.now()+'-'+Math.random().toString(36).slice(2)+'.jpg';await FS.copyAsync({from:uri,to:dest});return dest;}
export async function removeImage(uri?:string){if(uri && FS.documentDirectory && uri.startsWith(FS.documentDirectory+'sources/'))await FS.deleteAsync(uri,{idempotent:true});}
if(Platform.OS!=='web')Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
export async function notificationAccess(request=false){if(Platform.OS==='web')return false;if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('life-notices',{name:'生活事項提醒',importance:Notifications.AndroidImportance.HIGH});let p=await Notifications.getPermissionsAsync();if(!p.granted && request)p=await Notifications.requestPermissionsAsync();return p.granted || p.ios?.status===Notifications.IosAuthorizationStatus.PROVISIONAL;}
let queue=Promise.resolve();
export function syncReminders(notices:Notice[],request=false):Promise<string>{let result='';const job=queue.then(async()=>{
  if(Platform.OS==='web'){result='網頁預覽不提供背景提醒，請使用手機原生版。';return;}
  if(!(await notificationAccess(request))){result='提醒尚未授權。事項已保存，可在設定中開啟通知。';return;}
  // Managed IDs make retries idempotent without deleting third-party or test notifications.
  const desired=reminderPlan(notices);const scheduled=await Notifications.getAllScheduledNotificationsAsync();
  const wanted=new Map(desired.map(p=>['life-'+p.id,p]));
  for(const old of scheduled.filter(s=>s.identifier.startsWith('life-'))){const p=wanted.get(old.identifier);if(p && old.content.data?.at===p.at && old.content.title===p.title)wanted.delete(old.identifier);else await Notifications.cancelScheduledNotificationAsync(old.identifier);}
  for(const [identifier,p] of wanted)await Notifications.scheduleNotificationAsync({identifier,content:{title:p.title,body:'有一件生活事項需要處理，點開查看準備清單。',sound:'default',data:{noticeId:p.id,at:p.at}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(p.at),channelId:'life-notices'}});
  const total=notices.filter(n=>!n.done&&n.dueAt&&n.remindMinutes!==null&&Date.parse(n.dueAt)-n.remindMinutes*60000>Date.now()).length;
  result=total>40?'已安排最近40筆提醒。再次開啟 App 時會補排後續事項。':`已安排 ${desired.length} 筆未來提醒。`;
});queue=job.catch(()=>{});return job.then(()=>result);}
export async function testReminder(){if(!(await notificationAccess(true)))throw new Error('請先在系統設定允許通知。');await Notifications.scheduleNotificationAsync({content:{title:'生活通知管家',body:'測試提醒已送達。',sound:'default'},trigger:{type:Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds:10,channelId:'life-notices'}});}
export async function exportFile(name:string,content:string,type:string){if(Platform.OS==='web'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}const path=FS.cacheDirectory+name;await FS.writeAsStringAsync(path,content,{encoding:FS.EncodingType.UTF8});if(!(await Sharing.isAvailableAsync()))throw new Error('這台裝置無法開啟系統分享。');await Sharing.shareAsync(path,{mimeType:type,UTI:type==='text/calendar'?'com.apple.ical.ics':'public.json'});}
export async function exportBackup(s:State){const clean=validateBackup(s);await exportFile('life-notice-backup.json',JSON.stringify(clean,null,2),'application/json');}
export async function exportCalendar(n:Notice){await exportFile('life-notice.ics',toCalendar(n),'text/calendar');}
export async function shareNotice(n:Notice){await Share.share({title:n.title,message:`${n.title}\n${n.dueAt?new Date(n.dueAt).toLocaleString('zh-TW'):'尚未設定日期'}\n負責人：${n.assignee}\n${n.checklist.map(c=>`${c.done?'☑':'□'} ${c.text}`).join('\n')}\n\n原始通知：\n${n.source}\n\n由生活通知管家分享（文字副本，不會自動同步完成狀態）`});}
export async function erase(){if(Platform.OS!=='web'){await Notifications.cancelAllScheduledNotificationsAsync();await FS.deleteAsync(FS.documentDirectory+'sources/',{idempotent:true});for(const name of ['life-notice-backup.json','life-notice.ics'])await FS.deleteAsync(FS.cacheDirectory+name,{idempotent:true});}await AsyncStorage.multiRemove([KEY,AUTO_CALENDAR_KEY,AI_SETTINGS_KEY,ALERT_LEVEL_KEY]);if(Platform.OS!=='web')await SecureStore.deleteItemAsync(OPENAI_KEY_KEY);listener?.setAiMode(false);}
