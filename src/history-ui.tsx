import React,{useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {Notice} from './domain';
import {displayDay,displayTime,historyNotices,type HistoryFilter} from './calendar';
import {Button,Chips,Field,Icon,p,s} from './ui';

export function NoticeHistory({notices,onOpen}:{notices:Notice[];onOpen:(id:string)=>void}){
 const[filter,setFilter]=useState<HistoryFilter>('all'),[query,setQuery]=useState(''),[limit,setLimit]=useState(30);
 const items=historyNotices(notices,filter,query);
 return <View>
  <Chips<HistoryFilter> values={[["all","全部紀錄"],["completed","已完成"],["past","過期未完成"]]} value={filter} onChange={value=>{setFilter(value);setLimit(30)}}/>
  <Field label="搜尋歷史紀錄" value={query} onChange={value=>{setQuery(value);setLimit(30)}} placeholder="標題、地點或原始內容" max={200}/>
  <Text style={[s.caption,{marginVertical:12}]}>{items.length} 筆紀錄 · 依行程日期由新到舊</Text>
  {items.slice(0,limit).map(n=><Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${n.title}，${n.done?'已完成':'過期未完成'}，查看詳情`} onPress={()=>onOpen(n.id)} style={s.card}>
   <View style={s.row}><Icon name={n.done?'checkmark-circle':'time-outline'} color={n.done?p.green:p.orange}/><Text style={[s.cardTitle,s.flex]}>{n.title}</Text><Icon name="chevron-forward" size={18}/></View>
   <Text style={s.caption}>{n.dueAt?`${new Date(n.dueAt).getFullYear()}年 ${displayDay(new Date(n.dueAt))} ${n.allDay?'全天':displayTime(new Date(n.dueAt))}`:'無日期待辦'}</Text>
   <Text style={[s.caption,{color:n.done?p.green:p.orange}]}>{n.done?'已完成':'過期未完成'} · {n.category}</Text>
  </Pressable>)}
  {items.length===0&&<View style={s.empty}><Icon name="archive-outline"/><Text style={s.emptyTitle}>{query.trim()?'找不到符合的紀錄':'目前沒有紀錄'}</Text><Text style={s.caption}>完成的行程與待辦、過去日期的行程會保留在這裡。</Text></View>}
  {items.length>limit&&<Button label={`載入更多（還有 ${items.length-limit} 筆）`} secondary onPress={()=>setLimit(limit+30)}/>}
 </View>;
}
