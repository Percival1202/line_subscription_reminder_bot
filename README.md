# LINE 訂閱到期提醒機器人

這個專案會建立一個 LINE 群組機器人，讓群組成員自行登記下次繳費日，系統每天定時檢查，並在群組內用 mention（tag）方式提醒「14 天後要繳費」的成員。

## 功能

- 群組內指令登記/更新自己的下次繳費日
- 定時每日掃描到期資料
- 使用 LINE mention tag 指定成員
- 可手動立即觸發提醒

## 1. 建立 LINE Messaging API Channel

1. 到 LINE Developers 建立 Provider 與 Messaging API Channel。
2. 取得以下資訊：
   - Channel secret
   - Channel access token（長期 token）
3. 在你的 bot 設定中開啟：
   - Allow bot to join group chats
4. 把 bot 邀請進你要使用的群組。

## 2. 設定環境變數

複製 `.env.example` 成 `.env`，並填入：

- `CHANNEL_ACCESS_TOKEN`
- `CHANNEL_SECRET`
- `OWNER_USER_ID`（你的個人 LINE userId，僅此帳號可使用管理指令）

其他可選設定：

- `REMIND_BEFORE_DAYS`：固定在下次繳費日前幾天提醒（預設 14）
- `REMIND_HOUR`、`REMIND_MINUTE`：每日提醒時間（預設 09:00）
- `TZ`：時區（預設 `Asia/Taipei`）
- `DEFAULT_GROUP_ID`：若要固定只推播到一個群組可填入

## 3. 安裝與啟動

```bash
npm install
npm run dev
```

正式模式：

```bash
npm run build
npm start
```

Webhook 路徑：

- `POST /webhook`

健康檢查：

- `GET /health`

## 4. 把 Webhook URL 設到 LINE

假設你部署在：

- `https://your-domain.com`

則在 LINE Developers 設定 Webhook URL：

- `https://your-domain.com/webhook`

並啟用 Use webhook。

## 4-1. 用 Render 免費部署（最省事）

1. 把此專案推到 GitHub。
2. 到 Render 建立帳號後，選擇 **New +** -> **Web Service**。
3. 連接你的 GitHub repository，選這個專案。
4. Render 設定建議：
   - Runtime：Node
   - Build Command：`npm install && npm run build`
   - Start Command：`npm start`
   - Plan：Free
5. 在 Render 的 Environment 變數頁面設定：
   - `CHANNEL_ACCESS_TOKEN`（必填）
   - `CHANNEL_SECRET`（必填）
   - `OWNER_USER_ID`（必填）
   - `TZ=Asia/Taipei`（建議）
   - `REMIND_BEFORE_DAYS=14`（可選）
   - `REMIND_HOUR=9`（可選）
   - `REMIND_MINUTE=0`（可選）
6. 部署完成後會拿到網址，例如：
   - `https://your-service-name.onrender.com`
7. 在 LINE Developers 的 Webhook URL 填入：
   - `https://your-service-name.onrender.com/webhook`
8. 到以下網址確認服務正常：
   - `https://your-service-name.onrender.com/health`

注意事項：

- Render Free 方案可能有冷啟動時間，剛被喚醒時 Webhook 回應可能較慢。
- 目前專案把資料寫在 `data/subscriptions.json`，雲端環境通常是暫存檔案系統，重啟或重新部署後資料可能遺失。
- 建議正式上線時改用外部資料庫（例如 PostgreSQL）。

## 5. 群組指令

權限規則：

- 管理者（`OWNER_USER_ID`）可使用全部指令
- 一般成員僅可使用 `!my` / `/my` 查詢自己的下次繳費日

- `!help` 或 `/help`：顯示指令
- `!sub YYYY-MM-DD [方案名稱]`：登記或更新自己的下次繳費日
- `!set @某人 YYYY-MM-DD [方案名稱]`：替指定成員設定或更新下次繳費日
- `!unsub`：刪除自己的紀錄
- `!list`：查看本群組全部紀錄
- `!remind`：立即執行一次提醒
- `!my`：查詢自己的下次繳費日

範例：

```text
!sub 2026-12-31 Netflix
!set @小明 2026-12-15 Spotify
!sub 2026-11-01 YouTube Premium
!list
!remind
```

## 6. mention（tag）注意事項

- 只有在「群組」中才可使用 mention。
- bot 必須拿得到群組成員的 `userId` 才能準確 tag。
- 如果某些帳號無法被 tag，通常是因為該成員未被 bot 正常識別（可請該成員先觸發一次指令）。

## 7. 資料儲存

目前使用本機檔案：

- `data/subscriptions.json`

建議正式上線改為資料庫（例如 PostgreSQL、MySQL、Firestore）。

## 8. 部署建議

可部署到任何支援 Node.js 的平台，例如：

- Render
- Railway
- Fly.io
- 自行架設 VPS

重點：

- 設定環境變數
- 對外提供 HTTPS
- 確保 `/webhook` 可被 LINE 連到
