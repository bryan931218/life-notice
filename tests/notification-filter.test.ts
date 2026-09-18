import assert from 'node:assert/strict';
import test from 'node:test';
import {isDefiniteJunkNotification,isLikelyCalendarText} from '../src/notification-filter.ts';

const item=(text:string)=>({packageName:'com.instagram.android',appName:'Instagram',title:'通知',text});

test('明確促銷不送進待辦或 AI',()=>assert.equal(isDefiniteJunkNotification(item('會員專屬限時優惠，全館 5 折，立即下單再享免運')),true));
test('社群互動通知直接忽略',()=>assert.equal(isDefiniteJunkNotification(item('王小明按讚了你的貼文')),true));
test('分段邀約內容不會被廣告規則擋掉',()=>assert.equal(isDefiniteJunkNotification(item('今天吃好吃的\n在星月廣場\n我們訂20：15')),false));
test('討論廣告工作的行程不會被誤刪',()=>assert.equal(isDefiniteJunkNotification(item('明天下午3點開會討論廣告企劃')),false));
test('個人訂位與付款通知保留',()=>assert.equal(isDefiniteJunkNotification(item('您的訂位已確認，明天晚上 7 點入席')),false));
test('常見購物推播即使沒有廣告標籤也會排除',()=>assert.equal(isDefiniteJunkNotification(item('今日限定好康，會員專屬加碼回饋，領券後前往賣場')),true));
test('有期限的購票任務仍不是行程',()=>assert.equal(isDefiniteJunkNotification(item('明天 20:00 前記得購買回程車票')),true));
test('帳單付款日不建立成行程',()=>assert.equal(isDefiniteJunkNotification(item('您的帳單已產生，9/20 前付款可享回饋')),true));
test('通知年齡與購買說明不會變成全天行程',()=>assert.equal(isDefiniteJunkNotification(item('[999 秒前] B班購買畢業方案的同學\n[999 秒前] 請根據你購買的方案金額\n[999 秒前] 記得備註你的名字')),true));
test('AI 失敗時本機只保留像行程的內容',()=>{assert.equal(isLikelyCalendarText('9/20 商品開賣'),false);assert.equal(isLikelyCalendarText('9/20 前請繳費'),false);assert.equal(isLikelyCalendarText('9/20 14:30 在台北車站見面'),true);assert.equal(isLikelyCalendarText('今天吃好吃的\n在星月廣場\n我們訂20：15'),true)});
