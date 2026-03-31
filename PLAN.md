# PLAN.md — Hearth

> **專案類型**: 家庭資產管理系統
> **技術棧**: React / TypeScript / Hono / Supabase / Cloudflare
> **複雜度**: L1 → L2（依資料安全與匯入邏輯升級）
> **最後更新**: 2026-03-31
> **Owner**: GavinWu
> **Freshness**: Sprint (7d)

---

## 📋 專案目標

建立一個可長期使用的家庭資產管理系統，整合：

- 月度收支追蹤
- 資產淨值與投資持倉
- 多裝置登入與同步
- 後續可擴展的匯入與報價更新流程

**Bounded Context**:
- 家庭帳戶、現金流、投資、淨值與匯入流程
- 與 Supabase / Cloudflare 對接的產品級系統實作
- 針對永豐資料來源與月帳本格式的 parser 與報表能力

**不負責**:
- 一般型會計 ERP
- 多租戶 SaaS 後台管理
- 即時券商下單或交易執行

---

## 🏗️ 當前階段

```
階段進度:
├─ [✓] Phase A: 專案骨架與部署方向確認
├─ [✓] Phase B: 身份驗證與帳戶基礎
├─ [ ] Phase C: 現金流匯入與月報
├─ [ ] Phase D: 投資匯入與淨值計算
└─ [ ] Phase E: 排程、PWA、產品完善
```

**當前 Phase**: **Phase C — 現金流匯入與月報**

---

## 🔥 本輪聚焦

### 已完成

- [x] 建立 `Hearth` repo 基本 monorepo 骨架
- [x] 導入 `ai-governance-framework` submodule
- [x] 確立部署架構為 `Supabase + Cloudflare`
- [x] 建立 Cloudflare Worker 相容的 API 骨架
- [x] 建立第一條真實 Supabase-backed `accounts` API
- [x] 將 `accounts` API 從 header user-id 升級為 Supabase bearer token 驗證
- [x] 補上 `Hearth` 本地 `PLAN.md` / `MEMORY.md` / `memory/` 導入層

### 目前進行中

- [x] 補上前端真正的登入流程（Supabase Auth）
- [x] `GET /api/auth/me` 與前端 session flow 串接
- [x] 讓前端可以建立與列表 `accounts`
- [x] `accounts + auth` 本地可執行驗證
- [x] 建立月報 API / UI 的第一個 Phase C 切片
- [x] 建立第一條手動 transaction 寫入路徑
- [x] 建立第一條 normalized CSV transaction 匯入路徑
- [x] 建立第一個 `sinopac-tw` 銀行專屬 mapping 切片
- [x] 建立第一個 `excel-monthly` Excel 匯入切片
- [x] 建立第一條 recurring template 正式資料路徑
- [x] 把 `recurringCandidates` 接成 recurring template 批次建立流程
- [x] 讓 recurring template 可套用成當月 transactions
- [x] 補上 transaction delete flow 方便修正資料
- [x] 補上 transaction filter flow（帳戶/日期/類別/關鍵字）
- [x] 補上 transaction edit flow 方便修正資料
- [x] 建立第一版 release readiness 指令與清單
- [x] 建立第一版 Cloudflare 一鍵部署腳本與 runbook
- [x] 完成第一版 Cloudflare 真實部署驗證
- [x] 建立第一版部署後 Smoke Test 指令與清單
- [x] 對 `Hearth` 正式執行 framework `--adopt-existing` baseline adoption
- [x] 建立 repo-specific engineering governance baseline
- [x] 建立信用卡 uncategorized-first review workflow（月份 tabs / inline 分類 / optimistic update）
- [x] 建立銀行帳本 uncategorized-first review workflow（同上模式）
- [x] 擴充共用分類表至完整生活類別結構
- [x] 新增 localStorage-based auto-categorization rules（描述 + 方向 + panel scope）
- [x] 新增月支出趨勢圖（信用卡）與月資金流趨勢圖（銀行）
- [x] 擴充 E.SUN PDF OCR 支援（image-only PDF + 貸款 snapshot）
- [x] 修正多家信用卡跨年日期問題（台新 / 中信 / 兆豐）
- [x] 強化 bank statement parser 邊界（避免信用卡 section 混入）
- [x] 修正 Sinopac 保險 parser regression（inline policy 行格式）
- [x] 改善帳本 description 顯示（2 行 + hover title）
- [x] 貸款 / 保險明細頁改為 card-based 設計

