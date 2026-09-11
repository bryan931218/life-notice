const fs=require('fs');

function writeIfChanged(path,next){const old=fs.readFileSync(path,'utf8');if(old!==next)fs.writeFileSync(path,next)}
function mustReplace(text,oldValue,newValue,label){if(text.includes(newValue))return text;if(!text.includes(oldValue))throw new Error(`v1.5.3 UI migration: missing ${label}`);return text.replace(oldValue,newValue)}

let app=fs.readFileSync('src/App.tsx','utf8');

app=mustReplace(app,
`          <View style={[s.row,{justifyContent:'space-between',alignItems:'flex-end',marginBottom:14}]}><View><Text style={[s.heading,{marginBottom:2}]}>今天</Text><Text style={s.caption}>{new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'})}</Text></View></View>`,
`          <View style={[s.row,{justifyContent:'space-between',alignItems:'center',marginBottom:14}]}><View><Text style={[s.heading,{marginBottom:2}]}>今天</Text><Text style={s.caption}>{new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'})}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="新增行程或待辦" onPress={startManual} style={{height:40,paddingHorizontal:13,borderRadius:14,backgroundColor:p.green,flexDirection:'row',alignItems:'center',gap:4}}><Icon name="add" size={18} color="white"/><Text style={{fontSize:13,fontWeight:'800',color:'white'}}>新增</Text></Pressable></View>`,
'home add button');

app=mustReplace(app,
`    {tab!=='manual'&&<><Pressable accessibilityRole="button" accessibilityLabel="新增" onPress={startManual} style={{position:'absolute',right:20,bottom:82,width:56,height:56,borderRadius:18,backgroundColor:p.green,alignItems:'center',justifyContent:'center',shadowColor:'#173B34',shadowOpacity:.2,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:7}}><Icon name="add" size={28} color="white"/></Pressable><SafeAreaView edges={['bottom']} style={s.bottom}><View style={s.tabs}>{([['home','今天','today-outline'],['calendar','月曆','calendar-outline'],['settings','設定','settings-outline']] as const).map(([key,label,icon])=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={s.tab}><Icon name={icon} color={tab===key?p.green:p.muted} size={23}/><Text style={[s.tabText,tab===key&&{color:p.green,fontWeight:'700'}]}>{label}</Text></Pressable>)}</View></SafeAreaView></>}`,
`    {tab!=='manual'&&<SafeAreaView edges={['bottom']} style={s.bottom}><View style={s.tabs}>{([['home','今天','today-outline'],['calendar','月曆','calendar-outline'],['settings','設定','settings-outline']] as const).map(([key,label,icon])=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={s.tab}><Icon name={icon} color={tab===key?p.green:p.muted} size={23}/><Text style={[s.tabText,tab===key&&{color:p.green,fontWeight:'700'}]}>{label}</Text></Pressable>)}</View></SafeAreaView>}`,
'remove floating add button');

app=mustReplace(app,
`      <Button label={!notice.dueAt?'完成並移除':notice.done?'重新開啟':'完成'} onPress={()=>notice.dueAt?toggle(notice):completeAndClose(notice)}/><View style={s.row}><View style={s.flex}><Button label="編輯" secondary onPress={()=>edit(notice)}/></View>{notice.dueAt&&<View style={s.flex}><Button label="加入行事曆" secondary onPress={()=>void run(async()=>{if(Platform.OS==='android'){if(!autoCalendar){const ok=await api.setAutoCalendarEnabled(true);setAutoCalendar(ok);if(!ok)throw new Error('沒有取得行事曆權限。')}await api.addToSystemCalendar(notice,\`manual-\${notice.id}\`);notify('已加入行事曆。')}else await api.exportCalendar(notice)})}/></View>}</View>`,
`      {!notice.dueAt&&<Button label="完成待辦" onPress={()=>completeAndClose(notice)}/>}<View style={s.row}><View style={s.flex}><Button label="編輯" secondary onPress={()=>edit(notice)}/></View>{notice.dueAt&&<View style={s.flex}><Button label="加入行事曆" secondary onPress={()=>void run(async()=>{if(Platform.OS==='android'){if(!autoCalendar){const ok=await api.setAutoCalendarEnabled(true);setAutoCalendar(ok);if(!ok)throw new Error('沒有取得行事曆權限。')}await api.addToSystemCalendar(notice,\`manual-\${notice.id}\`);notify('已加入行事曆。')}else await api.exportCalendar(notice)})}/></View>}</View>`,
'detail primary actions');

app=mustReplace(app,
`      {detailMore&&<><Button label="分享" secondary onPress={()=>void run(()=>api.shareNotice(notice))}/>{notice.source?<><Text style={s.sectionTitle}>原始內容</Text><Text selectable style={s.sourceText}>{stripDetectedId(notice.source)}</Text></>:null}{notice.sourceImage&&<Image source={{uri:notice.sourceImage}} style={s.sourceFull} resizeMode="contain"/>}<Button label="刪除" danger onPress={()=>remove(notice)}/></>}`,
`      {detailMore&&<>{notice.dueAt&&<Button label={notice.done?'重新顯示在行程':'從行程清單移除'} secondary onPress={()=>toggle(notice)}/>}<Button label="分享" secondary onPress={()=>void run(()=>api.shareNotice(notice))}/>{notice.source?<><Text style={s.sectionTitle}>原始內容</Text><Text selectable style={s.sourceText}>{stripDetectedId(notice.source)}</Text></>:null}{notice.sourceImage&&<Image source={{uri:notice.sourceImage}} style={s.sourceFull} resizeMode="contain"/>}<Button label="刪除" danger onPress={()=>remove(notice)}/></>}`,
'detail secondary actions');

app=app.replace('版本 1.4.3','版本 1.5.3').replace('版本 1.5.0','版本 1.5.3').replace('版本 1.5.1','版本 1.5.3').replace('版本 1.5.2','版本 1.5.3');
writeIfChanged('src/App.tsx',app);

const pkgPath='package.json';
let pkg=fs.readFileSync(pkgPath,'utf8');
pkg=pkg.replace(/"version":\s*"1\.5\.[0-2]"/,'"version": "1.5.3"');
writeIfChanged(pkgPath,pkg);
console.log('v1.5.3 streamlined UI migration applied');
