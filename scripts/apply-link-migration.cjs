const fs=require('fs');

function writeIfChanged(path,next){const old=fs.readFileSync(path,'utf8');if(old!==next)fs.writeFileSync(path,next)}
function mustReplace(text,oldValue,newValue,label){if(text.includes(newValue))return text;if(!text.includes(oldValue))throw new Error(`link migration: missing ${label}`);return text.replace(oldValue,newValue)}

let app=fs.readFileSync('src/App.tsx','utf8');
app=mustReplace(
  app,
  "import {ActivityIndicator,AppState,Image,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Switch,Text,View} from 'react-native';",
  "import {ActivityIndicator,AppState,Image,KeyboardAvoidingView,Linking,Modal,Platform,Pressable,ScrollView,Switch,Text,View} from 'react-native';",
  'Linking import'
);
app=mustReplace(
  app,
  "import {canReplyToNotification,replyToNotification} from './reply';",
  "import {canReplyToNotification,replyToNotification} from './reply';\nimport {displayLocation,extractUrls,firstGoogleMapsUrl,googleMapsSearchUrl,isGoogleMapsUrl,linkHost} from './links';",
  'link helpers import'
);
app=mustReplace(
  app,
  "  const notice=data.notices.find(n=>n.id===selected);",
  "  const notice=data.notices.find(n=>n.id===selected);\n  const noticeLinks=notice?extractUrls(notice.source):[];\n  const noticeMapUrl=notice?(firstGoogleMapsUrl(notice.source)??(notice.location?(isGoogleMapsUrl(notice.location)?notice.location:googleMapsSearchUrl(notice.location)):null)):null;\n  const noticeWebLinks=noticeLinks.filter(url=>!isGoogleMapsUrl(url)).slice(0,3);",
  'notice link state'
);
app=mustReplace(
  app,
  "{notice.location&&<Text style={s.body}>📍 {notice.location}</Text>}",
  "{displayLocation(notice.location)&&<Text style={s.body}>📍 {displayLocation(notice.location)}</Text>}{noticeMapUrl&&<Pressable accessibilityRole=\"link\" onPress={()=>void Linking.openURL(noticeMapUrl).catch(()=>notify('無法開啟 Google Maps。'))} style={[s.chip,{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7,marginTop:8}]}><Icon name=\"navigate-outline\" size={17}/><Text style={[s.chipText,{color:p.green,fontWeight:'700'}]}>在 Google Maps 開啟</Text></Pressable>}{noticeWebLinks.length>0&&<View style={s.chips}>{noticeWebLinks.map(url=><Pressable key={url} accessibilityRole=\"link\" onPress={()=>void Linking.openURL(url).catch(()=>notify('無法開啟連結。'))} style={[s.chip,{flexDirection:'row',alignItems:'center',gap:7}]}><Icon name=\"link-outline\" size={16}/><Text style={s.chipText}>開啟 {linkHost(url)}</Text></Pressable>)}</View>}",
  'clickable location links'
);
app=app.replace('版本 1.5.0','版本 1.5.1');
writeIfChanged('src/App.tsx',app);
console.log('location/link UI migration applied');
