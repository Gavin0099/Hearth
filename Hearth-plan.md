# Hearth — 家庭資產管理系統規劃文件 v1.0

> 專案名稱：**Hearth**
> GitHub Repo：`hearth`
> 建立日期：2026-03-21

---

## 目錄

1. [系統概覽](#1-系統概覽)
2. [技術架構](#2-技術架構)
3. [資料庫 Schema](#3-資料庫-schema)
4. [永豐台股 CSV Parser 規格](#4-永豐台股-csv-parser-規格)
5. [月帳本 Excel Parser 規格](#5-月帳本-excel-parser-規格)
6. [Sprint 執行計畫](#6-sprint-執行計畫)
7. [核心 API 設計](#7-核心-api-設計)
8. [關鍵決策與風險](#8-關鍵決策與風險)
9. [附錄：待辦清單](#9-附錄待辦清單)

---

## 1. 系統概覽

整合家庭所有財務資料，提供三大核心功能：

- **月度收支報表** — 分類支出趨勢、與預算比較
- **資產淨值追蹤** — 現金 + 投資（台股）合計，含浮盈浮虧
- **多裝置存取** — 手機、平板、電腦同步

### 1.1 技術選型

| 層次 | 選型 | 理由 |
|------|------|------|
| 前端 | React + TypeScript | 元件化、生態豐富、支援 PWA |
| 狀態管理 | React Query + Zustand | 伺服器快取 + 本地狀態分離 |
| 後端 | Node.js + Hono | 輕量、TypeScript 原生 |
| 資料庫 | Supabase (PostgreSQL) | 多裝置同步、RLS 權限、Auth 內建 |
| 圖表 | Recharts | React 原生、輕量 |
| 部署 | Vercel（前端）+ Railway（後端） | 自動 CI/CD、免費層夠用 |

### 1.2 資料來源

| 來源 | 格式 | 處理方式 | 幣別 |
|------|------|----------|------|
| 永豐銀行交易明細 | CSV | 自動匯入 Parser | TWD |
| 信用卡帳單 | PDF / CSV | 自動匯入 Parser | TWD |
| 月帳本 Excel（2026.xlsx） | xlsx | Excel Parser 匯入 | TWD |
| 手動支出 / 週期支出 | 表單輸入 | 手動每月輸入一次 | TWD |
| 永豐台股對帳單 | CSV | 自動匯入 Parser | TWD |
| 永豐複委託對帳單 | CSV | Parser（Sprint 7 加入） | USD → TWD |
| 投資報價 | Yahoo Finance CSV | 每日排程抓取 | TWD / USD |

---

## 2. 技術架構

### 2.1 分層設計

```
┌─────────────────────────────────────────┐
│           前端層（React）                 │
│  Dashboard │ 上傳介面 │ 手動輸入 │ PWA   │
└──────────────────┬──────────────────────┘
                   │ REST API / tRPC
┌──────────────────▼──────────────────────┐
│           API 層（Hono）                  │
│   路由 │ JWT 驗證 │ 業務邏輯              │
└───────────┬──────────────┬──────────────┘
            │              │
┌───────────▼───┐  ┌───────▼──────────────┐
│  解析層        │  │  排程層               │
│  CSV Parser   │  │  報價抓取 / 匯率更新  │
│  Excel Parser │  │  (Cron / Edge Func)  │
│  去重 / 分類   │  └──────────────────────┘
└───────────┬───┘
            │
┌───────────▼──────────────────────────────┐
│           儲存層（Supabase）               │
│  PostgreSQL │ Auth │ File Storage         │
└──────────────────────────────────────────┘
```

### 2.2 三個核心設計原則

**現金流 vs 資產轉換分離**

買股票的扣款不計入月度支出，而是「現金 → 投資資產」的轉移。`transactions` 表只放日常收支，`investment_trades` 獨立存放。否則月報支出數字會嚴重失真。

**去重機制**

每筆交易計算：

```
source_hash = SHA256(date + amount + description + account_id)
```

匯入前先查詢是否已存在，避免重複匯入同一份對帳單。

**幣別統一策略**

各帳戶保留原幣記錄，報表顯示時透過 `fx_rates` 表換算台幣合計。匯率每日更新一筆，歷史淨值可回算任意日期。

---

## 3. 資料庫 Schema

### accounts（帳戶）

```sql
CREATE TABLE accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  name       TEXT NOT NULL,          -- 顯示名稱，如「永豐台股」
  type       TEXT NOT NULL,          -- cash_bank / cash_credit / investment_tw / investment_foreign
  currency   TEXT NOT NULL DEFAULT 'TWD',
  broker     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### transactions（現金流交易）

```sql
CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts NOT NULL,
  date        DATE NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,   -- 支出為負值
  currency    TEXT NOT NULL DEFAULT 'TWD',
  category    TEXT,                     -- 餐飲 / 交通 / 教育 / 醫療 ...
  description TEXT,
  source      TEXT,                     -- sinopac_bank / credit_card / excel_monthly / manual
  source_hash TEXT UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### investment_trades（股票交易紀錄）

```sql
CREATE TABLE investment_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID REFERENCES accounts NOT NULL,
  trade_date      DATE NOT NULL,
  ticker          TEXT NOT NULL,
  name            TEXT,
  action          TEXT NOT NULL,            -- BUY / SELL
  shares          DECIMAL(14,6) NOT NULL,   -- 允許小數（豐存股定額）
  price_per_share DECIMAL(12,4) NOT NULL,
  fee             DECIMAL(10,2) DEFAULT 0,
  tax             DECIMAL(10,2) DEFAULT 0,  -- 證交稅，台股賣出才有
  currency        TEXT NOT NULL DEFAULT 'TWD',
  source          TEXT,
  source_hash     TEXT UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### holdings（當前持倉快照）

```sql
CREATE TABLE holdings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID REFERENCES accounts NOT NULL,
  ticker       TEXT NOT NULL,
  name         TEXT,
  total_shares DECIMAL(14,6) NOT NULL,
  avg_cost     DECIMAL(12,4) NOT NULL,   -- 加權平均成本，每次買入後重算
  currency     TEXT NOT NULL DEFAULT 'TWD',
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, ticker)
);
```

### price_snapshots（報價快照）

```sql
CREATE TABLE price_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  close_price   DECIMAL(12,4) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'TWD',
  UNIQUE(ticker, snapshot_date)
);
```

### fx_rates（匯率）

```sql
CREATE TABLE fx_rates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency   TEXT NOT NULL DEFAULT 'TWD',
  rate_date     DATE NOT NULL,
  rate          DECIMAL(10,4) NOT NULL,
  UNIQUE(from_currency, to_currency, rate_date)
);
```

### dividends（配息紀錄）

```sql
CREATE TABLE dividends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID REFERENCES accounts NOT NULL,
  ticker       TEXT NOT NULL,
  pay_date     DATE NOT NULL,
  gross_amount DECIMAL(12,4),
  tax_withheld DECIMAL(12,4) DEFAULT 0,   -- 美股預扣稅 30% 或 15%
  net_amount   DECIMAL(12,4) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'TWD',
  source_hash  TEXT UNIQUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. 永豐台股 CSV Parser 規格

> 格式依據：2025/10 永豐電子對帳單截圖確認

### 4.1 區塊一：證券庫存

| CSV 欄位名稱 | 對應 Schema | 處理備註 |
|-------------|-------------|----------|
| 交易別 | — | 固定「現股」，略過 |
| 證券（代號子欄） | `ticker` | 視 CSV 格式決定是否需拆分 |
| 證券（名稱子欄） | `name` | |
| 庫存餘額 | `holdings.total_shares` | 整數 |
| 平均成本價格 | `holdings.avg_cost` | 直接使用 |
| 總投資成本 | — | 計算欄，不存 |
| 參考市價 | `price_snapshots.close_price` | 匯入時同步存一筆快照 |
| 參考市值 | — | 計算欄，不存 |
| 累計配息 | — | 匯總欄，明細另行匯入 |
| 未實現損益 | — | 計算欄，不存 |

### 4.2 區塊二：證券交易明細

| CSV 欄位名稱 | 對應 Schema | 處理備註 |
|-------------|-------------|----------|
| 成交日期 | `trade_date` | `YYYY/MM/DD` → `YYYY-MM-DD` |
| 交易別 | `action` | 見 4.3 normalize 表 |
| 證券 | `ticker` + `name` | 合併欄，需拆分 |
| 股數 | `shares` | 允許小數 |
| 單價 | `price_per_share` | 移除千分位逗號 |
| 成交金額 | `settlement_amount` | 移除千分位逗號 |
| 手續費 | `fee` | |
| 證交稅款 | `tax` | 買進為 0 |
| 客戶應付 | — | 計算欄，不存 |

### 4.3 action normalize 表

| 永豐原始值 | normalize 結果 | 說明 |
|-----------|---------------|------|
| 首買 | BUY | 第一次買進 |
| 買進 | BUY | 一般買進 |
| 加碼 | BUY | 追加買進 |
| 零股買進 | BUY | 零股交易 |
| 定期定額 | BUY | 豐存股扣款 |
| 賣出 | SELL | 一般賣出 |
| 零股賣出 | SELL | 零股賣出 |

### 4.4 待確認項目（拿到實際 CSV 後對照）

- [ ] 「證券」欄：代號和名稱是同一欄還是兩個獨立欄？
- [ ] CSV 編碼：UTF-8 或 Big5？（VS Code 右下角確認）
- [ ] 有無 BOM（`\uFEFF`）？
- [ ] 小計列的格式：「小計」文字出現在哪個欄位？
- [ ] 確認是否有其他 `交易別` 值未列於 4.3

> 確認後只需更新 `COLUMN_MAP`，parser 主邏輯不動。

---

## 5. 月帳本 Excel Parser 規格

> 格式依據：2026.xlsx 截圖確認

### 5.1 Excel 結構說明

這份帳本為**日曆橫向展開格式**，與標準 CSV 縱向格式根本不同，需專門 parser。

| 區塊 | 位置 | 處理方式 |
|------|------|----------|
| 右側每日欄（項目 / 金額） | 日期橫向展開，每天一組欄 | 轉換為縱向 transactions |
| 分類小計列（飲食費用、生活雜費、交通花費） | 藍色 header 列 | 作為 category 邊界，不匯入為交易 |
| 左側常態收入 | 固定左側區塊 | 手動輸入，不 parse |
| 左側週期支出（房租、孝親費、電費...） | 固定左側區塊 | 手動每月輸入一次，不 parse |
| 左側常態扣除（儲蓄、定期定額...） | 固定左側區塊 | 屬資產轉移，不計入支出 |

### 5.2 轉換邏輯

```
輸入：橫向日曆（每天一欄，每個項目一行）
輸出：縱向 transactions（每筆一行）

步驟：
1. 掃描找出所有日期欄的 column index（含日期的列）
2. 掃描找出所有分類小計列的 row index（飲食費用、生活雜費、交通花費...）
3. 以分類列為邊界，建立 row range → category 對應表
4. 逐欄（每天）× 逐行（每個項目）掃描非空金額
5. 根據該 row 所在的 category 區間打上分類標籤
6. 組成標準 transaction：
   { date, description, amount, category, source: 'excel_monthly' }
```

### 5.3 分類對應表（從截圖確認）

| Excel 分類列 | Hearth category |
|-------------|----------------|
| 飲食費用 | 餐飲 |
| 生活雜費 | 生活購物 |
| 交通花費 | 交通 |
| 其他（待確認） | 其他 |

### 5.4 週期支出處理方式

週期支出（房租、孝親費 $10,000、電動車月費 $499、幼稚園 $11,000 等）採**手動每月輸入一次**，不 parse Excel 左側區塊。

後期可在 Hearth 加「重複支出範本」功能，儲存上月值，下個月一鍵帶入後微調，減少重複輸入。

### 5.5 待確認項目（拿到實際 xlsx 後對照）

- [ ] 確認日期列的實際 row index
- [ ] 確認所有分類小計列的名稱與 row index
- [ ] 確認「項目」和「金額」欄的相對 column offset
- [ ] 確認空白列 / 小計列的過濾條件
- [ ] 確認每月是否一個獨立 sheet 或同一 sheet 橫向延伸

---

## 6. Sprint 執行計畫

| Sprint | 目標 | 主要產出 | 預估工時 |
|--------|------|---------|----------|
| S1 | 資料基礎建設 | Supabase schema、Google Auth、accounts 管理頁 | 1 週 |
| S2 | 現金流匯入 + 月報 | 銀行 CSV parser、信用卡 parser、月度收支 Dashboard | 2 週 |
| S3 | 台股對帳單匯入 | 永豐台股 CSV parser、holdings 重算邏輯 | 1 週 |
| S4 | 月帳本 Excel 匯入 | 橫向日曆 → 縱向 transactions parser、匯入介面 | 1 週 |
| S5 | 報價 + 淨值計算 | Yahoo Finance 排程、浮盈浮虧、資產淨值 Dashboard | 1.5 週 |
| S6 | 手動輸入 + PWA | 快速支出表單、週期支出範本、PWA 安裝 | 1 週 |
| S7 | 配息 + 複委託 | dividends 匯入、USD/TWD 雙幣、複委託 parser | 2 週 |

> S2 完成後即可日常使用月報。S3–S5 完成後有完整資產淨值。Excel parser 在 S4 獨立處理，因格式特殊需要額外座標確認。複委託 parser 等實際 CSV 格式確認後再進 S7。

---

## 7. 核心 API 設計

### 月度收支報表

```
GET /api/report/monthly?year=2026&month=3
```

回傳：月收入、月支出、分類彙總、每日支出時序

### 資產淨值

```
GET /api/portfolio/net-worth
```

回傳：現金總額（TWD）、投資市值（原幣小計 + TWD 合計）、總淨值、與上月差異

### 持倉明細

```
GET /api/portfolio/holdings
```

回傳：每檔股票的股數、平均成本、當前市值、浮盈浮虧（原幣 + TWD）

### CSV 匯入

```
POST /api/import/sinopac-tw
POST /api/import/excel-monthly
```

接收 `multipart/form-data`，回傳：新增筆數、跳過（重複）筆數、錯誤筆數

### 浮盈浮虧計算公式

```
未實現損益（原幣）= total_shares × current_price − total_shares × avg_cost
未實現損益（TWD） = 未實現損益（原幣）× 最新匯率
報酬率%          = 未實現損益（含息）÷ 總投資成本 × 100
```

---

## 8. 關鍵決策與風險

### 8.1 已決定

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| 前端框架 | React + TypeScript | 工程師熟悉度高 |
| 後端框架 | Node.js + Hono | 輕量、TS 原生 |
| 資料庫 | Supabase | 多裝置同步、RLS、Auth 內建 |
| 報價來源 | Yahoo Finance CSV（初期） | 免費穩定，後期升級 API |
| 幣別策略 | 原幣記錄 + TWD 換算顯示 | 準確性與實用性平衡 |
| 分類方式 | 關鍵字規則匹配（初期） | 快速上線，後期可加 ML |
| 台股 parser | 永豐 CSV（格式已確認） | 基於 2025/10 對帳單截圖 |
| Excel parser | 橫向日曆專用 parser | 格式特殊，無法用通用 CSV parser |
| 週期支出 | 手動每月輸入 + 範本功能 | 比 parse 非標準格式更可靠 |
| 複委託 parser | 待格式確認後加入 S7 | USD 幣別需額外匯率處理 |

### 8.2 風險與對策

| 風險 | 機率 | 對策 |
|------|------|------|
| 永豐 CSV 欄位名稱與推測不符 | 高 | 拿到 CSV 後 30 分鐘內可修正 COLUMN_MAP |
| CSV 編碼為 Big5 導致亂碼 | 中 | 加 iconv-lite 轉碼，parser 已預留 |
| Excel 每月 sheet 結構不一致 | 中 | parser 加版本偵測，依 sheet 名稱選策略 |
| Yahoo Finance 限流或格式變更 | 中 | 改用 Alpha Vantage 或手動更新 |
| 同一筆交易在多份對帳單重複 | 高 | source_hash 唯一索引，重複自動跳過 |
| 複委託 USD 匯率時間點不一致 | 中 | 統一使用匯入當日匯率，備注說明 |

---

## 9. 附錄：待辦清單

### 立即可執行

- [ ] 建立 Supabase 專案，執行 Schema SQL
- [ ] 設定 Google OAuth
- [ ] 建立 Hono 後端專案骨架（TypeScript）
- [ ] 建立 React 前端專案（Vite + React Query）
- [ ] 定義交易分類關鍵字規則表

### 拿到實際 CSV 後（台股對帳單）

- [ ] 核對欄位名稱，更新 COLUMN_MAP
- [ ] 確認 CSV 編碼（UTF-8 或 Big5）
- [ ] 確認「證券」欄是合併欄還是獨立欄
- [ ] 確認小計列的過濾條件
- [ ] 跑完整匯入測試，驗證 source_hash 去重

### 拿到實際 xlsx 後（月帳本）

- [ ] 確認日期列 / 分類列的 row index
- [ ] 確認每月結構（獨立 sheet 或橫向延伸）
- [ ] 實作 Excel parser 並跑測試

### 後期（S6–S7）

- [ ] 週期支出範本功能（儲存上月值，一鍵帶入）
- [ ] 匯出複委託對帳單 CSV，確認格式後實作 parser
- [ ] 設定每日 Yahoo Finance 報價排程
- [ ] PWA manifest 設定，支援手機桌面安裝
- [ ] 月報 PDF 匯出功能
