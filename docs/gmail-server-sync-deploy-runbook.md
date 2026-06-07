# Gmail Server Sync 部署 runbook（逐步驗收）

目的：完成 `20260507000000_add_gmail_server_sync.sql` 對應的 server-side Gmail 同步能力落地，並驗證 `provider_refresh_token` 實際有被捕獲。

## Step 1 — 套用 migration

1. 確認 migration 已存在：
   - `supabase/migrations/20260507000000_add_gmail_server_sync.sql`
2. 套用到 Supabase
   - 若使用 Supabase CLI：`supabase db push`（或對應專案/環境設定）
   - 若用 Dashboard：在 SQL Editor 輸入 migration 內容並執行
3. 驗證資料表與欄位
   - `gmail_refresh_token` 欄位存在於 `user_settings`
   - `gmail_sync_queue` 已建立，且有 RLS policy `gmail_sync_queue_owner`
   - `status` 值可正常插入 `pending`

## Step 2 — Cloudflare Worker Secret 設定

在 `apps/api/wrangler.jsonc` 的環境中綁定：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `USER_SETTINGS_SECRET_KEY`（若未設定將影響加解密欄位）

建議命令（在本機有 `wrangler` 權限的前提下）：

```bash
npx wrangler secret put GOOGLE_CLIENT_ID --config apps/api/wrangler.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/api/wrangler.jsonc
npx wrangler secret put USER_SETTINGS_SECRET_KEY --config apps/api/wrangler.jsonc
```

## Step 3 — 重新登入驗證 provider_refresh_token 流程

1. 清理前次 auth cache，使用受測帳號重新登入
2. 在資料表 `user_settings` 檢查該帳號：
   - `gmail_connected = true`
   - `gmail_refresh_token` 非空（加密欄位）
3. 觸發同步流程或等待 cron（`0 2 5 * *`）：
   - 觀察 `gmail_last_sync_at` 更新
   - 觀察 `/cron run` 有 `queued` 與 `errors` 欄位結果

## Step 4 — 真實 Gmail 驗證

1. 以測試帳號收到永豐 5 月帳單
2. 確認至少一筆可對應 bank sender 的 mail 已進 queue
3. 確認「無 PDF 附件」訊息仍可見（符合業務預期）
4. 將測試結果寫入 `memory/04_validation_log.md`

