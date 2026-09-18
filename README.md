# 生活通知管家

把散落在聊天、通知與截圖中的聚餐、會議、課程、預約與其他個人行程，自動整理成可確認、可提醒、可同步到手機行事曆的安排。

## v1.7.0 行程專注更新

- 產品改為只收錄有可確認日期的個人行程；購買、付款、填表、繳交、取件、截止日與無日期待辦直接略過。
- 修正通知中的「999 秒前／幾分鐘前」被誤當成行程時間，以及購物說明被拆成準備清單的問題。
- AI 只可建立、更新、取消或要求確認行程；廣告即使包含日期、倒數或動作文字也必須忽略。
- 新首頁提供一句話新增、今天／七天內／待確認摘要、下一個行程與更清楚的監聽狀態。
- 手動新增固定要求日期，詳情以編輯、行事曆同步與行前準備為主，不再顯示待辦操作。

## v1.6.0 可靠性更新

- 單一 AI 請求失敗不再中斷整批處理；網路或額度異常時，明確內容先進入待確認，其餘通知保留等待重試。
- 首頁顯示通知收件匣待整理數量、整理結果，以及 Android 監聽服務是否真的連線。
- 可從設定要求 Android 重新連線並補掃仍在通知欄的內容；建立結果會先保存再通知使用者。
- App 關閉時，只有日期、時間與行程意圖都明確且通過垃圾過濾的通知才會安全寫入行事曆。
- 通知佇列滿載時優先保留行程、期限及預約；對話標題的未讀數變化不再切斷分段內容。
- 加強購物推播、社群互動與新聞過濾，同時保留個人訂位、帳單、付款及具體行程。

## v1.5.7 對話理解與通知修正

- 合併同一 App、同一對話在短時間內送出的分段訊息，並讀取 Android `MessagingStyle` 通知附帶的對話歷史。
- 明確廣告、促銷與社群互動通知會在送交 AI 前先排除；涉及個人訂位、付款或具體行程的內容會保留判斷。
- AI 模式不再於 AI 判斷前由背景規則直接寫入行事曆。
- 建立、更新、取消或完成偵測項目後，立即發出結果通知；未開啟本 App 通知權限時會顯示處理提示。

## v1.5.6 通知擷取修正

- 通知監聽連線及儲存來源 App 後，立即補掃通知欄內仍存在的訊息。
- 支援「今天晚上 7.30」與「晚上打羽球／6～8」等真實聊天格式。
- 背景自動加入行事曆會同步到 Android 監聽服務；初次設定會預選已安裝的常用通訊 App。

## v1.5.5 介面與可靠性更新

- **Android 自動通知監看**：使用者授權 Notification Access 後，直接取得 Messenger、LINE、Email 等顯示在通知欄的文字；不必再截圖。
- **兩種辨識模式**：純本機規則模式，以及可選的 OpenAI AI 智慧辨識模式。
- **AI 工具呼叫**：AI 只能從「建立行程、更新、取消、要求確認、忽略」等受限制工具中選擇，並以 strict schema 驗證參數。
- **彈性語意理解**：AI 可理解改期、相對日期、上下文與自然語句，不受固定欄位/關鍵字流程限制。
- **安全寫入 Calendar**：高信心且時間明確時才允許自動同步；有歧義時進待確認，不直接污染系統行事曆。
- **BYOK 私人測試**：OpenAI API key 由使用者在 App 設定輸入並存在 SecureStore，不寫入 repo、APK 原始設定或備份。AI 預設關閉。
- **AI 截圖模式**：手動選圖時，AI 可直接閱讀圖片；AI 關閉時仍保留裝置端 OCR。
- **本機提醒與資料管理**：保留搜尋、完成、更正紀錄、準備清單、備份還原與 ICS 匯出。

> iOS 不允許第三方 App 任意讀取其他 App 的通知，因此跨 App 自動監看僅支援 Android；iOS 保留分享/貼上/截圖入口。

## 本次介面

首頁集中一句話新增、下一個行程、截圖／貼上、七天摘要與待確認列表；月曆包含歷史紀錄。編輯頁分為名稱、日期與提醒、補充細節，儲存按鈕固定在下方。設定分成四組，收合後保持簡潔。

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
