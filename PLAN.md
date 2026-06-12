# PLAN.md — Hearth

> **專案名稱**: Hearth 家庭財務管理
> **技術棧**: React / TypeScript / Hono / Supabase / Cloudflare
> **風險等級**: L1-L2（以 correctness / security 為優先）
> **最後更新**: 2026-06-11
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

## 🔥 本輪聚焦（Sprint 2026-05-23）

### 已完成（前輪收尾）
- [x] 信用卡匯入日期統一改用「入帳起息日 / posted date」
- [x] 全信用卡 PDF/CSV parser 套用相同日期語意
- [x] `excel-monthly` 強化（formula-heavy / recurring sidebar）
- [x] recurring candidate -> template 攜帶 amount
- [x] 匯入面板新增一鍵「建立模板並套用本月」
- [x] 初步資料安全邊界文件化（`docs/security-boundary.md`）
- [x] `ai-governance-framework` 升級至 v1.2.1 → v1.2.0+post（c5152c1），drift check 17/17 PASS
- [x] Gmail OAuth `access_type=offline`：解決每小時強制重登問題
- [x] Gmail 帳單查詢改用 90 天日期視窗（移除 `has:attachment`，maxResults 提升至 12）
- [x] Items 1-4：PortfolioPanel cron status UI、trigger API、server-side Gmail cron、queue UI

### 已完成（05-17 UI 基礎）
- [x] CSS design token 全面落地：所有 panel 使用 token，無 hardcoded 色彩
- [x] Shadcn-style primitive layer（Button/Card/Badge/Tabs/Dialog/Skeleton）
- [x] Home 資訊架構重整：主流程（Gmail/Import）vs 次要分析 panel 分層
- [x] 視覺打磨：字體階層、panel 深度、首頁進場動畫（含 reduced-motion）
- [x] Mobile/無障礙 pass：觸控目標、nav flow、小螢幕間距

### 已完成（05-22 治理 re-onboarding）
- [x] `ai-governance-framework` submodule URL 對齊 GitLab remote
- [x] `.governance/version_manifest.yaml` 新增，通過 version_compatibility gate
- [x] `contract.yaml` 手動決策：`domain=household-finance`、`risk_tier=L2`
- [x] `governance/framework.lock.json` 採用版本正規化至 `1.2.0`
- [x] `pre-push` hook bug 修正（`xargs -rI{}`＋stdin-independent fallback）
- [x] governance drift `severity=ok`，runtime smoke `session_start_ok=True`
- [x] push 成功，所有 gate 通過

### 已完成（06-11 治理維運）
- [x] parent `main` 已同步至 `origin/main`
- [x] `ai-governance-framework` submodule 已更新至 `9f7fa1e3a6b6ac7f90010f7048a23e44ae3ebb52`
- [x] `governance/framework.lock.json`、`version_compatibility.json`、AGENTS / local hook paths 已對齊
- [x] Claude / GitHub Copilot / Gemini closeout hooks 已 verify + smoke test compliant
- [x] runtime append-only ledgers 已依 manual-promotion-only policy 清理，工作樹回到乾淨狀態
- [x] 2026-06-12 F-7 apply：framework pointer already_current、repo-local instruction already_current、memory writer verified、hook validator updated；existing memory normalization 仍為 not_verified，因此不宣稱 full_update_completed

### 本輪重點（進行中）

