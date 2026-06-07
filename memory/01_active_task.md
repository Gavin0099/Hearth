TASK_INTENT: 進行 UI 元件重設計 pass，完成 Bank/Credit ledger 的視覺 token 對齊。
WORK_COMPLETED: 已完成 GmailSyncPanel、ImportPanel、BankLedgerPanel、CreditCardLedgerPanel 的第一輪視覺一致化。
NOTES: 銀行與信用卡 ledger 目前已加上 `bank-ledger-panel` / `credit-ledger-panel` wrapper，並進一步納入 `panel-copy`、`panel-message` token。
NEXT: 補齊 ledger 專用 wrapper 的 stylesheet token，並視需要再擴展至其他面板。
- 本輪進度：完成 TransactionsPanel 文案 token 對齊（panel-copy、panel-message）與 	ransactions-panel wrapper 的樣式入口，維持行為不變。
- 本輪進度：完成 `PortfolioPanel` 文案 token 對齊（登入提示 / 載入 / 錯誤 / 狀態訊息 / 無持倉 empty 的 message class 統一），加入 `portfolio-panel` wrapper。
- 本輪進度：完成 MonthlyReportPanel 文案 token 對齊（登入提示、loading、error、無資料、分類明細 loading/error/empty 訊息統一為 panel token）；加入 monthly-report-panel wrapper。
