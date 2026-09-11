import React,{useMemo,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {Category,Notice} from './domain';
import {dayKey,monthGrid,monthTitle,noticesForDay,shiftMonth} from './calendar';
import {Icon,p} from './ui';

const WEEK=['日','一','二','三','四','五','六'];
const catColor:Record<Category,string>={生活:'#3E8E79',學校:'#5271D9',帳單:'#D78134',取件:'#7C69C8',活動:'#CB5E72'};
const catSoft:Record<Category,string>={生活:'#EAF6F1',學校:'#EDF0FF',帳單:'#FFF3E5',取件:'#F1EEFC',活動:'#FBECEF'};
const timeLabel=(n:Notice)=>!n.dueAt?'':n.allDay?'全天':new Date(n.dueAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});
const prettyDay=(key:string)=>new Date(`${key}T12:00:00`).toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'});
const shortDate=(key:string)=>new Date(`${key}T12:00:00`).toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'});

export function MonthCalendar({notices,onOpen,onAdd}:{notices:Notice[];onOpen:(id:string)=>void;onAdd:(date:string)=>void}){
  const now=new Date();
  const [month,setMonth]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));
  const [selected,setSelected]=useState(()=>dayKey(now));
  const cells=useMemo(()=>monthGrid(month),[month]);
  const dayItems=useMemo(()=>noticesForDay(notices,selected).sort((a,b)=>(a.dueAt?Date.parse(a.dueAt):0)-(b.dueAt?Date.parse(b.dueAt):0)),[notices,selected]);
  const goToday=()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1));setSelected(dayKey(d))};
  const move=(delta:number)=>{const next=shiftMonth(month,delta);setMonth(next);const today=new Date();const same=next.getFullYear()===today.getFullYear()&&next.getMonth()===today.getMonth();setSelected(dayKey(same?today:new Date(next.getFullYear(),next.getMonth(),1)))};

  return <View style={c.page}>
    <View style={c.calendarCard}>
      <View style={c.header}>
        <Pressable accessibilityLabel="上個月" hitSlop={8} style={c.iconButton} onPress={()=>move(-1)}><Icon name="chevron-back" size={20}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="回到今天" onPress={goToday} style={c.monthCenter}><Text style={c.title}>{monthTitle(month)}</Text><Text style={c.todayHint}>點此回到今天</Text></Pressable>
        <Pressable accessibilityLabel="下個月" hitSlop={8} style={c.iconButton} onPress={()=>move(1)}><Icon name="chevron-forward" size={20}/></Pressable>
      </View>

      <View style={c.weekRow}>{WEEK.map((w,i)=><Text key={w} style={[c.week,(i===0||i===6)&&c.weekend]}>{w}</Text>)}</View>
      <View style={c.grid}>{cells.map(d=>{
        const key=dayKey(d),items=noticesForDay(notices,key),inMonth=d.getMonth()===month.getMonth(),today=key===dayKey(now),active=key===selected;
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{selected:active}} accessibilityLabel={`${key}，${items.length} 個行程`} onPress={()=>{setSelected(key);if(!inMonth)setMonth(new Date(d.getFullYear(),d.getMonth(),1))}} style={[c.day,active&&c.dayActive]}>
          <View style={[c.numWrap,today&&!active&&c.todayRing]}><Text style={[c.dayNum,!inMonth&&c.muted,active&&c.dayNumActive]}>{d.getDate()}</Text></View>
          {items.length>0?<View style={c.dots}>{items.slice(0,3).map(n=><View key={n.id} style={[c.dot,{backgroundColor:active?'#0E7059':catColor[n.category]}]}/>)}{items.length>3&&<Text style={[c.more,active&&{color:p.green}]}>+{items.length-3}</Text>}</View>:<View style={c.dotSpace}/>} 
        </Pressable>
      })}</View>
    </View>

    <View style={c.dayHeader}>
      <View style={{flex:1}}><Text style={c.dayTitle}>{prettyDay(selected)}</Text><Text style={c.daySub}>{dayItems.length?`${dayItems.length} 個行程`:'這天目前沒有行程'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`在 ${shortDate(selected)} 新增`} style={c.addButton} onPress={()=>onAdd(selected)}><Icon name="add" color="white" size={18}/><Text style={c.addText}>新增</Text></Pressable>
    </View>

    {dayItems.length>0?<View style={c.timeline}>{dayItems.map((n,index)=>{
      const last=index===dayItems.length-1;
      return <Pressable key={n.id} accessibilityRole="button" onPress={()=>onOpen(n.id)} style={c.eventRow}>
        <View style={c.timeCol}><Text style={c.timeText}>{timeLabel(n)}</Text></View>
        <View style={c.rail}><View style={[c.railDot,{backgroundColor:catColor[n.category]}]}/>{!last&&<View style={c.railLine}/>}</View>
        <View style={c.eventCard}>
          <View style={c.eventTop}><View style={[c.categoryPill,{backgroundColor:catSoft[n.category]}]}><View style={[c.categoryMiniDot,{backgroundColor:catColor[n.category]}]}/><Text style={[c.categoryText,{color:catColor[n.category]}]}>{n.category}</Text></View>{n.needsReview&&<View style={c.review}><Text style={c.reviewText}>待確認</Text></View>}</View>
          <Text numberOfLines={2} style={c.eventTitle}>{n.title}</Text>
          {n.location?<View style={c.metaRow}><Icon name="location-outline" size={14} color={p.muted}/><Text numberOfLines={1} style={c.meta}>{n.location}</Text></View>:null}
          <View style={c.openRow}><Text style={c.openText}>查看詳情</Text><Icon name="chevron-forward" size={15} color={p.green}/></View>
        </View>
      </Pressable>
    })}</View>:<View style={c.empty}><View style={c.emptyIcon}><Icon name="calendar-clear-outline" size={24}/></View><Text style={c.emptyTitle}>這天沒有安排</Text><Text style={c.emptyText}>需要時可以直接新增，不必先離開月曆。</Text></View>}
  </View>;
}

