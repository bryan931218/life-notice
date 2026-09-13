# 生活通知管家

把散落在截圖、群組訊息、學校公告、取件通知與帳單中的資訊，整理成「截止時間、準備清單、負責人與本機提醒」。

## v1.5.5 介面與可靠性更新

- **Android 自動通知監看**：使用者授權 Notification Access 後，直接取得 Messenger、LINE、Email 等顯示在通知欄的文字；不必再截圖。
- **兩種辨識模式**：純本機規則模式，以及可選的 OpenAI AI 智慧辨識模式。
- **AI 工具呼叫**：AI 只能從「建立行程／待辦、更新、取消、完成、要求確認、忽略」等受限制工具中選擇，並以 strict schema 驗證參數。
- **彈性語意理解**：AI 可理解改期、相對日期、上下文與自然語句，不受固定欄位/關鍵字流程限制。
- **安全寫入 Calendar**：高信心且時間明確時才允許自動同步；有歧義時進待確認，不直接污染系統行事曆。
- **BYOK 私人測試**：OpenAI API key 由使用者在 App 設定輸入並存在 SecureStore，不寫入 repo、APK 原始設定或備份。AI 預設關閉。
- **AI 截圖模式**：手動選圖時，AI 可直接閱讀圖片；AI 關閉時仍保留裝置端 OCR。
- **本機提醒與資料管理**：保留搜尋、完成、更正紀錄、準備清單、備份還原與 ICS 匯出。

> iOS 不允許第三方 App 任意讀取其他 App 的通知，因此跨 App 自動監看僅支援 Android；iOS 保留分享/貼上/截圖入口。

## 本次介面

首頁集中下一個行程、截圖／貼上、待辦與待確認列表；月曆包含歷史紀錄。編輯頁分為名稱、日期與提醒、補充細節，儲存按鈕固定在下方。設定分成四組，收合後保持簡潔。

背景監聽先收集候選通知，開啟 App 後進行本機／AI 整理；Android 快速設定中的「擷取行程」可直接處理明確日期的通知。手機行事曆是獨立副本：重複加入會更新新版建立的同一筆事件，從 App 刪除或清除資料不會刪除副本。

測試範圍與限制：[v1.5.5 驗證報告](docs/QA_V155.md)。

## 開發驗證

```bash
npm install
npm run verify
npm run export:web
```

## Android 測試 APK

GitHub Actions 的 **Build Life Notice Android preview** 會在 `codex/listener-settings` 或 `v14-build` 更新後建置。下載對應版本的 Artifacts，或從 Releases 取得 APK。

目前測試 APK 使用測試簽章，適合側載測試，不可直接拿來當 Google Play 正式簽章版本。

## 正式發行識別

預設 Android package / iOS bundle identifier：

`com.bryan931218.lifenotice`

正式上架後不可隨意變更。若要換品牌識別，請在第一次公開上架前修改 `APP_IDENTIFIER`。

## 原生模組

`modules/notice-listener` 負責 Android Notification Listener 與 Calendar 寫入；`modules/notice-ocr` 是 Expo local OCR module：

- Android：`com.google.mlkit:text-recognition-chinese`
- iOS：Vision `VNRecognizeTextRequest`

AI 關閉時不需要把私人通知內容送到 OpenAI。AI 開啟後，候選通知/使用者選取的截圖會依設定送至 OpenAI API；詳見隱私政策。

## 發行文件

- `docs/STORE_LISTING_zh-TW.md`：商店名稱、副標題、短/長描述與關鍵字。
- `docs/PRIVACY_POLICY_zh-TW.md`：可發布的隱私權政策草稿。
- `docs/RELEASE_CHECKLIST.md`：App Store / Google Play 上架前必做清單。
- `docs/MONETIZATION_AND_GROWTH.md`：第一階段收費與宣傳策略。

## 尚需帳戶本人完成的項目

正式發布時，Apple / Google 的開發者合約、付款資料、身分驗證、憑證／Play App Signing 等只能由帳戶本人授權。不要把 Apple 密碼、Google 密碼、私鑰或 keystore 密碼提交到 GitHub。
