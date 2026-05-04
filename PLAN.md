# PLAN.md — Hearth

> **專案名稱**: Hearth 家庭財務管理
> **技術棧**: React / TypeScript / Hono / Supabase / Cloudflare
> **風險等級**: L1-L2（以 correctness / security 為優先）
> **最後更新**: 2026-05-04
> **Owner**: GavinWu
> **Freshness**: Sprint (7d)

---

## 📋 專案目標

- 建立可長期維護的家庭財務管理產品
- 提供穩定的現金流匯入、分類、月報與投資追蹤
- 以資料正確性、安全性、可回歸驗證為核心

**Bounded Context**:
- 個人／家庭帳務管理，不做 ERP
- 匯入資料以台灣常見格式為主（銀行、信用卡、券商）
- 平台聚焦單一租戶（每位使用者資料隔離）

**現階段不做**:
- 企業流程管理
- 通用 SaaS 白牌化
- 高度客製報表編輯器

---

## 🏗️ 當前階段

```text
進度摘要:
✅ Phase A: 基礎架構與治理落地
✅ Phase B: 身分驗證與帳戶基礎流程
✅ Phase C: 現金流匯入與月報
✅ Phase D: 投資匯入與淨值計算
✅ Phase E: 排程、PWA、產品完善
```

**Current Phase**: 穩定化與治理維運（Post-Phase E）

---

## 🔥 本輪聚焦

- [x] 信用卡匯入日期統一改用「入帳起息日 / posted date」
- [x] 全信用卡 PDF/CSV parser 套用相同日期語意
- [x] `excel-monthly` 強化（formula-heavy / recurring sidebar）
- [x] recurring candidate -> template 攜帶 amount
- [x] 匯入面板新增一鍵「建立模板並套用本月」
- [x] 初步資料安全邊界文件化（`docs/security-boundary.md`）
- [x] 治理基線與 memory 同步

---

## 📦 Phase 詳細規劃

### Phase A: 基礎架構與治理
- [x] Monorepo 建置（web/api/shared）
- [x] 導入 `ai-governance-framework` submodule
- [x] 建立 repo-local governance 與 memory 架構

### Phase B: Auth 與帳戶
- [x] Supabase Auth 前後端串接
- [x] `GET /api/auth/me` 與 session 驗證
- [x] 帳戶 CRUD 與 ownership 驗證

### Phase C: 現金流與月報
- [x] 手動交易 / CSV 匯入 / Sinopac 匯入
- [x] 信用卡（CSV/PDF）posted-date 語意統一
- [x] `excel-monthly` 與 recurring candidate 流程
- [x] recurring template 建立與套用
- [x] 月報 API / Dashboard / 篩選 / 編修 / 刪除

### Phase D: 投資與淨值
- [x] 券商 CSV 匯入與 holdings 重建
- [x] 淨值、成本、股利、FX 追蹤
- [x] 相關 API / UI 與回歸測試

### Phase E: 排程與產品完善
- [x] daily update cron 與 ops 檢查
- [x] PWA（manifest / service worker / icons）
- [x] smoke/readiness 流程與治理 gate

---

## 🎯 當前決策

- `transactions` 仍為現金流報表單一事實來源
- `supabase/migrations/` 為 schema 變更唯一真源
- parser 與匯入流程優先 correctness，其次再追求新功能
- posted date 作為信用卡入帳月份判定基準

---

## 🚫 現階段不要做

- 重寫既有架構成多服務分散式系統
- 未定義資料契約下的大型 UI 重構
- 跳過測試與治理檢查直接發布

---

## 📝 變更歷史

| 日期 | 變更 | 說明 |
|---|---|---|
| 2026-05-04 | 信用卡日期語意統一 | 全 parser 改為以 posted date 入帳，避免跨月拆分誤解 |
| 2026-05-04 | Excel recurring/formula 擴充 | 支援 formula-heavy workbook 與 recurring sidebar 候選擷取 |
| 2026-05-04 | 一鍵 recurring 套用流程 | 匯入面板新增 create-and-apply 一鍵流程 |
| 2026-05-04 | 治理同步修正 | 修復 PLAN freshness/section inventory，更新 memory 與 validation log |
