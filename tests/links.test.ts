import test from 'node:test';
import assert from 'node:assert/strict';
import {displayLocation,extractUrls,firstGoogleMapsUrl,googleMapsSearchUrl,isGoogleMapsUrl,linkHost,placeNameFromGoogleMapsHtml,placeNameFromGoogleMapsUrl} from '../src/links.ts';

test('連結與 Google Maps 地點',async t=>{
  await t.test('保留 Google Maps 短網址且移除句尾標點',()=>{
    const text='明天晚上吃這家喔\nhttps://maps.app.goo.gl/Ny1uuy3ispjk83fa6?g_st=ic。';
    assert.deepEqual(extractUrls(text),['https://maps.app.goo.gl/Ny1uuy3ispjk83fa6?g_st=ic']);
    assert.equal(firstGoogleMapsUrl(text),'https://maps.app.goo.gl/Ny1uuy3ispjk83fa6?g_st=ic');
  });
  await t.test('可從 Google Maps 完整網址抽出店名',()=>{
    const url='https://www.google.com/maps/place/%E9%98%BF%E5%9F%8E%E9%B5%9D%E8%82%89/@25.0,121.5,17z/data=!4m2!3m1!1s0x0';
    assert.equal(placeNameFromGoogleMapsUrl(url),'阿城鵝肉');
    assert.equal(displayLocation(url),'阿城鵝肉');
  });
  await t.test('可從 Google Maps 網頁標題抽出地點',()=>{
    assert.equal(placeNameFromGoogleMapsHtml('<html><head><title>小木屋鬆餅 新竹店 - Google Maps</title></head></html>'),'小木屋鬆餅 新竹店');
  });
  await t.test('一般網址不會誤判成地圖',()=>{
    const url='https://example.com/order?id=1';
    assert.equal(isGoogleMapsUrl(url),false);
    assert.equal(linkHost(url),'example.com');
  });
  await t.test('沒有地圖連結時能產生 Google Maps 搜尋網址',()=>{
    assert.equal(googleMapsSearchUrl('新竹巨城'),'https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E7%AB%B9%E5%B7%A8%E5%9F%8E');
  });
});