### 接下來

1. [x] Phase E — PWA 安裝體驗（manifest + sw.js + icon SVG）已完成
2. 考慮 Cloudflare Cron 排程（定時報價更新）

---

## 📦 Phase 詳細規劃

### Phase A: 專案骨架與部署方向確認 (已完成 ✓)

**目標**: 定下產品架構與開發骨架

**任務清單**:
- [x] `Hearth-plan.md` 作為初始產品藍圖
- [x] 建立 `apps/web`, `apps/api`, `packages/shared`, `supabase/`
- [x] API 切換為 Cloudflare Workers 方向
- [x] Supabase schema baseline
- [x] framework submodule 導入

### Phase B: 身份驗證與帳戶基礎

**目標**: 讓產品有真實登入者與第一個正式資料模型

**任務清單**:
- [x] Supabase Auth UI 接線
- [x] `GET /api/auth/me` 與前端 session flow 串接
- [x] 帳戶列表與新增帳戶 UI
- [x] `accounts + auth` 本地可執行驗證
- [ ] 初步資料安全邊界整理

### Phase C: 現金流匯入與月報

**目標**: 先完成能日常使用的月報核心

**任務清單**:
- [x] transactions domain types
- [x] 手動 transaction 寫入入口
- [x] normalized CSV 匯入入口
- [x] 第一個銀行專屬 mapping：`sinopac-tw`
- [x] 第一個 `excel-monthly` 匯入切片
- [x] recurring template list/create slice
- [x] recurring candidates -> recurring template bulk-create flow
- [x] recurring template -> monthly transaction apply flow
- [x] transaction delete flow
- [x] transaction filter flow
- [x] transaction edit flow
- [x] first-release readiness commands
- [x] Cloudflare first deploy script/runbook
- [x] Cloudflare first real deployment validation
- [x] 更完整的銀行 / 信用卡匯入入口（sinopac + E.SUN + credit-card 台新/中信/兆豐）
- [ ] 月帳本 Excel parser recurring template / formula-heavy workbook 擴充
- [x] 月度收支報表 API 與 dashboard（含趨勢圖）
- [x] 信用卡 / 銀行 review workflow（uncategorized-first triage）
- [x] Auto-categorization rules（localStorage 第一版）
- [x] Auto-categorization rules 遷移至 Supabase rule table

### Phase D: 投資匯入與淨值計算 (已完成 ✓)

**目標**: 將投資資料與整體淨值做完整

**任務清單**:
- [x] 永豐台股 CSV parser（ROC 日期、買賣別、費稅）
- [x] holdings 重算（匯入後加權平均成本自動更新）
- [x] 報價快照寫入 API + UI（手動更新收盤價）
- [x] portfolio holdings API 與 dashboard 第一版讀取切片
- [x] portfolio net-worth 計算切片（現金 + 投資市值 + FX 換算）

### Phase E: 排程、PWA、產品完善

**目標**: 進入持續使用與行動端體驗

**任務清單**:
- [ ] Cloudflare Cron 排程
- [x] PWA 安裝體驗（manifest.json + sw.js + SVG icons）
- [ ] 週期支出範本
- [ ] 配息與複委託資料

---

## 🎯 當前決策

- 使用 Supabase 作為 PostgreSQL / Auth / Storage 中心
- 使用 Cloudflare Pages + Workers 作為交付與 API 執行層
- 先完成 `accounts` 與 auth，再進匯入與報表
- `Hearth-plan.md` 保留產品原始規劃；`PLAN.md` 作為活的實作計畫

---

## 🚫 現階段不要做

- 不要先做複雜 parser 細節而跳過登入與帳戶基礎
- 不要先上過重的治理機制阻礙產品主流程
- 不要把 framework 內容整份複製進 `Hearth`; 應保持「本地 product context + submodule framework reference」的邊界

---

## 📝 變更歷史

