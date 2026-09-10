import React,{useMemo,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {Category,Notice} from './domain';
import {CATEGORIES} from './domain';
import {dayKey,monthGrid,monthTitle,noticesForDay,noticesForMonth,shiftMonth} from './calendar';
import {Icon,p} from './ui';

const WEEK=['日','一','二','三','四','五','六'];
const catColor:Record<Category,string>={生活:'#4B8B7C',學校:'#4F6BFF',帳單:'#D47A30',取件:'#7A63C7',活動:'#C75065'};
const timeLabel=(n:Notice)=>{
  if(!n.dueAt)return '待確認';
  if(n.allDay)return '全天';
  return new Date(n.dueAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});
};
const prettyDay=(key:string)=>new Date(`${key}T12:00:00`).toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'});

export function MonthCalendar({notices,onOpen,onAdd}:{notices:Notice[];onOpen:(id:string)=>void;onAdd:(date:string)=>void}){
  const now=new Date();
  const [month,setMonth]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));
  const [selected,setSelected]=useState(()=>dayKey(now));
  const [filter,setFilter]=useState<'全部'|Category>('全部');
  const filtered=useMemo(()=>filter==='全部'?notices:notices.filter(n=>n.category===filter),[notices,filter]);
  const cells=useMemo(()=>monthGrid(month),[month]);
  const monthly=useMemo(()=>noticesForMonth(filtered,month),[filtered,month]);
  const dayItems=useMemo(()=>noticesForDay(filtered,selected),[filtered,selected]);
  const undated=filtered.filter(n=>!n.done&&!n.dueAt);
  const isCurrentMonth=month.getFullYear()===now.getFullYear()&&month.getMonth()===now.getMonth();
  const goToday=()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1));setSelected(dayKey(d));};

  return <>
    <View style={c.shell}>
      <View style={c.monthHeader}>
        <View><Text style={c.monthEyebrow}>我的月曆</Text><Text style={c.monthTitle}>{monthTitle(month)}</Text></View>
        <View style={c.navRow}>
          <Pressable accessibilityLabel="上個月" style={c.iconButton} onPress={()=>setMonth(m=>shiftMonth(m,-1))}><Icon name="chevron-back" size={20}/></Pressable>
          <Pressable accessibilityLabel="今天" style={[c.todayButton,isCurrentMonth&&c.todayButtonActive]} onPress={goToday}><Text style={[c.todayText,isCurrentMonth&&c.todayTextActive]}>今天</Text></Pressable>
          <Pressable accessibilityLabel="下個月" style={c.iconButton} onPress={()=>setMonth(m=>shiftMonth(m,1))}><Icon name="chevron-forward" size={20}/></Pressable>
        </View>
      </View>

      <View style={c.statsRow}>
        <View style={c.stat}><Text style={c.statNum}>{monthly.length}</Text><Text style={c.statLabel}>本月行程</Text></View>
        <View style={c.statDivider}/>
        <View style={c.stat}><Text style={c.statNum}>{undated.length}</Text><Text style={c.statLabel}>時間待確認</Text></View>
        <View style={c.statDivider}/>
        <View style={c.stat}><Text style={c.statNum}>{monthly.filter(n=>n.aiConfidence!==undefined).length}</Text><Text style={c.statLabel}>AI / 自動整理</Text></View>
      </View>

      <View style={c.filters}>
        {(['全部',...CATEGORIES] as const).map(v=><Pressable key={v} style={[c.filterChip,filter===v&&c.filterChipOn]} onPress={()=>setFilter(v)}><Text style={[c.filterText,filter===v&&c.filterTextOn]}>{v}</Text></Pressable>)}
      </View>

      <View style={c.weekRow}>{WEEK.map(w=><Text key={w} style={c.week}>{w}</Text>)}</View>
      <View style={c.grid}>{cells.map(d=>{
        const key=dayKey(d),items=noticesForDay(filtered,key),inMonth=d.getMonth()===month.getMonth(),today=key===dayKey(now),active=key===selected;
        return <Pressable key={key} accessibilityLabel={`${key}，${items.length} 個行程`} onPress={()=>{setSelected(key);if(!inMonth)setMonth(new Date(d.getFullYear(),d.getMonth(),1));}} style={[c.day,active&&c.dayActive]}>
          <View style={[c.dayNumWrap,today&&c.todayCircle]}><Text style={[c.dayNum,!inMonth&&c.dayMuted,active&&c.dayNumActive,today&&!active&&c.todayNum]}>{d.getDate()}</Text></View>
          <View style={c.dots}>{items.slice(0,3).map(n=><View key={n.id} style={[c.dot,{backgroundColor:catColor[n.category]}]}/>)}</View>
          {items.length>3&&<Text style={[c.more,active&&{color:'white'}]}>+{items.length-3}</Text>}
        </Pressable>})}</View>
    </View>

    <View style={c.agendaHeader}><View><Text style={c.agendaTitle}>{prettyDay(selected)}</Text><Text style={c.agendaSub}>{dayItems.length?`${dayItems.length} 個行程`:'目前沒有行程'}</Text></View><Pressable style={c.addButton} onPress={()=>onAdd(selected)}><Icon name="add" size={22} color="white"/><Text style={c.addText}>新增</Text></Pressable></View>
    {dayItems.length?dayItems.map(n=><Pressable key={n.id} style={c.eventCard} onPress={()=>onOpen(n.id)}>
      <View style={[c.eventStripe,{backgroundColor:catColor[n.category]}]}/>
      <View style={c.eventTime}><Text style={c.eventTimeText}>{timeLabel(n)}</Text><Text style={c.eventCat}>{n.category}</Text></View>
      <View style={c.eventBody}><View style={c.eventTitleRow}><Text numberOfLines={2} style={c.eventTitle}>{n.title}</Text>{n.needsReview&&<View style={c.reviewBadge}><Text style={c.reviewText}>待確認</Text></View>}</View>{n.location?<Text numberOfLines={1} style={c.eventMeta}>📍 {n.location}</Text>:null}<Text numberOfLines={1} style={c.eventMeta}>{n.aiConfidence!==undefined?'✨ AI / 自動整理':'手動加入'} · {n.assignee}</Text></View>
      <Icon name="chevron-forward" size={18} color={p.muted}/>
    </Pressable>):<View style={c.empty}><View style={c.emptyIcon}><Icon name="sunny-outline" size={24}/></View><View style={{flex:1}}><Text style={c.emptyTitle}>這天很乾淨</Text><Text style={c.emptyText}>有新的重要通知或手動行程時，會出現在這裡。</Text></View></View>}

    {undated.length>0&&<><Text style={c.secondaryTitle}>時間待確認</Text>{undated.slice(0,5).map(n=><Pressable key={n.id} style={c.undated} onPress={()=>onOpen(n.id)}><View style={c.undatedIcon}><Icon name="help-circle-outline"/></View><View style={{flex:1}}><Text style={c.undatedTitle}>{n.title}</Text><Text style={c.eventMeta}>{n.category} · 點開補上時間</Text></View><Icon name="chevron-forward" size={18} color={p.muted}/></Pressable>)}</>}
  </>;
}

