import React,{useMemo,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {Category,Notice} from './domain';
import {dayKey,monthGrid,monthTitle,noticesForDay,shiftMonth} from './calendar';
import {Icon,p} from './ui';

const WEEK=['日','一','二','三','四','五','六'];
const catColor:Record<Category,string>={生活:'#4B8B7C',學校:'#4F6BFF',帳單:'#D47A30',取件:'#7A63C7',活動:'#C75065'};
const timeLabel=(n:Notice)=>!n.dueAt?'待確認':n.allDay?'全天':new Date(n.dueAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});
const prettyDay=(key:string)=>new Date(`${key}T12:00:00`).toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'});

export function MonthCalendar({notices,onOpen,onAdd}:{notices:Notice[];onOpen:(id:string)=>void;onAdd:(date:string)=>void}){
  const now=new Date();
  const [month,setMonth]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));
  const [selected,setSelected]=useState(()=>dayKey(now));
  const cells=useMemo(()=>monthGrid(month),[month]);
  const dayItems=useMemo(()=>noticesForDay(notices,selected),[notices,selected]);
  const undated=notices.filter(n=>!n.done&&!n.dueAt&&!!n.needsReview);
  const goToday=()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1));setSelected(dayKey(d))};

  return <>
    <View style={c.shell}>
      <View style={c.header}>
        <Text style={c.title}>{monthTitle(month)}</Text>
        <View style={c.nav}>
          <Pressable accessibilityLabel="上個月" style={c.iconButton} onPress={()=>setMonth(m=>shiftMonth(m,-1))}><Icon name="chevron-back" size={19}/></Pressable>
          <Pressable accessibilityLabel="今天" style={c.todayButton} onPress={goToday}><Text style={c.todayText}>今天</Text></Pressable>
          <Pressable accessibilityLabel="下個月" style={c.iconButton} onPress={()=>setMonth(m=>shiftMonth(m,1))}><Icon name="chevron-forward" size={19}/></Pressable>
        </View>
      </View>
      <View style={c.weekRow}>{WEEK.map(w=><Text key={w} style={c.week}>{w}</Text>)}</View>
      <View style={c.grid}>{cells.map(d=>{
        const key=dayKey(d),items=noticesForDay(notices,key),inMonth=d.getMonth()===month.getMonth(),today=key===dayKey(now),active=key===selected;
        return <Pressable key={key} accessibilityLabel={`${key}，${items.length} 個行程`} onPress={()=>{setSelected(key);if(!inMonth)setMonth(new Date(d.getFullYear(),d.getMonth(),1))}} style={[c.day,active&&c.dayActive]}>
          <Text style={[c.dayNum,!inMonth&&c.muted,active&&c.dayNumActive,today&&!active&&c.today]}>{d.getDate()}</Text>
          <View style={c.dots}>{items.slice(0,3).map(n=><View key={n.id} style={[c.dot,{backgroundColor:active?'white':catColor[n.category]}]}/>)}</View>
        </Pressable>
      })}</View>
    </View>

    <View style={c.agendaHeader}><View><Text style={c.agendaTitle}>{prettyDay(selected)}</Text><Text style={c.agendaSub}>{dayItems.length?`${dayItems.length} 個行程`:'沒有行程'}</Text></View><Pressable accessibilityLabel="在這天新增行程" style={c.add} onPress={()=>onAdd(selected)}><Icon name="add" color="white" size={22}/></Pressable></View>
    {dayItems.map(n=><Pressable key={n.id} style={c.event} onPress={()=>onOpen(n.id)}>
      <View style={[c.stripe,{backgroundColor:catColor[n.category]}]}/><View style={c.time}><Text style={c.timeText}>{timeLabel(n)}</Text></View><View style={c.eventBody}><Text numberOfLines={2} style={c.eventTitle}>{n.title}</Text>{n.location?<Text numberOfLines={1} style={c.meta}>{n.location}</Text>:null}</View>{n.needsReview?<View style={c.review}><Text style={c.reviewText}>待確認</Text></View>:<Icon name="chevron-forward" size={17} color={p.muted}/>} 
    </Pressable>)}
    {!dayItems.length&&<View style={c.empty}><Text style={c.emptyText}>這天沒有行程</Text></View>}
    {undated.length>0&&<><Text style={c.secondary}>待確認</Text>{undated.slice(0,4).map(n=><Pressable key={n.id} style={c.undated} onPress={()=>onOpen(n.id)}><Icon name="help-circle-outline"/><View style={{flex:1}}><Text style={c.undatedTitle}>{n.title}</Text><Text style={c.meta}>內容有歧義，點開確認</Text></View><Icon name="chevron-forward" size={17} color={p.muted}/></Pressable>)}</>}
  </>;
}

