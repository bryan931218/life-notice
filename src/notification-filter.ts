export type NotificationEnvelope={packageName:string;appName:string;title:string;text:string};

const HARD_SYSTEM=/節能模式|省電模式|電池電量|剩餘電量|充電完成|裝置維護|系統更新|下載完成|安裝完成|同步完成|備份完成|VPN|截圖已儲存|驗證碼|認證碼|一次性密碼|登入碼|\bOTP\b|verification\s*code/i;
const EXPLICIT_AD=/\b(?:sponsored|advertisement)\b|贊助內容|付費廣告|此為廣告/i;
const SOCIAL_NOISE=/按讚了你的|對你的.*表示|開始追蹤你|追蹤了你|查看了你的|新增了限時動態|發佈了新貼文|推薦你追蹤|你可能認識|liked your|started following|new post from/i;
const NEWS_NOISE=/熱門新聞|推薦文章|每日精選|焦點新聞|即時新聞|今日頭條|為你推薦/i;
const PROMO=[/限時(?:優惠|特價|搶購)?/i,/優惠券|折價券|優惠碼|折扣碼/i,/促銷|特價|下殺|買一送一|滿額|免運/i,/全館|全站|會員專屬|會員好康/i,/立即(?:購買|下單|搶購|領取)|馬上(?:購買|下單|搶購)/i,/\d+\s*折|折抵\s*\d+|現省\s*\d+/i,/購物優惠|新品上市|熱賣|開賣|最後倒數/i];
const PERSONAL=/您的?(?:訂單|預約|訂位|掛號|航班|車次|包裹|帳單)|已(?:預約|訂位|報名|付款|繳費|出貨|到店|取件)|面試通知|錄取通知|會議邀請|行事曆邀請|付款期限|繳費期限/i;
const SCHEDULE=/(?:今天|今晚|明天|明晚|後天|週[一二三四五六日天]|星期[一二三四五六日天])[^\n]{0,40}(?:\d{1,2}\s*[:：.．點時]|早上|上午|中午|下午|晚上|晚間)[^\n]{0,50}(?:吃|去|見面|碰面|開會|會議|上課|考試|面試|看診|預約|訂位|打球|運動|集合|出發|要不要|一起)/i;

export function isHardSystemNoise(text:string){return HARD_SYSTEM.test(text);}

/** Only drops content with strong, independent evidence of being non-personal. */
export function isDefiniteJunkNotification(item:NotificationEnvelope){
 const text=`${item.appName}\n${item.title}\n${item.text}`.replace(/\s+/g,' ').trim();
 if(!text||HARD_SYSTEM.test(text))return true;
 if(PERSONAL.test(text)||SCHEDULE.test(text))return false;
 if(EXPLICIT_AD.test(text)||SOCIAL_NOISE.test(text)||NEWS_NOISE.test(text))return true;
 const hits=PROMO.reduce((total,pattern)=>total+(pattern.test(text)?1:0),0);
 return hits>=3||hits>=2&&/立即|馬上|點擊|領取|購買|下單|搶購|查看詳情|前往/i.test(text);
}
