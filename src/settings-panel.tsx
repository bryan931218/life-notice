import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Linking,Platform,Pressable,StyleSheet,Switch,Text,ToastAndroid,View} from 'react-native';
import * as api from './services';
import {Button,Chips,Field,Icon,confirm,p,s} from './ui';
import type {State} from './domain';

function Group({title,subtitle,children,icon,color}:{title:string;subtitle:string;children:React.ReactNode;icon:React.ComponentProps<typeof Icon>['name'];color:string}){
 const[open,setOpen]=useState(false);
 return <View style={styles.group}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={()=>setOpen(!open)} style={styles.row}><View style={{width:44,height:44,borderRadius:15,backgroundColor:color,alignItems:'center',justifyContent:'center'}}><Icon name={icon}/></View><View style={s.flex}><Text style={s.cardTitle}>{title}</Text><Text style={s.caption}>{subtitle}</Text></View><Icon name={open?'chevron-up':'chevron-down'} size={18}/></Pressable>{open&&<View style={styles.inside}>{children}</View>}</View>;
}
function Action({title,detail,onPress,disabled=false}:{title:string;detail:string;onPress:()=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} accessibilityHint={detail} style={[styles.row,disabled&&{opacity:.5}]} onPress={onPress}><View style={s.flex}><Text style={s.body}>{title}</Text><Text style={s.caption}>{detail}</Text></View><Icon name="chevron-forward" size={18} color={p.muted}/></Pressable>;
}
export function SettingsPanel({data,onChange,onRestore,onPrivacy,onErase}:{data:State;onChange:()=>void;onRestore:()=>void;onPrivacy:()=>void;onErase:()=>void}){
 const[ai,setAi]=useState<api.AiSettings>({enabled:false,model:'gpt-5.6-luna'}),[hasKey,setHasKey]=useState(false),[key,setKey]=useState('');
 const[auto,setAuto]=useState(false),[level,setLevel]=useState<api.AlertLevel>('important'),[reminder,setReminder]=useState<number|null>(60);
 const[access,setAccess]=useState(false),[connected,setConnected]=useState(false),[notifyAccess,setNotifyAccess]=useState(false),[count,setCount]=useState(0),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const lock=useRef(false);
 const read=async()=>{setAccess(api.notificationListenerPermission());setConnected(api.notificationListenerConnected());setNotifyAccess(await api.notificationAccess(false));setCount(api.monitoredAppCount());setAi(await api.getAiSettings());setHasKey(await api.hasOpenAiKey());setAuto(await api.getAutoCalendarEnabled());setLevel(await api.getAlertLevel());setReminder(await api.getDefaultReminder());};
 useEffect(()=>{void read().catch(()=>setError('設定無法讀取，請重新開啟此頁。'));const sub=AppState.addEventListener('change',state=>{if(state==='active')void read().catch(()=>setError('無法更新狀態。'))});return()=>sub.remove()},[]);
 const feedback=(message:string)=>{setStatus(message);if(Platform.OS==='android')ToastAndroid.show(message,ToastAndroid.LONG);else Alert.alert('生活通知管家',message);};
 const perform=async(fn:()=>Promise<string|void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setStatus('');try{const message=await fn();if(message)feedback(message);await onChange();}catch(e){const message=e instanceof Error?e.message:'操作失敗，請重試。';setError(message);Alert.alert('無法完成操作',message);}finally{lock.current=false;setBusy(false)}};
 return <>
  <Text style={s.heading}>設定</Text>
  <View style={styles.summary}><View style={[styles.dot,{backgroundColor:access&&count>0&&connected?p.green:'#A47A34'}]}/><View style={s.flex}><Text style={s.cardTitle}>{Platform.OS!=='android'?'使用截圖或文字匯入':!access?'尚未允許讀取其他 App 通知':count===0?'通知存取已開，但尚未指定來源':!connected?'通知服務正在重新連線':`正在監聽 ${count} 個 App`}</Text><Text style={s.caption}>{Platform.OS==='android'&&count===0?'請在「管理監聽的 App」勾選 LINE、Messenger 等來源並儲存。':!connected&&Platform.OS==='android'?'Android 尚未回報監聽服務已連線，可在下方重新連線。':ai.enabled?'AI 語意辨識已啟用':'使用本機辨識'}</Text></View></View>
  {Platform.OS!=='web'&&!notifyAccess&&<Text style={s.warning}>尚未允許生活通知管家傳送通知。行程仍會保存，但你不會收到建立結果及到期提醒。</Text>}
  {busy&&<View style={styles.feedback}><ActivityIndicator color={p.green}/><Text style={s.caption}>處理中，請稍候…</Text></View>}
  {!!error&&<Text accessibilityLiveRegion="assertive" style={s.warning}>{error}</Text>}{!!status&&<Text accessibilityLiveRegion="polite" style={s.info}>{status}</Text>}
  <Group icon="apps-outline" color="#E8EEE2" title="監聽與快捷操作" subtitle="選擇 App、權限狀態、快速擷取">
   {Platform.OS==='android'?<><Action title="管理監聽的 App" detail={`已選 ${count} 個；進入後可搜尋、篩選與儲存選擇。`} disabled={busy} onPress={()=>void perform(async()=>api.openNotificationListenerSettings())}/>
   {access&&count>0&&!connected&&<Action title="重新連線並補掃通知" detail="要求 Android 重新啟動監聽服務，並讀取通知欄仍存在的訊息。" disabled={busy} onPress={()=>void perform(async()=>{if(!api.reconnectNotificationListener())throw new Error('重新連線失敗，請重新開啟通知存取權限。');await new Promise(resolve=>setTimeout(resolve,800));await read();return '已要求 Android 重新連線。';})}/>}
   <Action title="加入快速擷取按鈕" detail="加入下拉快速設定；擷取最近符合條件的通知，嘗試加入行事曆。" disabled={busy} onPress={()=>void perform(async()=>{const requested=api.requestQuickCaptureTile();return requested?'請在系統提示中確認加入；完成後下拉快速設定使用。':'請下拉快速設定，點編輯並加入「快速擷取」。';})}/></>:<Text style={s.caption}>此系統不支援讀取其他 App 的通知。</Text>}
   <Action title="使用方式" detail="查看匯入、監聽與快速擷取的差異。" onPress={()=>Alert.alert('使用方式','截圖／貼上：找出你選擇內容中的行程。\n\n監聽：背景收集已選 App 的候選通知，只保留有明確日期的個人行程。\n\n快速擷取：處理最近符合條件的通知；廣告、一般聊天與待辦會略過。')}/>
  </Group>
  <Group icon="notifications-outline" color="#F9E4D8" title="提醒偏好" subtitle="預設提前時間、即時提醒程度、測試通知">
   <Text style={s.label}>新建事件的預設提醒</Text><Chips<number|null> values={[[null,'不提醒'],[0,'準時'],[15,'15 分鐘'],[30,'30 分鐘'],[60,'1 小時'],[1440,'1 天']]} value={reminder} onChange={value=>void perform(async()=>{await api.setDefaultReminder(value);setReminder(value);return '已儲存，只套用到之後手動新增的事件。';})}/>
   <Text style={s.label}>新通知的即時提醒</Text><Chips<api.AlertLevel> values={[["important","重要優先"],["balanced","平衡"],["all","所有候選"]]} value={level} onChange={value=>void perform(async()=>{await api.setAlertLevel(value);setLevel(value);return '提醒偏好已儲存。';})}/>
   <Text style={s.caption}>{level==='important'?'只對改期、預約等明確重要行程主動提醒。':level==='balanced'?'也提醒有日期且符合條件的候選行程。':'對所有通過內容過濾的候選行程提醒，可能較頻繁。'} 不會改變已建立行程的排程。</Text>
   <Action title={notifyAccess?'重新排程所有提醒':'允許生活通知管家傳送通知'} detail={notifyAccess?'重新檢查並補排尚未到期的事件。':'這和「讀取其他 App 通知」是不同權限；開啟後才會收到建立結果及到期提醒。'} disabled={busy} onPress={()=>void perform(async()=>{const result=await api.syncReminders(data.notices,true);await read();return result;})}/>
   <Action title="發送測試提醒" detail="10 秒後送達；可先切到其他 App 測試。" disabled={busy} onPress={()=>void perform(async()=>{await api.testReminder();return '已排程，10 秒後會收到測試提醒。';})}/>
   <Action title="手機通知設定" detail="調整音效、震動與通知顯示權限。" onPress={()=>void perform(async()=>{await Linking.openSettings()})}/>
  </Group>
  <Group icon="sparkles-outline" color="#EBE5F5" title="AI 與行事曆" subtitle="辨識模式、API key、手機行事曆同步">
   <View style={styles.row}><View style={s.flex}><Text style={s.body}>AI 語意辨識</Text><Text style={s.caption}>開啟後採高召回模式：候選通知交給 AI 判斷，但只會建立有明確日期的個人行程。API 費用由你的帳戶支付。</Text></View><Switch accessibilityLabel="AI 語意辨識" disabled={busy} value={ai.enabled} onValueChange={enabled=>void perform(async()=>{if(enabled&&!hasKey)throw new Error('請先在下方驗證並儲存 API key。');if(enabled&&!await confirm('啟用後，已選 App 中除驗證碼、廣告與系統狀態等明確垃圾訊息外，通知內容與必要的近期行程摘要都會傳送至 OpenAI 分析，並產生 API 費用。AI 只會建立有明確日期的個人行程。'))return;const next={...ai,enabled};await api.setAiSettings(next);setAi(next);return enabled?'AI 行程辨識已啟用。':'已切換成本機辨識。';})}/></View>
   <Text style={s.caption}>{hasKey?'金鑰已安全儲存。輸入新金鑰可替換；驗證失敗會保留原金鑰。':'尚未儲存金鑰，仍可使用本機辨識。'}</Text><Field label="OpenAI API key" value={key} onChange={setKey} secure max={2051} placeholder="sk-…"/>
   <Button label="驗證並儲存金鑰" disabled={busy||!key.trim()} onPress={()=>void perform(async()=>{await api.saveOpenAiKey(key);setKey('');setHasKey(true);return '金鑰已驗證並儲存，可開啟上方 AI 開關。';})}/>
   {hasKey&&<><Action title="檢查 API 連線" detail="檢查金鑰與模型權限，不會傳送通知內容。" disabled={busy} onPress={()=>void perform(async()=>{const saved=await api.getOpenAiKey();if(!saved)throw new Error('找不到金鑰。');await api.verifyOpenAiKey(saved);return '金鑰及模型權限正常；實際辨識仍受 API 額度限制。';})}/><Action title="移除金鑰" detail="同時停用 AI，不影響本機事件。" disabled={busy} onPress={()=>void perform(async()=>{await api.clearOpenAiKey();setKey('');setHasKey(false);setAi({...ai,enabled:false});return '已移除金鑰並停用 AI。';})}/></>}
   {Platform.OS==='android'&&<View style={styles.row}><View style={s.flex}><Text style={s.body}>自動加入手機行事曆</Text><Text style={s.caption}>{auto?'已開啟：App 關閉時，只有日期、時間與行程意圖都明確且通過垃圾過濾的內容會直接寫入；其他內容保留到 App 內確認。':'目前關閉：抓到通知後只會保存在 App，或由你點快捷按鈕加入。'}</Text></View><Switch accessibilityLabel="自動加入手機行事曆" disabled={busy} value={auto} onValueChange={enabled=>void perform(async()=>{const saved=await api.setAutoCalendarEnabled(enabled);setAuto(saved);if(enabled&&!saved)throw new Error('未取得行事曆權限，仍可保存在 App。');return saved?'已開啟安全背景寫入。':'已關閉自動加入行事曆。';})}/></View>}
  </Group>
  <Group icon="file-tray-outline" color="#E5EDF3" title="資料與說明" subtitle="備份、還原、隱私、清除資料">
   <Action title="匯出備份" detail={`${data.notices.length} 筆事件；不包含圖片或 API key。`} disabled={busy} onPress={()=>void perform(async()=>{await api.exportBackup(data);return '已開啟分享，請選擇備份的儲存位置。';})}/>
   <Action title="還原備份" detail="使用 JSON 備份取代本機事件，執行前會確認。" onPress={onRestore}/>
   <Action title="隱私權說明" detail="了解本機資料、通知權限與 AI 的傳送範圍。" onPress={onPrivacy}/>
   <Action title="清除全部本機資料" detail="清除事件、圖片、金鑰及監聽設定；保留手機行事曆副本。" onPress={onErase}/>
  </Group>
  <Text style={[s.caption,{textAlign:'center',marginVertical:22}]}>生活通知管家 1.7.0</Text>
 </>;
}
const styles=StyleSheet.create({group:{backgroundColor:'white',borderRadius:24,borderWidth:1,borderColor:p.border,marginBottom:12},row:{flexDirection:'row',alignItems:'center',gap:12,padding:16,minHeight:64},inside:{paddingHorizontal:16,paddingBottom:16},summary:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:p.mint,padding:16,borderRadius:18,marginBottom:22},dot:{width:10,height:10,borderRadius:5},feedback:{flexDirection:'row',alignItems:'center',gap:10,padding:12}});
