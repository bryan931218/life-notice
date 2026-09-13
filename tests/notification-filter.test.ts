import assert from 'node:assert/strict';
import test from 'node:test';
import {isDefiniteJunkNotification} from '../src/notification-filter.ts';

const item=(text:string)=>({packageName:'com.instagram.android',appName:'Instagram',title:'通知',text});

test('明確促銷不送進待辦或 AI',()=>assert.equal(isDefiniteJunkNotification(item('會員專屬限時優惠，全館 5 折，立即下單再享免運')),true));
test('社群互動通知直接忽略',()=>assert.equal(isDefiniteJunkNotification(item('王小明按讚了你的貼文')),true));
test('分段邀約內容不會被廣告規則擋掉',()=>assert.equal(isDefiniteJunkNotification(item('今天吃好吃的\n在星月廣場\n我們訂20：15')),false));
test('討論廣告工作的行程不會被誤刪',()=>assert.equal(isDefiniteJunkNotification(item('明天下午3點開會討論廣告企劃')),false));
test('個人訂位與付款通知保留',()=>assert.equal(isDefiniteJunkNotification(item('您的訂位已確認，明天晚上 7 點入席')),false));
