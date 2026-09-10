import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo-modules-core';

const native=Platform.OS==='android'?requireOptionalNativeModule<{canReply(noticeId:string):boolean;reply(noticeId:string,text:string):boolean}>('NoticeListener'):null;

export function detectedNoticeId(source:string):string|null{
  return source.match(/\[偵測ID:([^\]]+)\]/)?.[1]??null;
}

export function canReplyToNotification(sourceOrId:string):boolean{
  const id=sourceOrId.includes('[偵測ID:')?detectedNoticeId(sourceOrId):sourceOrId;
  if(!id||!native)return false;
  try{return !!native.canReply(id)}catch{return false}
}

export async function replyToNotification(sourceOrId:string,text:string){
  const id=sourceOrId.includes('[偵測ID:')?detectedNoticeId(sourceOrId):sourceOrId;
  const value=text.trim();
  if(!id)throw new Error('找不到原始通知。');
  if(!value)throw new Error('回覆內容不能是空白。');
  if(!native)throw new Error('此裝置不支援通知直接回覆。');
  let ok=false;try{ok=!!native.reply(id,value)}catch{}
  if(!ok)throw new Error('原始通知已消失，或該 App 不支援直接回覆。');
  return true;
}