| 日期 | 變更內容 | 原因 |
|---|---|---|
| 2026-03-21 | 建立初始 `PLAN.md` | 將 `Hearth-plan.md` 轉成活的實作與治理計畫 |
| 2026-03-21 | 完成前端 Supabase Auth UI 與 Worker `/api/auth/me` 串接 | 推進 Phase B，讓現有 bearer-token API 真正可從前端使用 |
| 2026-03-21 | 完成帳戶列表與新增帳戶 UI | 建立第一條完整的前端寫入路徑，讓 auth -> worker -> supabase -> UI 閉環成立 |
| 2026-03-21 | 完成 `accounts + auth` 本地可執行驗證 | 以可重複執行的 API tests 鎖住目前核心路徑，降低後續迭代回歸風險 |
| 2026-03-21 | 建立月報第一個 Phase C 切片 | 讓 `transactions -> monthly report API -> dashboard panel` 開始成形 |
| 2026-03-21 | 建立第一條手動 transaction 寫入路徑 | 讓 Phase C 不再只讀取交易，而有真正的資料輸入來源 |
| 2026-03-21 | 建立第一條 normalized CSV transaction 匯入路徑 | 先把通用匯入管線打通，再往銀行/帳本專屬 parser 演進 |
| 2026-03-21 | 建立第一個 `sinopac-tw` 銀行專屬 mapping 切片 | 驗證銀行專屬欄位映射可以建立在通用匯入管線之上 |
| 2026-03-21 | 建立第一個 `excel-monthly` 受控 Excel 匯入切片 | 先把 workbook ingestion seam 建立起來，再依真實月帳本格式擴充 parser |
| 2026-03-21 | 擴充 `excel-monthly` 支援橫向日曆與分類邊界列 | 讓 Excel 匯入更接近 `Hearth-plan.md` 描述的月帳本結構 |
| 2026-03-21 | 擴充 `excel-monthly` 支援多 sheet 與 sidebar 忽略規則 | 讓一份 workbook 可包含摘要頁與多月份資料，同時避免左側固定區塊誤判成交易 |
| 2026-03-21 | 擴充 `excel-monthly` 支援 merged cells 展開 | 讓合併的日期群組與分類 header 也能被現有 parser 正確辨識 |
| 2026-03-21 | 擴充 `excel-monthly` 支援由 sheet 名稱推回完整日期 | 讓 header 只放 day number 的月帳本也能被匯入 |
| 2026-03-21 | 擴充 `excel-monthly` 回傳 recurring/sidebar warnings | 讓固定區塊被跳過時有可見訊號，方便後續接成週期支出模板 |
| 2026-03-21 | 擴充 `excel-monthly` 回傳結構化 recurring candidates | 讓後續 recurring template 不必重跑 parser 或重做辨識邏輯 |
| 2026-03-21 | 建立 recurring template 正式資料路徑 | 讓固定支出與 Excel recurring candidates 有正式可存的 API / schema / UI 入口 |
| 2026-03-21 | 建立 recurring candidates 批次建立 recurring template 流程 | 讓 Excel 偵測到的固定區塊不只可見，還能直接落成正式模板 |
| 2026-03-21 | 對 `Hearth` 正式執行 framework `--adopt-existing` 並通過 drift checker | 讓 framework adoption 從人工約定升級成 machine-verified baseline adoption |
| 2026-03-22 | 讓 recurring template 可套用成當月 transactions | 讓模板正式參與 `transactions -> monthly report` 主資料流，而不只是停留在設定層 |
| 2026-03-22 | 補上 transaction delete flow | 讓手動新增、匯入、模板套用進來的資料有最基本的修正能力，朝第一版可用性前進 |
| 2026-03-22 | 補上 transaction filter flow | 讓第一版可用性從「能看資料」前進到「可用條件檢索資料」，降低日常使用摩擦 |
| 2026-03-22 | 補上 transaction edit flow | 讓第一版交易操作形成完整閉環（新增/篩選/編輯/刪除），提高日常可用性 |
| 2026-03-22 | 建立第一版 release readiness 指令與清單 | 讓第一版交付前有固定可重跑的檢查流程，減少手動漏檢風險 |
| 2026-03-22 | 建立第一版 Cloudflare 一鍵部署腳本與 runbook | 讓第一版從「可檢查」進一步邁向「可重複部署」，降低手動部署漏步風險 |
| 2026-03-22 | 完成第一版 Cloudflare 真實部署驗證 | 將部署流程從 dry-run 提升到真實 worker/pages 發布，確認第一版可被外部訪問 |
| 2026-03-22 | 建立第一版部署後 Smoke Test 指令與清單 | 讓部署完成後可一鍵驗證 API/Web 存活，補上第一版交付的最小驗收關卡 |
| 2026-03-22 | 建立 repo-specific engineering governance baseline | 在 Hearth 落地本地治理分類、架構邊界與測試基線，補齊 framework adoption 的工程治理缺口 |
| 2026-03-22 | 擴充 post-deploy smoke 支援 bearer token 驗證 | 在可用 token 的情況下，讓 smoke 可直接覆蓋 `auth/me` 與 `accounts` 真實認證路徑 |
| 2026-03-22 | 擴充 post-deploy smoke 支援 transactions create/query/delete probe | 在可選模式下覆蓋交易主路徑，並以自動 cleanup 避免污染正式資料 |
| 2026-03-22 | 新增 credit-card-tw 匯入入口與前端模式 | 擴充現金流匯入面向，讓信用卡 CSV 可直接套用現有 normalized pipeline |
| 2026-03-22 | 擴充 post-deploy smoke 支援 account auto-resolve 與 monthly report API 檢查 | 降低驗證門檻並補上報表路徑可用性檢查，提升第一版上線後回歸信心 |
| 2026-03-22 | 擴充 post-deploy smoke 支援 imports/recurring 路徑檢查 | 以 validation-based safe probes 驗證匯入與週期路由可用性，同時避免寫入正式資料 |
| 2026-03-22 | 新增 governance phase gate 自動檢查腳本 | 以機器檢查治理檔與 plan freshness，降低流程漂移風險 |
| 2026-03-22 | 將 governance gate 納入 readiness/deploy 預設流程 | 讓第一版交付檢查同時覆蓋工程可執行性與治理新鮮度，降低 release 遺漏風險 |
| 2026-03-22 | 建立 portfolio holdings 真實讀取切片 | 讓 Phase D 從 stub 前進到 owner-scoped 持倉讀取與前端顯示 |
| 2026-03-22 | 修正 production web API base 指向本機 localhost 問題 | 確保 Cloudflare 部署打包時使用正式 Worker URL，避免線上功能看起來失效 |
| 2026-03-29 | 修正 Sinopac 保險 parser regression | 支援 inline policy/type 行格式，避免遺漏保險快照 |
| 2026-03-30 | 新增 E.SUN OCR 支援與貸款 snapshot parser | image-only PDF 匯入可行，ROC 日期與整數金額格式也納入 |
| 2026-03-30 | 建立信用卡 / 銀行 uncategorized-first review workflow | 月份 tabs、inline 分類 assign、optimistic update、live 分布/趨勢面板 |
| 2026-03-30 | 擴充共用分類表至完整生活類別結構 | 讓手動分類實際可用，為後續 rule-based 自動化打底 |
| 2026-03-30 | 修正多家信用卡跨年日期問題 | 台新/中信/兆豐 MM/DD 行改為正確帶入 statementMonth，修正未來日期月份 tab |
| 2026-03-30 | 強化 bank statement parser 邊界 | 避免信用卡 section 行混入銀行帳本，永豐/玉山均受惠 |
| 2026-03-31 | 新增月支出趨勢圖（信用卡）與月資金流趨勢圖（銀行） | 4 個月堆疊 bar chart，依銀行上色，highlight 當前選取月 |
| 2026-03-31 | 新增 localStorage auto-categorization rules | 依 description + direction + panel scope 學習並自動套用分類，無需 DB migration |
| 2026-03-31 | 改善帳本 description 顯示 | 2 行顯示 + hover title，降低長描述資訊損失 |
| 2026-03-31 | 遷移 auto-categorization rules 至 Supabase | 新增 categorization_rules table + API + 前端改用 apiFetch，規則跨裝置共享 |
| 2026-03-31 | 實作 net-worth 真實計算 | 現金帳戶 tx 加總 + 持倉市值 + FX 換算，從 stub 升級為完整計算 |
| 2026-03-31 | 新增永豐台股 CSV parser + holdings 重算 | ROC 日期、買賣別、費稅、加權平均成本自動更新 |
| 2026-03-31 | 新增報價快照 API + PortfolioPanel 更新 UI | 手動輸入收盤價並儲存，net-worth 改用最新報價計算 |
| 2026-03-31 | 新增 FX 匯率更新 API + UI | GET/POST /api/portfolio/fx-rates，PortfolioPanel 顯示目前匯率並支援更新 |
| 2026-03-31 | 新增報價快照 CSV 批次上傳 | PortfolioPanel 報價區增加 CSV 上傳，前端解析後呼叫現有 price-snapshots API |
| 2026-03-31 | 新增配息 CSV 匯入 | POST /api/import/dividends-csv，ImportPanel 新增配息模式，依 source_hash dedup |
