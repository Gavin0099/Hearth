# PLAN.md — Hearth

> **專案類型**: 家庭資產管理系統
> **技術棧**: React / TypeScript / Hono / Supabase / Cloudflare
> **複雜度**: L1 → L2（依資料安全與匯入邏輯升級）
> **最後更新**: 2026-03-21
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
- [x] 對 `Hearth` 正式執行 framework `--adopt-existing` baseline adoption
- [ ] 建立 repo-specific engineering governance baseline

### 接下來

1. 建立 repo-specific engineering governance baseline
2. 把 `excel-monthly` 的 recurringCandidates 接成真正模板建立動作
3. 擴大 `transactions` 路徑，加入更完整的歷史列表與驗證
4. 視需要補前端端到端驗證

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
- [ ] 更完整的銀行 / 信用卡匯入入口
- [ ] 月帳本 Excel parser recurring template / formula-heavy workbook 擴充
- [x] 月度收支報表 API 與 dashboard 第一版骨架

### Phase D: 投資匯入與淨值計算

**目標**: 將投資資料與整體淨值做完整

**任務清單**:
- [ ] 永豐台股 CSV parser
- [ ] holdings 重算
- [ ] 報價快照與匯率資料流
- [ ] portfolio API 與淨值 dashboard

### Phase E: 排程、PWA、產品完善

**目標**: 進入持續使用與行動端體驗

**任務清單**:
- [ ] Cloudflare Cron 排程
- [ ] PWA 安裝體驗
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
| 2026-03-21 | 對 `Hearth` 正式執行 framework `--adopt-existing` 並通過 drift checker | 讓 framework adoption 從人工約定升級成 machine-verified baseline adoption |