const c=StyleSheet.create({
  shell:{backgroundColor:'white',borderRadius:22,borderWidth:1,borderColor:'#E3ECE9',padding:14},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16,gap:8},title:{fontSize:23,fontWeight:'800',color:p.ink,letterSpacing:-.4},nav:{flexDirection:'row',alignItems:'center',gap:6},iconButton:{width:36,height:36,borderRadius:12,backgroundColor:'#F1F6F4',alignItems:'center',justifyContent:'center'},todayButton:{height:36,paddingHorizontal:11,borderRadius:12,backgroundColor:'#F1F6F4',alignItems:'center',justifyContent:'center'},todayText:{fontSize:12,fontWeight:'700',color:p.green},
  weekRow:{flexDirection:'row',marginBottom:3},week:{width:'14.2857%',textAlign:'center',fontSize:11,fontWeight:'700',color:'#8A9894'},grid:{flexDirection:'row',flexWrap:'wrap'},day:{width:'14.2857%',height:55,borderRadius:13,alignItems:'center',justifyContent:'center',gap:5},dayActive:{backgroundColor:p.green},dayNum:{fontSize:13,fontWeight:'700',color:p.ink},dayNumActive:{color:'white'},muted:{color:'#BDC6C3'},today:{color:p.green,textDecorationLine:'underline'},dots:{height:5,flexDirection:'row',gap:2},dot:{width:4,height:4,borderRadius:2},
  agendaHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:22,marginBottom:10},agendaTitle:{fontSize:19,fontWeight:'800',color:p.ink},agendaSub:{fontSize:12.5,color:p.muted,marginTop:2},add:{width:40,height:40,borderRadius:13,backgroundColor:p.green,alignItems:'center',justifyContent:'center'},
  event:{flexDirection:'row',alignItems:'center',backgroundColor:'white',borderWidth:1,borderColor:'#E3ECE9',borderRadius:16,marginBottom:9,minHeight:72,overflow:'hidden',paddingRight:12},stripe:{width:4,alignSelf:'stretch'},time:{width:68,alignItems:'center'},timeText:{fontSize:13,fontWeight:'800',color:p.ink},eventBody:{flex:1,paddingVertical:12},eventTitle:{fontSize:15.5,fontWeight:'700',color:p.ink,lineHeight:21},meta:{fontSize:12,color:p.muted,marginTop:3},review:{backgroundColor:'#FFF1DB',paddingHorizontal:7,paddingVertical:4,borderRadius:999},reviewText:{fontSize:10,fontWeight:'800',color:'#945B17'},empty:{paddingVertical:26,alignItems:'center'},emptyText:{fontSize:14,color:p.muted},secondary:{fontSize:16,fontWeight:'800',color:p.ink,marginTop:22,marginBottom:9},undated:{flexDirection:'row',gap:10,alignItems:'center',backgroundColor:'white',borderWidth:1,borderColor:'#E3ECE9',borderRadius:15,padding:12,marginBottom:8},undatedTitle:{fontSize:14.5,fontWeight:'700',color:p.ink}
});