const c=StyleSheet.create({
  shell:{backgroundColor:'white',borderRadius:26,borderWidth:1,borderColor:'#E3ECE9',padding:16,shadowColor:'#173B34',shadowOpacity:.06,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:2},
  monthHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:14},monthEyebrow:{fontSize:12,fontWeight:'700',color:p.green,letterSpacing:.7,marginBottom:3},monthTitle:{fontSize:24,fontWeight:'800',color:p.ink,letterSpacing:-.5},navRow:{flexDirection:'row',alignItems:'center',gap:7},iconButton:{width:38,height:38,borderRadius:13,backgroundColor:'#F0F6F3',alignItems:'center',justifyContent:'center'},todayButton:{height:38,paddingHorizontal:12,borderRadius:13,backgroundColor:'#F0F6F3',alignItems:'center',justifyContent:'center'},todayButtonActive:{backgroundColor:p.mint},todayText:{fontSize:13,fontWeight:'700',color:p.muted},todayTextActive:{color:p.green},
  statsRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#F7FAF9',borderRadius:18,paddingVertical:11,marginBottom:13},stat:{flex:1,alignItems:'center'},statNum:{fontSize:19,fontWeight:'800',color:p.ink},statLabel:{fontSize:10.5,color:p.muted,marginTop:1},statDivider:{width:1,height:28,backgroundColor:'#DDE8E4'},
  filters:{flexDirection:'row',gap:7,flexWrap:'wrap',marginBottom:14},filterChip:{borderRadius:999,paddingHorizontal:11,paddingVertical:7,backgroundColor:'#F2F6F5'},filterChipOn:{backgroundColor:p.green},filterText:{fontSize:12,fontWeight:'600',color:p.muted},filterTextOn:{color:'white'},
  weekRow:{flexDirection:'row',marginBottom:4},week:{width:'14.2857%',textAlign:'center',fontSize:12,fontWeight:'700',color:'#84928E'},grid:{flexDirection:'row',flexWrap:'wrap'},day:{width:'14.2857%',height:58,alignItems:'center',paddingTop:5,borderRadius:14},dayActive:{backgroundColor:p.green},dayNumWrap:{width:27,height:27,borderRadius:14,alignItems:'center',justifyContent:'center'},todayCircle:{borderWidth:1.5,borderColor:p.green},dayNum:{fontSize:13,fontWeight:'700',color:p.ink},dayNumActive:{color:'white'},dayMuted:{color:'#B6C0BD'},todayNum:{color:p.green},dots:{height:7,flexDirection:'row',gap:2,alignItems:'center'},dot:{width:4.5,height:4.5,borderRadius:3},more:{fontSize:8.5,color:p.muted,lineHeight:9},
  agendaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:24,marginBottom:12},agendaTitle:{fontSize:20,fontWeight:'800',color:p.ink},agendaSub:{fontSize:13,color:p.muted,marginTop:3},addButton:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:p.green,paddingHorizontal:13,paddingVertical:10,borderRadius:14},addText:{color:'white',fontWeight:'700',fontSize:13},
  eventCard:{flexDirection:'row',alignItems:'center',backgroundColor:'white',borderRadius:18,borderWidth:1,borderColor:'#E3ECE9',marginBottom:10,overflow:'hidden',paddingRight:14,minHeight:82},eventStripe:{width:5,alignSelf:'stretch'},eventTime:{width:70,paddingHorizontal:10,alignItems:'center'},eventTimeText:{fontSize:14,fontWeight:'800',color:p.ink},eventCat:{fontSize:11,color:p.muted,marginTop:4},eventBody:{flex:1,paddingVertical:13},eventTitleRow:{flexDirection:'row',alignItems:'center',gap:8},eventTitle:{flex:1,fontSize:16,fontWeight:'700',color:p.ink,lineHeight:21},eventMeta:{fontSize:12.5,color:p.muted,marginTop:4},reviewBadge:{paddingHorizontal:7,paddingVertical:3,borderRadius:999,backgroundColor:'#FFF0D8'},reviewText:{fontSize:10,fontWeight:'800',color:'#9A5A11'},
  empty:{flexDirection:'row',alignItems:'center',gap:13,backgroundColor:'#EEF7F3',borderRadius:18,padding:16},emptyIcon:{width:43,height:43,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:16,fontWeight:'700',color:p.ink},emptyText:{fontSize:12.5,lineHeight:19,color:p.muted,marginTop:2},secondaryTitle:{fontSize:17,fontWeight:'800',color:p.ink,marginTop:24,marginBottom:10},undated:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'white',borderRadius:16,borderWidth:1,borderColor:'#E3ECE9',padding:13,marginBottom:8},undatedIcon:{width:40,height:40,borderRadius:13,backgroundColor:'#FFF4E3',alignItems:'center',justifyContent:'center'},undatedTitle:{fontSize:15,fontWeight:'700',color:p.ink}
});
