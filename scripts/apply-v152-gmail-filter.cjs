const fs=require('fs');

function writeIfChanged(path,next){const old=fs.readFileSync(path,'utf8');if(old!==next)fs.writeFileSync(path,next)}
function mustReplace(text,oldValue,newValue,label){if(text.includes(newValue))return text;if(!text.includes(oldValue))throw new Error(`gmail migration: missing ${label}`);return text.replace(oldValue,newValue)}

let services=fs.readFileSync('src/services.ts','utf8');
services=mustReplace(services,
  "import {dedupeAutoNotices} from './dedupe';",
  "import {dedupeAutoNotices} from './dedupe';\nimport {gmailNotificationPolicy} from './gmail-filter';",
  'gmail filter import');
services=mustReplace(services,
  "export type DetectedNotification={id:string;packageName:string;appName:string;title:string;text:string;receivedAt:number;score:number;reason:string};\nconst listener=",
  "export type DetectedNotification={id:string;packageName:string;appName:string;title:string;text:string;receivedAt:number;score:number;reason:string};\nexport function notificationPolicy(item:DetectedNotification){return gmailNotificationPolicy(item.packageName,item.title,item.text);}\nconst listener=",
  'notification policy export');
services=mustReplace(services,
  "  const ignored=all.filter(x=>isObviousNoiseText(`${x.appName}\\n${x.title}\\n${x.text}`));\n  if(ignored.length)listener?.markProcessed(ignored.map(x=>x.id));\n  return all.filter(x=>!isObviousNoiseText(`${x.appName}\\n${x.title}\\n${x.text}`));",
  "  const ignored=all.filter(x=>isObviousNoiseText(`${x.appName}\\n${x.title}\\n${x.text}`)||notificationPolicy(x)==='ignore');\n  if(ignored.length)listener?.markProcessed(ignored.map(x=>x.id));\n  return all.filter(x=>!isObviousNoiseText(`${x.appName}\\n${x.title}\\n${x.text}`)&&notificationPolicy(x)!=='ignore');",
  'detected filter');
writeIfChanged('src/services.ts',services);

let app=fs.readFileSync('src/App.tsx','utf8');
app=mustReplace(app,
  "      if(!raw){processed.push(item.id);continue}\n      let made:Notice|null=null;",
  "      if(!raw){processed.push(item.id);continue}\n      const sourcePolicy=api.notificationPolicy(item);\n      if(sourcePolicy==='ignore'){processed.push(item.id);continue}\n      let made:Notice|null=null;",
  'source policy');
app=mustReplace(app,
  "      if(!made){\n        const inferred=inferLiveNotification(raw,item.receivedAt);",
  "      if(!made&&sourcePolicy==='ai_required'){processed.push(item.id);continue}\n      if(!made){\n        const inferred=inferLiveNotification(raw,item.receivedAt);",
  'Gmail no local fallback');
writeIfChanged('src/App.tsx',app);

let ai=fs.readFileSync('src/ai.ts','utf8');
const gmailRule='\\n\\n【Gmail 郵件】Gmail 必須比聊天來源更保守。日期、金額、合約到期日、新聞/公告中的活動日期，都不等於使用者的個人行程。多封新郵件/摘要通知、全校公告、校務公告、電子報、服務公告、軟體授權或產品到期資訊，原則上使用 ignore_notification。像「若您有某情況請於某日前申請」這種面向所有人的條件式說明，也不是使用者已確定要做的 Todo。只有郵件清楚直接要求收件者本人完成動作（例如明確邀請、面試通知、預約確認、帳單/繳費、作業/文件繳交、已報名活動），或有明確的個人會議/預約/行程，才 create_task/create_calendar_event。若只是一般資訊，寧可忽略。';
ai=mustReplace(ai,
  "\\n\\n【其他動作】沒有期限但動作明確的事情用 create_task",
  gmailRule+"\\n\\n【其他動作】沒有期限但動作明確的事情用 create_task",
  'Gmail AI rule');
writeIfChanged('src/ai.ts',ai);

