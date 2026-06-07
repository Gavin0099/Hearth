TASK_INTENT: 進行 UI 元件重設計 pass，完成 Bank/Credit ledger 的視覺 token 對齊。
WORK_COMPLETED: 已完成 GmailSyncPanel、ImportPanel、BankLedgerPanel、CreditCardLedgerPanel 的第一輪視覺一致化。
NOTES: 銀行與信用卡 ledger 目前已加上 `bank-ledger-panel` / `credit-ledger-panel` wrapper，並進一步納入 `panel-copy`、`panel-message` token。
NEXT: 補齊 ledger 專用 wrapper 的 stylesheet token，並視需要再擴展至其他面板。
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
