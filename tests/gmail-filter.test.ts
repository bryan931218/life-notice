import assert from 'node:assert/strict';
import test from 'node:test';
import {gmailNotificationPolicy} from '../src/gmail-filter.ts';

test('Gmail 群組摘要直接忽略',()=>{
  assert.equal(gmailNotificationPolicy('com.google.android.gm','Gmail','4 封新郵件 [0 秒前] 全校公告信 [軍訓室] 兵役重要通知'),'ignore');
});

test('全校公告與條件式兵役資訊不直接建行程',()=>{
  assert.equal(gmailNotificationPolicy('com.google.android.gm','全校公告信','若您於出國日期前兩個月內另有短期出國計畫，請於出國前14天至1個月內 email 完整文件向軍訓室申請。'),'ignore');
});

test('軟體授權到期資訊不是個人行程',()=>{
  assert.equal(gmailNotificationPolicy('com.google.android.gm','資訊技術服務中心','2027/03/01 Adobe Creative Cloud 授權乙套，依主契約到期日，共需30個月。'),'ignore');
});

test('個人面試通知交給 AI 判斷',()=>{
  assert.equal(gmailNotificationPolicy('com.google.android.gm','面試通知','邀請您於 9/15 下午2點至公司面試，請確認出席。'),'ai_required');
});

test('老師寄來明確會議時間交給 AI 判斷',()=>{
  assert.equal(gmailNotificationPolicy('com.google.android.gm','王老師','明天上午10點開會，請準時到實驗室。'),'ai_required');
});

test('非 Gmail 不受 Gmail 規則影響',()=>{
  assert.equal(gmailNotificationPolicy('com.facebook.orca','陳亭霓','明天晚上吃飯嗎'),'normal');
});
