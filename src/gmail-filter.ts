export type NotificationPolicy='normal'|'ignore'|'ai_required';

export const GMAIL_PACKAGE='com.google.android.gm';

const SUMMARY=/\b\d+\s*封新郵件\b|\b\d+\s+new\s+emails?\b|\bnew\s+mail\s+summary\b/i;
const BROADCAST=/全校公告(?:信)?|校務公告|服務公告|系統公告|資訊技術服務中心|軍訓室[^\n]{0,20}(?:公告|通知|注意事項)|電子報|newsletter|產品更新|版本更新|Adobe\s+Creative\s+Cloud|授權[^\n]{0,20}到期/i;
const PERSONAL=/邀請您|邀請你|請您|請你|您已|你已|您的|你的|錄取通知|面試通知|預約確認|預約成功|訂位成功|報名成功|繳費通知|付款通知|帳單|行事曆邀請|calendar\s+invitation|meeting\s+invitation/i;
const DIRECT_ACTION=/請[^\n]{0,28}(?:填寫|回覆|繳交|提交|完成|報名|付款|繳費|確認|出席|參加|申請|簽署)|(?:填寫|回覆|繳交|提交|報名|付款|繳費|確認|申請)[^\n]{0,20}(?:截止|期限)|截止|deadline|due\s+(?:date|by)|action\s+required|RSVP|交作業|交報告|面試|會議邀請|預約|考試通知/i;
const DATE_OR_RELATIVE=/(?:20\d{2}[年./-])?\s*(?:1[0-2]|0?[1-9])[月./-](?:3[01]|[12]\d|0?[1-9])(?:日|號)?|今天|今晚|明天|明晚|後天|週[一二三四五六日天]|星期[一二三四五六日天]|禮拜[一二三四五六日天]/;
const TIME=/(?:[01]?\d|2[0-3])\s*(?::|：|點|時)|早上|上午|中午|下午|晚上|晚間|凌晨/;
const EVENT=/開會|會議|上課|考試|面試|看診|回診|預約|訂位|集合|出發|meeting|appointment/i;

export function gmailNotificationPolicy(packageName:string,title:string,text:string):NotificationPolicy{
  if(packageName!==GMAIL_PACKAGE)return 'normal';
  const combined=`${title}\n${text}`.replace(/\s+/g,' ').trim();
  if(!combined)return 'ignore';
  if(SUMMARY.test(combined))return 'ignore';
  const personal=PERSONAL.test(combined);
  if(BROADCAST.test(combined)&&!personal)return 'ignore';
  const scheduled=DATE_OR_RELATIVE.test(combined)&&TIME.test(combined)&&EVENT.test(combined);
  if(personal||DIRECT_ACTION.test(combined)||scheduled)return 'ai_required';
  return 'ignore';
}