let listener=fs.readFileSync('modules/notice-listener/android/src/main/java/expo/modules/noticelistener/LifeNoticeListenerService.kt','utf8');
listener=mustReplace(listener,
  "    private val IGNORE = Regex(\"驗證碼|認證碼|OTP|一次性密碼|登入碼|verification code|Samsung Rewards|Rewards|獲得\\\\s*\\\\d+\\\\s*點|點數到帳|節能模式|省電模式|電池電量|剩餘電量|充電完成|裝置維護|系統更新|下載完成|安裝完成|同步完成|備份完成|已連線|VPN|截圖已儲存|廣告|優惠券|限時優惠|促銷|折扣|猜你喜歡|熱門新聞\", RegexOption.IGNORE_CASE)",
  "    private val IGNORE = Regex(\"驗證碼|認證碼|OTP|一次性密碼|登入碼|verification code|Samsung Rewards|Rewards|獲得\\\\s*\\\\d+\\\\s*點|點數到帳|節能模式|省電模式|電池電量|剩餘電量|充電完成|裝置維護|系統更新|下載完成|安裝完成|同步完成|備份完成|已連線|VPN|截圖已儲存|廣告|優惠券|限時優惠|促銷|折扣|猜你喜歡|熱門新聞\", RegexOption.IGNORE_CASE)\n    private const val GMAIL_PACKAGE = \"com.google.android.gm\"\n    private val GMAIL_SUMMARY = Regex(\"\\\\b\\\\d+\\\\s*封新郵件\\\\b|\\\\b\\\\d+\\\\s+new\\\\s+emails?\\\\b|new mail summary\", RegexOption.IGNORE_CASE)\n    private val GMAIL_BROADCAST = Regex(\"全校公告(?:信)?|校務公告|服務公告|系統公告|資訊技術服務中心|軍訓室[^\\\\n]{0,20}(?:公告|通知|注意事項)|電子報|newsletter|Adobe\\\\s+Creative\\\\s+Cloud|授權[^\\\\n]{0,20}到期\", RegexOption.IGNORE_CASE)\n    private val GMAIL_PERSONAL = Regex(\"邀請您|邀請你|請您|請你|您已|你已|您的|你的|錄取通知|面試通知|預約確認|預約成功|訂位成功|報名成功|繳費通知|付款通知|帳單|行事曆邀請|calendar invitation|meeting invitation\", RegexOption.IGNORE_CASE)\n    private val GMAIL_IMMEDIATE = Regex(\"邀請您|邀請你|面試通知|預約成功|訂位成功|報名成功|繳費通知|付款期限|會議邀請|calendar invitation|meeting invitation|(?:今天|明天|後天)[^\\\\n]{0,30}(?:開會|會議|面試|考試|上課|看診|預約)\", RegexOption.IGNORE_CASE)",
  'Gmail native regexes');
listener=mustReplace(listener,
  "    val notification = sbn.notification ?: return\n    val (title, body) = extract(notification)",
  "    val notification = sbn.notification ?: return\n    if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return\n    val (title, body) = extract(notification)",
  'group summary guard');
listener=mustReplace(listener,
  "    if (currentText.length < 3 || IGNORE.containsMatchIn(currentText)) return\n\n    val now =",
  "    if (currentText.length < 3 || IGNORE.containsMatchIn(currentText)) return\n    if (sbn.packageName == GMAIL_PACKAGE) {\n      if (GMAIL_SUMMARY.containsMatchIn(currentText)) return\n      if (GMAIL_BROADCAST.containsMatchIn(currentText) && !GMAIL_PERSONAL.containsMatchIn(currentText)) return\n    }\n\n    val now =",
  'Gmail early guard');
listener=mustReplace(listener,
  "    if (DetectedStore.add(applicationContext, item) && shouldNotifyNow(text, score)) notifyUser(item)",
  "    if (DetectedStore.add(applicationContext, item) && shouldNotifyNow(text, score, sbn.packageName)) notifyUser(item)",
  'notify package');
listener=mustReplace(listener,
  "  private fun shouldNotifyNow(text: String, score: Int): Boolean {\n    val hasDate =",
  "  private fun shouldNotifyNow(text: String, score: Int, sourcePackage: String): Boolean {\n    if (sourcePackage == GMAIL_PACKAGE && !GMAIL_IMMEDIATE.containsMatchIn(text)) return false\n    val hasDate =",
  'Gmail immediate notification gate');
writeIfChanged('modules/notice-listener/android/src/main/java/expo/modules/noticelistener/LifeNoticeListenerService.kt',listener);

const pkgPath='package.json';
let pkg=fs.readFileSync(pkgPath,'utf8');
pkg=pkg.replace('"version": "1.5.0"','"version": "1.5.2"');
writeIfChanged(pkgPath,pkg);

console.log('v1.5.2 Gmail false-positive migration applied');
