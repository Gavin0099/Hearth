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
├─ [ ] Phase B: 身份驗證與帳戶基礎
├─ [ ] Phase C: 現金流匯入與月報
├─ [ ] Phase D: 投資匯入與淨值計算
└─ [ ] Phase E: 排程、PWA、產品完善
```

**當前 Phase**: **Phase B — 身份驗證與帳戶基礎**

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

- [ ] 補上前端真正的登入流程（Supabase Auth）
- [ ] 讓前端可以建立與列表 `accounts`
- [ ] 建立 repo-specific engineering governance baseline

### 接下來

1. 完成 Google login / logout 與 session 顯示
2. 完成帳戶建立 UI
3. 為 `accounts` 和 auth flow 補本地可執行驗證
4. 進入現金流匯入與月報切片

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
- [ ] Supabase Auth UI 接線
- [ ] `GET /api/auth/me` 與前端 session flow 串接
- [ ] 帳戶列表與新增帳戶 UI
- [ ] 初步資料安全邊界整理

### Phase C: 現金流匯入與月報

**目標**: 先完成能日常使用的月報核心

**任務清單**:
- [ ] transactions domain types
- [ ] 銀行 / 信用卡匯入入口
- [ ] 月帳本 Excel parser
- [ ] 月度收支報表 API 與 dashboard

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
