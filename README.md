# 生活通知管家

把學校通知、社區公告、活動資訊、繳費與取件訊息，整理成「要做什麼、什麼時候做、要準備什麼、誰負責」。

## 目前完成的 MVP

- 截圖匯入與本機 OCR：Android 使用 Google ML Kit 中文模型，iOS 使用 Apple Vision；通知內容不需傳到自建伺服器。
- 貼上文字後整理標題、分類、明確日期時間與準備清單。
- 對沒有年份、相對日期、多日期等高風險內容主動要求人工確認，不偷偷猜日期。
- 本機通知提醒、提醒時間調整、測試提醒。
- 原始通知保存、更正紀錄、重複通知防呆。
- 家庭／室友負責人標記與文字分享。
- 匯出 `.ics` 到行事曆。
- JSON 文字備份、還原與本機資料刪除。
- 無登入、無廣告追蹤、無自建後端。

## Android 直接測試

每次 `main` 更新後，GitHub Actions 會驗證 TypeScript 與測試、重新 prebuild Android、產生 APK，並發布成最新 GitHub Release。

最新測試 APK：

`https://github.com/bryan931218/translator/releases/latest/download/life-notice-preview.apk`

Android 第一次側載時可能需要允許瀏覽器／檔案管理員「安裝未知應用程式」。測試 APK 使用測試簽章，只供內部測試；Google Play 正式上架會改用正式 upload key / Play App Signing。

## 開發

```bash
npm ci
npm run verify
npm start
```

Android 原生測試：

```bash
npm run prebuild:android
npm run android
```

## 發行設定

預設 identifier：`com.bryan931218.lifenotice`。正式發行時可用環境變數覆寫：

- `APP_IDENTIFIER`
- `SUPPORT_EMAIL`
- `PRIVACY_URL`
- `EAS_PROJECT_ID`

`eas.json` 已包含 internal preview APK 與 production AAB 設定。Apple App Store / Google Play 正式簽章與提交需要開發者帳號持有人授權，請勿把憑證、密碼或私鑰提交到 Git。

## 驗證

```bash
npm run typecheck
npm test
npm run export:web
```

## 隱私

產品原則是「使用者主動選擇內容、本機處理、先確認再提醒」。完整測試版隱私文字見 `store/privacy-policy.md` 與 App 內設定頁。
