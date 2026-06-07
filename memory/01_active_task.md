TASK_INTENT: 收斂 repo 未完成項目，先補齊 Gmail server sync 手動部署線（第1步）並同步 PLAN/memory 對齊（第2步）。
WORK_COMPLETED: 已確認 `supabase/migrations/20260507000000_add_gmail_server_sync.sql` 存在並完成手動部署 runbook；已更新 PLAN 的手動部署段落與變更歷史，將「backend migration 準備完備」與後續手動驗證項目明確拆分。
NOTES: 目前 1) migration 套用、2) Cloudflare secrets、3) 重新登入捕獲 `gmail_refresh_token`、4) Gmail 真實郵件驗證，仍需人工執行並回填驗證 log。
NEXT: 依 `docs/gmail-server-sync-deploy-runbook.md` 逐步完成 4 項手動驗證，將每一項結果寫入 `memory/04_validation_log.md`，並同步清掉 PLAN 未完成項目。
- 本輪進度：完成 TransactionsPanel 文案 token 對齊（panel-copy、panel-message）與 	ransactions-panel wrapper 的樣式入口，維持行為不變。
- 本輪進度：完成 `PortfolioPanel` 文案 token 對齊（登入提示 / 載入 / 錯誤 / 狀態訊息 / 無持倉 empty 的 message class 統一），加入 `portfolio-panel` wrapper。
- 本輪進度：完成 MonthlyReportPanel 文案 token 對齊（登入提示、loading、error、無資料、分類明細 loading/error/empty 訊息統一為 panel token）；加入 monthly-report-panel wrapper。
- 本輪進度：完成 OpsPanel wrapper 與訊息文案 token 統一（panel-message 套用，加入 ops-panel wrapper）。
- 本輪進度：完成 `LoanPanel` 文案 token 對齊（intro/loading/no-data訊息）、新增 `loan-panel` wrapper，維持行為不變。
- 本輪進度：完成 InsurancePanel 視覺 token 對齊（intro/loading/no-data）並新增 insurance-panel wrapper；已更新 style anchor 讓 panel 樣式繼承到共用節點。
- 本輪進度：完成 RecurringTemplatesPanel 視覺 token 對齊（登入提示/載入/建立成功/錯誤/套用結果/空狀態 panel-message 類別）並新增 ecurring-templates-panel wrapper，補齊 styles.css 入口。
- 本輪進度：完成 AccountsPanel 與 SettingsPanel 視覺 token 對齊（新增 wrapper、訊息改為 panel-message / panel-copy），並補齊 styles.css。
- 本輪進度：完成 AuthPanel 視覺 token 對齊（uth-panel wrapper；登入狀態提示改為 panel-message/panel-message--error）。
- 全域掃描結果：已補齊目前所有 *Panel.tsx 的 wrapper class token 化掃描；發現 styles.css 還缺 gmail-sync-panel、import-panel 錨點，已新增並完成。
- 追加進展（2026-06-07）：補齊 BankLedgerPanel、CreditCardLedgerPanel、ImportPanel 的兩個狀態文案 p 標籤為 panel-message（含 muted）以完成 message token 化邏輯收斂。
- 追加進展（2026-06-07）：補齊 BankLedgerPanel、CreditCardLedgerPanel、ImportPanel 的兩個狀態文案 p 標籤為 panel-message（含 muted）以完成 message token 化邏輯收斂。
- 全域 strict 掃描（第1步）結果：仍有若干 <p> 未套 className，但皆為卡片標題/欄位標題（非空態/載入/錯誤訊息），不視為 token tokenization 缺口。狀態類未套用訊息已先前完成。