const c=StyleSheet.create({
  page:{gap:18},
  calendarCard:{backgroundColor:'white',borderRadius:24,borderWidth:1,borderColor:'#E1EBE7',paddingHorizontal:12,paddingTop:13,paddingBottom:12,shadowColor:'#173B34',shadowOpacity:.045,shadowRadius:18,shadowOffset:{width:0,height:7},elevation:1},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14},monthCenter:{alignItems:'center',paddingHorizontal:14,paddingVertical:3},title:{fontSize:21,fontWeight:'800',color:p.ink,letterSpacing:-.35},todayHint:{fontSize:10.5,color:p.muted,marginTop:2},iconButton:{width:40,height:40,borderRadius:14,backgroundColor:'#F0F6F3',alignItems:'center',justifyContent:'center'},
  weekRow:{flexDirection:'row',paddingHorizontal:2,marginBottom:3},week:{width:'14.2857%',textAlign:'center',fontSize:11,fontWeight:'700',color:'#81908B',paddingVertical:4},weekend:{color:'#A06C6C'},grid:{flexDirection:'row',flexWrap:'wrap'},day:{width:'14.2857%',height:58,borderRadius:15,alignItems:'center',justifyContent:'center'},dayActive:{backgroundColor:'#E4F4EE'},numWrap:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},todayRing:{borderWidth:1.5,borderColor:p.green},dayNum:{fontSize:13,fontWeight:'700',color:p.ink},dayNumActive:{color:p.green,fontWeight:'900'},muted:{color:'#C1CAC7'},dots:{height:9,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:2,marginTop:1},dot:{width:4.5,height:4.5,borderRadius:3},dotSpace:{height:10},more:{fontSize:8.5,fontWeight:'800',color:p.muted,marginLeft:1},
  dayHeader:{flexDirection:'row',alignItems:'center',gap:12,marginTop:2},dayTitle:{fontSize:20,fontWeight:'800',color:p.ink,letterSpacing:-.25},daySub:{fontSize:12.5,color:p.muted,marginTop:3},addButton:{flexDirection:'row',alignItems:'center',gap:4,height:40,paddingHorizontal:13,borderRadius:14,backgroundColor:p.green},addText:{fontSize:13,fontWeight:'800',color:'white'},
  timeline:{backgroundColor:'white',borderWidth:1,borderColor:'#E1EBE7',borderRadius:22,paddingHorizontal:12,paddingVertical:8},eventRow:{flexDirection:'row',alignItems:'stretch',minHeight:96},timeCol:{width:52,paddingTop:16,alignItems:'flex-start'},timeText:{fontSize:12,fontWeight:'800',color:p.ink},rail:{width:20,alignItems:'center'},railDot:{width:10,height:10,borderRadius:5,marginTop:20,zIndex:2},railLine:{width:1.5,backgroundColor:'#DCE8E4',flex:1,marginTop:3},eventCard:{flex:1,paddingVertical:13,paddingLeft:8,paddingRight:4,borderBottomWidth:1,borderBottomColor:'#EDF2F0'},eventTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:7},categoryPill:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,paddingVertical:4,borderRadius:999},categoryMiniDot:{width:5,height:5,borderRadius:3},categoryText:{fontSize:10.5,fontWeight:'800'},review:{backgroundColor:'#FFF1DB',paddingHorizontal:7,paddingVertical:4,borderRadius:999},reviewText:{fontSize:10,fontWeight:'800',color:'#945B17'},eventTitle:{fontSize:16,fontWeight:'800',lineHeight:22,color:p.ink},metaRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:5},meta:{flex:1,fontSize:12,color:p.muted},openRow:{flexDirection:'row',alignItems:'center',gap:2,marginTop:8},openText:{fontSize:11.5,fontWeight:'700',color:p.green},
  empty:{backgroundColor:'white',borderWidth:1,borderColor:'#E1EBE7',borderRadius:20,paddingVertical:28,alignItems:'center',paddingHorizontal:20},emptyIcon:{width:44,height:44,borderRadius:15,backgroundColor:'#EAF6F1',alignItems:'center',justifyContent:'center',marginBottom:10},emptyTitle:{fontSize:16,fontWeight:'800',color:p.ink},emptyText:{fontSize:12.5,color:p.muted,marginTop:4,textAlign:'center'}
});
