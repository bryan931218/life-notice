export type NotificationEnvelope={packageName:string;appName:string;title:string;text:string};

const HARD_SYSTEM=/節能模式|省電模式|電池電量|剩餘電量|充電完成|裝置維護|系統更新|下載完成|安裝完成|同步完成|備份完成|VPN|截圖已儲存|驗證碼|認證碼|一次性密碼|登入碼|\bOTP\b|verification\s*code/i;
const EXPLICIT_AD=/\b(?:sponsored|advertisement)\b|贊助內容|付費廣告|此為廣告/i;
const SOCIAL_NOISE=/按讚了你的|對你的.*表示|開始追蹤你|追蹤了你|查看了你的|新增了限時動態|發佈了新貼文|推薦你追蹤|你可能認識|有人發佈了|正在直播|liked your|reacted to your|started following|new post from|is live/i;
const NEWS_NOISE=/熱門新聞|推薦文章|每日精選|焦點新聞|即時新聞|今日頭條|為你推薦|今日推薦|編輯精選|你可能有興趣/i;
const PROMO=[/限時(?:優惠|特價|搶購)?/i,/優惠券|折價券|優惠碼|折扣碼/i,/促銷|特價|下殺|買一送一|滿額|免運/i,/全館|全站|會員專屬|會員好康/i,/立即(?:購買|下單|搶購|領取)|馬上(?:購買|下單|搶購)/i,/\d+\s*折|折抵\s*\d+|現省\s*\d+/i,/購物優惠|新品上市|熱賣|開賣|最後倒數|限量|限定|好康|回饋|加碼|開搶|領券/i,/(?:NT\$?|新台幣|[$＄])\s*\d+|省下|最低價|優惠價|特惠價/i];
const PERSONAL_EVENT=/您的?(?:預約|訂位|掛號|航班|車次)|已(?:預約|訂位|報名)|面試通知|錄取通知|會議邀請|行事曆邀請/i;
const SCHEDULE=/(?:今天|今晚|明天|明晚|後天|週[一二三四五六日天]|星期[一二三四五六日天])[^\n]{0,40}(?:\d{1,2}\s*[:：.．點時]|早上|上午|中午|下午|晚上|晚間)[^\n]{0,50}(?:吃|去|見面|碰面|開會|會議|上課|考試|面試|看診|預約|訂位|打球|運動|集合|出發|要不要|一起)/i;
const NON_EVENT_TASK=/購買|訂購|下單|方案金額|付款|繳費|繳款|帳單|填寫|提交|繳交|回覆|備註.{0,12}(?:姓名|名字)|領取|取件|取貨|包裹|截止|到期/i;
const AGE_MARKER=/(?:^|[\[（(\s])\d+\s*(?:秒|分鐘|小時)前(?:[\]）)\s]|$)/;
const DATE_SIGNAL=/(?:20\d{2}[年/.\-])?\s*(?:1[0-2]|0?[1-9])[月/.\-](?:3[01]|[12]\d|0?[1-9])(?:日|號)?|今天|今晚|明天|明晚|後天|大後天|週[一二三四五六日天]|星期[一二三四五六日天]|禮拜[一二三四五六日天]/;
const TIME_SIGNAL=/(?:[01]?\d|2[0-3])\s*(?:[:：.．點時]\s*[0-5]?\d?|點半)|早上|上午|中午|下午|晚上|晚間|凌晨/;
const EVENT_SIGNAL=/活動|課程|講座|聚餐|會議|比賽|考試|面試|預約|看診|門診|回診|集合|出發|登機|訂位|入住|退房|吃飯|吃東西|吃好吃的|早餐|午餐|晚餐|宵夜|見面|碰面|喝咖啡|看電影|打球|羽球|籃球|棒球|運動|練球|唱歌|逛街|一起/;

export function isHardSystemNoise(text:string){return HARD_SYSTEM.test(text);}

/** Only drops content with strong, independent evidence of being non-personal. */
export function isDefiniteJunkNotification(item:NotificationEnvelope){
 const text=`${item.appName}\n${item.title}\n${item.text}`.replace(/\s+/g,' ').trim();
 if(!text||HARD_SYSTEM.test(text))return true;
 if(SCHEDULE.test(text))return false;
 if(EXPLICIT_AD.test(text)||SOCIAL_NOISE.test(text)||NEWS_NOISE.test(text))return true;
 if(NON_EVENT_TASK.test(text)&&!/活動|課程|聚餐|會議|考試|面試|預約|看診|回診|集合|出發|訂位|吃飯|見面|打球|一起/i.test(text))return true;
 if(AGE_MARKER.test(text)&&!/(?:20\d{2}[年/.\-])?\s*(?:1[0-2]|0?[1-9])[月/.\-](?:3[01]|[12]\d|0?[1-9])(?:日|號)?|今天|今晚|明天|明晚|後天|週[一二三四五六日天]|星期[一二三四五六日天]/.test(text))return true;
 if(PERSONAL_EVENT.test(text))return false;
 const hits=PROMO.reduce((total,pattern)=>total+(pattern.test(text)?1:0),0);
 return hits>=2;
}

/** Conservative local fallback used when AI is unavailable. */
export function isLikelyCalendarText(text:string){
 if(isDefiniteJunkNotification({packageName:'',appName:'',title:'',text}))return false;
 const hasDate=DATE_SIGNAL.test(text),hasTime=TIME_SIGNAL.test(text),hasEvent=EVENT_SIGNAL.test(text);
 if(NON_EVENT_TASK.test(text)&&!hasEvent)return false;
 return (hasDate&&hasEvent)||(hasTime&&hasEvent&&/早上|上午|中午|下午|晚上|晚間|今晚|明晚/.test(text))||(/取消|改期|延期|提前|延後|異動|更改|變更/.test(text)&&hasDate&&hasTime)||PERSONAL_EVENT.test(text)&&hasDate;
}
