# Canonical Audit Trend 測試報告（2026-04-13）

## 1) 更新動作結果

- `Hearth` 主 repo：`git pull --ff-only origin main` → `Already up to date.`
- `ai-governance-framework` 子模組：
  - 原先在 `ef34729`（detached HEAD）
  - 已更新到 `48fafea`（`gavin0099/main` 當下最新可抓取 commit）
  - 註：子模組 `origin` remote 在目前執行環境有憑證問題，改用可連線 remote `gavin0099` 完成更新。

## 2) 情境 A（已 onboarded consuming repo）

### A-1. 目前 consuming repo 狀態（以 `Hearth` 為對象）

- 已有治理檔：`governance/AGENT.md`、`ARCHITECTURE.md`、`TESTING.md` 等。
- 缺少 `governance/gate_policy.yaml`（hook 以 framework default policy fallback）。
- `artifacts/session-closeout.txt` 與 `artifacts/runtime/test-results/latest.json` 缺失，導致 hook 回傳 strict policy error。

### A-2. 實測指令與結果

1. 分布統計（原始 log）：

```powershell
Get-Content artifacts/runtime/canonical-audit-log.jsonl |
ConvertFrom-Json |
Group-Object { $_.signals.Count -gt 0 } |
Select-Object Name, Count
```

結果：

- `True: 1`（初次執行後只有 signal>0 的資料）

2. trend 輸出：

```powershell
python ai-governance-framework/governance_tools/session_end_hook.py --project-root . --format json |
python -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['canonical_audit_trend'], indent=2))"
```

關鍵結果（第二次執行後）：

- `entries_read: 2`
- `entries_with_signals: 2`
- `signal_ratio: 1.0`
- `top_signals: {"test_result_artifact_absent": 2}`
- `adoption_risk: true`

## 3) 情境 B（無真實 consuming repo，先用 fixture 模擬）

### B-1. 佈建 fixture

在 framework repo 建立 fixture project root：

- `ai-governance-framework/tmp/canonical-trend-fixture`

寫入資料：

- 5 筆 `signals=["test_result_artifact_absent"]`
- 5 筆 `signals=[]`

之後再跑一次 `session_end_hook`（會再追加 1 筆當次 session，該筆為 signal>0）。

### B-2. hook 輸出（E8b + E1a 相關）

關鍵結果：

- `canonical_audit_trend.entries_read: 11`
- `canonical_audit_trend.entries_with_signals: 6`
- `canonical_audit_trend.signal_ratio: 0.5455`
- `canonical_audit_trend.adoption_risk: true`
- `canonical_usage_audit.usage_status: "trend_risk_context"`
- `canonical_usage_audit.trend_signal_ratio: 0.5455`

解讀：

- `signal_threshold_ratio=0.5` 下，`0.5455` 會被判定為風險。
- 這個結果符合你預期的「先用 fixture 感受閾值靈敏度」。

## 4) 對你問題的直接回答

### 有現成 consuming repo 嗎？

- 有，`Hearth` 本身可當 consuming repo。

### 還是需要先確認 onboarding 是否完整？

- 需要補齊 onboarding 收尾，至少：
  - 新增 `governance/gate_policy.yaml`（避免永遠 fallback default policy）
  - 在每次 session 生成 `artifacts/session-closeout.txt`
  - 在 session 結束前產生 `artifacts/runtime/test-results/latest.json`

目前狀態是「可跑 trend，但治理訊號會因缺 artifact 長期偏高」。

## 5) 建議下一步（2~3 週觀察）

1. 在同一個 consuming repo 持續累積 20+ session。
2. 每週 dump 一次 `canonical-audit-log.jsonl` 看 signal 組成與任務型態關聯。
3. 再決定 `signal_threshold_ratio` 是否由 `0.5` 下修（降低 false positive）或維持。