#### 手動部署（需人工操作）
- [x] backend migration 已就緒：`supabase/migrations/20260507000000_add_gmail_server_sync.sql` 存在
- [x] 本機 Gmail server-sync readiness 檢查已就緒：`scripts/gmail-server-sync-readiness.ps1 -PrintSqlChecks` PASS
- [x] deployed Worker `/health` readiness flags 已驗證：`scripts/gmail-server-sync-readiness.ps1 -ApiBaseUrl https://hearth-api.meiraybooks.workers.dev` PASS
- [x] Supabase migration read-only verifier 已就緒：`scripts/gmail-server-sync-supabase-readiness.ps1 -PrintSqlOnly` PASS
- [x] 執行並驗證 Supabase migration `20260507000000_add_gmail_server_sync.sql`：caller-run `scripts/gmail-server-sync-supabase-readiness.ps1` PASS
- [ ] Cloudflare Dashboard / Wrangler Secret 設定 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`
- [ ] 重新登入 app，確認 `provider_refresh_token` 被捕獲並儲存於 `user_settings.gmail_refresh_token`
- [ ] Gmail 真實驗證：確認永豐 5 月帳單可見、通知信顯示「無 PDF 附件」
- [ ] 依 `docs/gmail-server-sync-deploy-runbook.md` 完成驗證並補上 validation log

#### UI 元件重設計 pass（本輪開工）
- [x] GmailSyncPanel 內部元件對齊 design token（狀態指示、佇列列表、無 PDF badge）
- [x] ImportPanel 內部元件對齊 design token（preview table、結果訊息、recurring candidate 狀態）
- [x] 統一 form / table / badge 視覺語言，與 home 層級保持一致

#### 安全邊界強化 Phase F-1（本輪開工）
- [x] RLS hardening map：逐表列出 RLS 狀態與對應路由（`docs/security-rls-map.md`）
- [x] Route-by-route auth 矩陣：auth + ownership + validation + failure code（`docs/security-route-auth-matrix.md`）
- [x] Secret lifecycle policy：PDF 密碼 rotation cadence 與 plaintext 消滅目標（`docs/security-secret-lifecycle.md`）
- [ ] Security F-1 verification pass：對照目前 routes/migrations，修正 stale doc 與缺漏測試項

#### 銀行 PDF 樣本回歸（等樣本）
- [ ] 玉山/永豐銀行帳戶 PDF 樣本回歸（見 `docs/bank-statement-sample-checklist-esun-sinopac.md`）

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
| 2026-05-07 | 治理框架升級 | ai-governance-framework v1.2.1 full adopt，AGENTS.md governance key sections，git hooks，token run checklist |
| 2026-05-07 | Gmail OAuth 修正 | access_type=offline 解決重登問題；移除 has:attachment，改用 90 天日期視窗 |
| 2026-05-07 | 股價/匯率/Gmail 排程功能 | Items 1-4：PortfolioPanel cron status UI、trigger API、server-side Gmail cron、queue UI |
| 2026-05-07 | 治理框架升級至 c5152c1 | v1.2.0+post，drift check 17/17 PASS（expansion_boundary 也通過） |
| 2026-05-16 | readiness gate 強化 | first-release-readiness 改為 fail-fast；修正 3 個 API 測試期望並恢復 173/173；codeonly readiness PASS |
| 2026-05-16 | 銀行樣本範圍收斂 | Item 3 續作先聚焦玉山/永豐，新增專用樣本回歸 checklist |
| 2026-05-17 | UI 設計系統落地 | CSS design token 全面落地；shadcn primitive layer；home 資訊架構重整；視覺打磨；mobile/a11y pass |
| 2026-05-22 | 治理 re-onboarding | submodule URL 對齊；version_manifest.yaml；risk_tier=L2；pre-push hook bug 修正；push gate 全通過 |
| 2026-05-23 | PLAN 刷新 | Sprint 視窗更新至 05-23；新增 UI restyling pass 與 Security Phase F-1 工作項 |
| 2026-06-07 | 治理更新 | F-7 update-governance-submodule 已將 ai-governance-framework 指向 `57db6c164182b560fe6acc017b2ed93899dd422c` |
| 2026-06-07 | Gmail server sync 落地規劃 | 新增 `docs/gmail-server-sync-deploy-runbook.md`，並將手動部署清單同步為 migration/Cloudflare secrets/provider token/真實驗證待完成項目。 |
| 2026-06-11 | 治理更新 | parent repo 與 AI Governance submodule 已更新到最新；version/drift/hook smoke 通過，runtime ledger dirty state 已清理。 |
| 2026-06-11 | Gmail server-sync readiness | 新增 `scripts/gmail-server-sync-readiness.ps1`，本機確認 migration/runbook/config/code prerequisites；外部 Supabase/Cloudflare/Gmail 驗證仍未完成。 |
| 2026-06-12 | Gmail deployed health readiness | `scripts/gmail-server-sync-readiness.ps1 -ApiBaseUrl https://hearth-api.meiraybooks.workers.dev` PASS；僅確認 Worker health flags，不代表 migration/OAuth/Gmail 真實驗證完成。 |
| 2026-06-12 | Gmail Supabase migration verifier | 新增 `scripts/gmail-server-sync-supabase-readiness.ps1`，可用 caller-provided DB URL read-only 驗證 migration 是否已套用；未提交任何 secret。 |
| 2026-06-12 | 治理更新 | `ai-governance-framework` fast-forward 至 `9f7fa1e3a6b6ac7f90010f7048a23e44ae3ebb52`；dry-run PASS，F-7 final_status 保守為 `not_verified`（existing memory normalization 未驗證）。 |
| 2026-06-12 | UI token pass | GmailSyncPanel / ImportPanel 狀態、badge、preview chip/table、mobile row behavior 對齊現有 design tokens；版本 bump 至 `0.3.1`；web check/build PASS，Browser smoke 0 app console errors。 |
| 2026-06-12 | Gmail Supabase live verification | User-applied Gmail server-sync migration in Supabase SQL Editor and caller-run `scripts/gmail-server-sync-supabase-readiness.ps1` returned all five PASS checks; OAuth refresh-token capture and real Gmail ingestion still pending. |
| 2026-06-12 | Gmail deployment boundary | Post-migration API/web smoke PASS；Cloudflare secret list blocked by missing `CLOUDFLARE_API_TOKEN`，因此 Google secrets / OAuth refresh token / real Gmail ingestion 仍未 claim 完成。 |
