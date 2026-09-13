import React,{useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {CATEGORIES,dateFields,type Category,type Notice} from './domain';
import {Button,Chips,Field,Icon,p,s} from './ui';
export type Draft={title:string;source:string;image?:string;category:Category;date:string;time:string;endTime:string;endDate:string;location:string;assignee:string;checks:string;remind:number|null;editing?:string};

export function EventEditor({draft,patch,onImage,onPaste,onSave,busy,message,warnings}:{draft:Draft;patch:(value:Partial<Draft>)=>void;onImage:()=>void;onPaste:()=>void;onSave:()=>void;busy:boolean;message:string;warnings:string[]}){
 const [sourceOpen,setSourceOpen]=useState(false);
 const scheduled=!!draft.date||!!draft.time;
 const today=dateFields(new Date().toISOString()).date;
 const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
 return <>
  <Text style={s.eyebrow}>{draft.editing?'調整安排':'記下一件事'}</Text>
  <Text style={s.heading}>{draft.editing?'編輯項目':'新增項目'}</Text>
  {!draft.editing&&<View style={e.capture}><Button label="從截圖辨識" secondary onPress={onImage}/><Button label="貼上文字" secondary onPress={onPaste}/></View>}
  {!!message&&<Text accessibilityLiveRegion="polite" style={s.info}>{message}</Text>}
  {warnings.map(w=><Text key={w} style={s.warning}>{w}</Text>)}
  <View style={e.section}>
   <Field label="名稱" value={draft.title} onChange={title=>patch({title})} max={100} placeholder="想做什麼？"/>
   <Text style={[s.label,{marginTop:16}]}>分類</Text><Chips values={CATEGORIES.map(c=>[c,c] as const)} value={draft.category} onChange={category=>patch({category})}/>
  </View>
  <View style={e.section}>
   <View style={s.row}><View style={[e.icon,{backgroundColor:'#F9E4D8'}]}><Icon name="time-outline" color="#925B41"/></View><Text style={e.title}>日期與提醒</Text></View>
   <Chips values={[["todo","無期限待辦"],["event","安排日期"]] as const} value={scheduled?'event':'todo'} onChange={value=>patch(value==='todo'?{date:'',time:'',endTime:'',endDate:''}:{date:today})}/>
   {scheduled&&<>
    <View style={e.quickDays}>{[[today,'今天'],[dateFields(tomorrow.toISOString()).date,'明天']].map(([date,label])=><Pressable key={label} accessibilityRole="button" onPress={()=>patch({date})} style={e.quickDay}><Text style={e.quickDayText}>{label}</Text></Pressable>)}</View>
    <Field label="開始日期" value={draft.date} max={10} onChange={date=>patch({date})} placeholder="YYYY-MM-DD"/>
    <Field label="開始時間（留空為全天）" value={draft.time} max={5} onChange={time=>patch({time})} placeholder="HH:mm"/>
    {!!draft.time&&<View style={s.row}><View style={{flex:1.3}}><Field label="結束日期（選填）" value={draft.endDate} max={10} onChange={endDate=>patch({endDate})} placeholder={draft.date}/></View><View style={s.flex}><Field label="結束時間" value={draft.endTime} max={5} onChange={endTime=>patch({endTime})} placeholder="HH:mm"/></View></View>}
    <Text style={[s.label,{marginTop:18}]}>提前提醒</Text><Chips<number|null> values={[[null,'不提醒'],[0,'準時'],[15,'15 分鐘'],[30,'30 分鐘'],[60,'1 小時'],[1440,'1 天']]} value={draft.remind} onChange={remind=>patch({remind})}/>
   </>}
  </View>
  <View style={e.section}>
   <View style={s.row}><View style={[e.icon,{backgroundColor:'#EBE5F5'}]}><Icon name="list-outline" color="#73608D"/></View><Text style={e.title}>補充細節</Text></View>
   {scheduled&&<Field label="地點（選填）" value={draft.location} max={200} onChange={location=>patch({location})} placeholder="店名、地址或會議室"/>}
   <Field label="準備事項（選填）" value={draft.checks} onChange={checks=>patch({checks})} multiline placeholder="每行一項，例如：帶水壺"/>
  </View>
  <Pressable accessibilityRole="button" accessibilityState={{expanded:sourceOpen}} onPress={()=>setSourceOpen(!sourceOpen)} style={e.sourceToggle}><Icon name="document-text-outline" size={20}/><Text style={[s.body,s.flex]}>原始內容{draft.image?'與截圖':''}</Text><Icon name={sourceOpen?'chevron-up':'chevron-down'} size={18}/></Pressable>
  {sourceOpen&&<><Field label="原始內容" value={draft.source} onChange={source=>patch({source})} multiline/>{draft.image&&<Image accessibilityLabel="原始截圖" source={{uri:draft.image}} style={s.sourcePreview} resizeMode="contain"/>}</>}
 </>;
}

export function DetailHeading({notice,when}:{notice:Notice;when:string}){
 return <View style={e.detail}>
  <View style={s.row}><View style={e.badge}><Text style={e.badgeText}>{notice.category}</Text></View><Text style={s.caption}>{notice.done?'已完成':notice.needsReview?'待確認':notice.dueAt?'行程':'待辦'}</Text></View>
  <Text selectable style={[s.heading,{marginTop:18,marginBottom:20}]}>{notice.title}</Text>
  <View style={[s.row,{alignItems:'flex-start'}]}><Icon name="calendar-outline"/><View style={s.flex}><Text style={e.when}>{when}</Text>{notice.endAt&&!notice.allDay&&<Text style={s.caption}>至 {new Date(notice.endAt).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}</Text>}<Text style={[s.caption,{marginTop:4}]}>{notice.done?'已完成，不再提醒':notice.needsReview?'待確認，尚未排程提醒':notice.remindMinutes!==null&&notice.dueAt&&Date.parse(notice.dueAt)-notice.remindMinutes*60000<=Date.now()?'提醒時間已過':notice.remindMinutes===null?'未設定提醒':notice.remindMinutes===0?'準時提醒':`提前 ${notice.remindMinutes>=1440?`${notice.remindMinutes/1440} 天`:notice.remindMinutes>=60?`${notice.remindMinutes/60} 小時`:`${notice.remindMinutes} 分鐘`}提醒`}</Text></View></View>
 </View>;
}
const e=StyleSheet.create({section:{backgroundColor:'white',borderRadius:24,padding:18,marginBottom:16,borderWidth:1,borderColor:p.border},title:{fontSize:18,fontWeight:'700',color:p.ink},icon:{width:38,height:38,borderRadius:13,alignItems:'center',justifyContent:'center'},capture:{flexDirection:'row',justifyContent:'space-between',gap:8,marginBottom:12},quickDays:{flexDirection:'row',gap:8},quickDay:{minHeight:44,paddingHorizontal:20,justifyContent:'center',backgroundColor:p.paper,borderRadius:14},quickDayText:{color:p.green,fontWeight:'600'},sourceToggle:{flexDirection:'row',gap:12,alignItems:'center',minHeight:56,marginBottom:12},detail:{backgroundColor:'#E8EEE2',padding:24,borderRadius:28,marginBottom:22},badge:{backgroundColor:'white',paddingHorizontal:14,paddingVertical:7,borderRadius:20},badgeText:{fontWeight:'700',color:p.green},when:{fontSize:17,lineHeight:26,fontWeight:'600',color:p.ink}});
