import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Linking,Platform,Pressable,StyleSheet,Switch,Text,ToastAndroid,View} from 'react-native';
import * as api from './services';
import {Button,Chips,Field,Icon,confirm,p,s} from './ui';
import type {State} from './domain';

function Group({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){
 const[open,setOpen]=useState(false);
 return <View style={styles.group}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={()=>setOpen(!open)} style={styles.row}><View style={s.flex}><Text style={s.cardTitle}>{title}</Text><Text style={s.caption}>{subtitle}</Text></View><Icon name={open?'chevron-up':'chevron-down'} size={18}/></Pressable>{open&&<View style={styles.inside}>{children}</View>}</View>;
}
function Action({title,detail,onPress,disabled=false}:{title:string;detail:string;onPress:()=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} accessibilityHint={detail} style={[styles.row,disabled&&{opacity:.5}]} onPress={onPress}><View style={s.flex}><Text style={s.body}>{title}</Text><Text style={s.caption}>{detail}</Text></View><Icon name="chevron-forward" size={18} color={p.muted}/></Pressable>;
}
export function SettingsPanel({data,onChange,onRestore,onPrivacy,onErase}:{data:State;onChange:()=>void;onRestore:()=>void;onPrivacy:()=>void;onErase:()=>void}){
 const[ai,setAi]=useState<api.AiSettings>({enabled:false,model:'gpt-5.6-luna'}),[hasKey,setHasKey]=useState(false),[key,setKey]=useState('');
 const[auto,setAuto]=useState(false),[level,setLevel]=useState<api.AlertLevel>('important'),[reminder,setReminder]=useState<number|null>(60);
 const[access,setAccess]=useState(false),[count,setCount]=useState(0),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const lock=useRef(false);
 const read=async()=>{setAccess(api.notificationListenerPermission());setCount(api.monitoredAppCount());setAi(await api.getAiSettings());setHasKey(await api.hasOpenAiKey());setAuto(await api.getAutoCalendarEnabled());setLevel(await api.getAlertLevel());setReminder(await api.getDefaultReminder());};
 useEffect(()=>{void read().catch(()=>setError('設定無法讀取，請重新開啟此頁。'));const sub=AppState.addEventListener('change',state=>{if(state==='active')void read().catch(()=>setError('無法更新狀態。'))});return()=>sub.remove()},[]);
 const feedback=(message:string)=>{setStatus(message);if(Platform.OS==='android')ToastAndroid.show(message,ToastAndroid.LONG);else Alert.alert('生活通知管家',message);};
 const perform=async(fn:()=>Promise<string|void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setStatus('');try{const message=await fn();if(message)feedback(message);await onChange();}catch(e){const message=e instanceof Error?e.message:'操作失敗，請重試。';setError(message);Alert.alert('無法完成操作',message);}finally{lock.current=false;setBusy(false)}};
 return <>
  <Text style={s.heading}>設定</Text>
  <View style={styles.summary}><View style={[styles.dot,{backgroundColor:access&&count>0?p.green:'#A47A34'}]}/><View style={s.flex}><Text style={s.cardTitle}>{Platform.OS!=='android'?'使用截圖或文字匯入':!access?'尚未開啟通知存取':count===0?'尚未選擇監聽 App':`正在監聽 ${count} 個 App`}</Text><Text style={s.caption}>{ai.enabled?'AI 語意辨識已啟用':'使用本機辨識'}</Text></View></View>
  {busy&&<View style={styles.feedback}><ActivityIndicator color={p.green}/><Text style={s.caption}>處理中，請稍候…</Text></View>}
  {!!error&&<Text accessibilityLiveRegion="assertive" style={s.warning}>{error}</Text>}{!!status&&<Text accessibilityLiveRegion="polite" style={s.info}>{status}</Text>}
  <Group title="監聽與快捷操作" subtitle="選擇 App、權限狀態、快速擷取">
   {Platform.OS==='android'?<><Action title="管理監聽的 App" detail={`已選 ${count} 個；進入後可搜尋、篩選與儲存選擇。`} disabled={busy} onPress={()=>void perform(async()=>api.openNotificationListenerSettings())}/>
   <Action title="加入快速擷取按鈕" detail="加入下拉快速設定；擷取最近符合條件的通知，嘗試加入行事曆。" disabled={busy} onPress={()=>void perform(async()=>{const requested=api.requestQuickCaptureTile();return requested?'請在系統提示中確認加入；完成後下拉快速設定使用。':'請下拉快速設定，點編輯並加入「快速擷取」。';})}/></>:<Text style={s.caption}>此系統不支援讀取其他 App 的通知。</Text>}
   <Action title="使用方式" detail="查看匯入、監聽與快速擷取的差異。" onPress={()=>Alert.alert('使用方式','截圖／貼上：整理你選的內容。\n\n監聽：只讀取已選 App 的新通知。\n\n快速擷取：處理最近符合條件的通知；無明確日期時仍需在 App 確認。')}/>
  </Group>
  <Group title="提醒偏好" subtitle="預設提前時間、即時提醒程度、測試通知">
   <Text style={s.label}>新建事件的預設提醒</Text><Chips<number|null> values={[[null,'不提醒'],[0,'準時'],[15,'15 分鐘'],[30,'30 分鐘'],[60,'1 小時'],[1440,'1 天']]} value={reminder} onChange={value=>void perform(async()=>{await api.setDefaultReminder(value);setReminder(value);return '已儲存，只套用到之後手動新增的事件。';})}/>
   <Text style={s.label}>新通知的即時提醒</Text><Chips<api.AlertLevel> values={[["important","重要優先"],["balanced","平衡"],["all","所有候選"]]} value={level} onChange={value=>void perform(async()=>{await api.setAlertLevel(value);setLevel(value);return '提醒偏好已儲存。';})}/>
   <Text style={s.caption}>{level==='important'?'只對改期、期限、預約等明確重要內容主動提醒。':level==='balanced'?'也提醒有日期且符合條件的候選通知。':'對所有通過內容過濾的候選通知提醒，可能較頻繁。'} 不會改變已建立事件的排程。</Text>
   <Action title="允許通知並重排提醒" detail="重新檢查權限，補排尚未到期的事件。" disabled={busy} onPress={()=>void perform(async()=>api.syncReminders(data.notices,true))}/>
   <Action title="發送測試提醒" detail="10 秒後送達；可先切到其他 App 測試。" disabled={busy} onPress={()=>void perform(async()=>{await api.testReminder();return '已排程，10 秒後會收到測試提醒。';})}/>
   <Action title="手機通知設定" detail="調整音效、震動與通知顯示權限。" onPress={()=>void perform(async()=>{await Linking.openSettings()})}/>
  </Group>
  <Group title="AI 與行事曆" subtitle="辨識模式、API key、手機行事曆同步">
   <View style={styles.row}><View style={s.flex}><Text style={s.body}>AI 語意辨識</Text><Text style={s.caption}>GPT-5.6 Luna；API 費用由你的帳戶支付。</Text></View><Switch accessibilityLabel="AI 語意辨識" disabled={busy} value={ai.enabled} onValueChange={enabled=>void perform(async()=>{if(enabled&&!hasKey)throw new Error('請先在下方驗證並儲存 API key。');if(enabled&&!await confirm('啟用後，已選 App 的候選通知、必要的近期事件摘要，以及你匯入的截圖會傳送至 OpenAI 分析，並產生 API 費用。'))return;const next={...ai,enabled};await api.setAiSettings(next);setAi(next);return enabled?'AI 已啟用。':'已切換成本機辨識。';})}/></View>
   <Text style={s.caption}>{hasKey?'金鑰已安全儲存。輸入新金鑰可替換；驗證失敗會保留原金鑰。':'尚未儲存金鑰，仍可使用本機辨識。'}</Text><Field label="OpenAI API key" value={key} onChange={setKey} secure max={2051} placeholder="sk-…"/>
   <Button label="驗證並儲存金鑰" disabled={busy||!key.trim()} onPress={()=>void perform(async()=>{await api.saveOpenAiKey(key);setKey('');setHasKey(true);return '金鑰已驗證並儲存，可開啟上方 AI 開關。';})}/>
   {hasKey&&<><Action title="檢查 API 連線" detail="檢查金鑰與模型權限，不會傳送通知內容。" disabled={busy} onPress={()=>void perform(async()=>{const saved=await api.getOpenAiKey();if(!saved)throw new Error('找不到金鑰。');await api.verifyOpenAiKey(saved);return '金鑰及模型權限正常；實際辨識仍受 API 額度限制。';})}/><Action title="移除金鑰" detail="同時停用 AI，不影響本機事件。" disabled={busy} onPress={()=>void perform(async()=>{await api.clearOpenAiKey();setKey('');setHasKey(false);setAi({...ai,enabled:false});return '已移除金鑰並停用 AI。';})}/></>}
   {Platform.OS==='android'&&<View style={styles.row}><View style={s.flex}><Text style={s.body}>自動加入手機行事曆</Text><Text style={s.caption}>將時間明確且通過檢查的偵測事件寫入；關閉不會刪除已加入的副本。</Text></View><Switch accessibilityLabel="自動加入手機行事曆" disabled={busy} value={auto} onValueChange={enabled=>void perform(async()=>{const saved=await api.setAutoCalendarEnabled(enabled);setAuto(saved);if(enabled&&!saved)throw new Error('未取得行事曆權限，仍可保存在 App。');return saved?'已開啟自動加入行事曆。':'已關閉自動加入行事曆。';})}/></View>}
  </Group>
  <Group title="資料與說明" subtitle="備份、還原、隱私、清除資料">
   <Action title="匯出備份" detail={`${data.notices.length} 筆事件；不包含圖片或 API key。`} disabled={busy} onPress={()=>void perform(async()=>{await api.exportBackup(data);return '已開啟分享，請選擇備份的儲存位置。';})}/>
   <Action title="還原備份" detail="使用 JSON 備份取代本機事件，執行前會確認。" onPress={onRestore}/>
   <Action title="隱私權說明" detail="了解本機資料、通知權限與 AI 的傳送範圍。" onPress={onPrivacy}/>
   <Action title="清除全部本機資料" detail="永久清除事件、圖片與金鑰，執行前會再次確認。" onPress={onErase}/>
  </Group>
  <Text style={[s.caption,{textAlign:'center',marginVertical:22}]}>生活通知管家 1.5.4</Text>
 </>;
}
const styles=StyleSheet.create({group:{backgroundColor:'white',borderRadius:18,borderWidth:1,borderColor:p.border,marginBottom:12},row:{flexDirection:'row',alignItems:'center',gap:12,padding:16,minHeight:64},inside:{paddingHorizontal:16,paddingBottom:16},summary:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:p.mint,padding:16,borderRadius:18,marginBottom:22},dot:{width:10,height:10,borderRadius:5},feedback:{flexDirection:'row',alignItems:'center',gap:10,padding:12}});
