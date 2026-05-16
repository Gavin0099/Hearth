# 銀行帳戶 PDF 樣本 Checklist（玉山 + 永豐）

## 目的

- 先用最小範圍完成銀行帳戶對帳單 parser 的真實樣本回歸。
- 本輪只處理：
  - 玉山（E.SUN）
  - 永豐（Sinopac）

## 樣本提供規則

- 每家銀行至少提供 2 份 PDF：
  - 1 份「可成功匯入」樣本
  - 1 份「目前失敗或邊界」樣本
- 允許遮罩個資，但不可破壞必要結構：
  - 姓名、完整帳號可遮罩
  - 日期、金額、交易描述、欄位標題需保留
- 需保留原始 PDF（不要只給截圖）。

## 最小驗收欄位

- 交易日期（date）
- 金額（amount，正負號語意正確）
- 幣別（currency）
- 交易描述（description）
- 帳戶識別線索（sub-account 或可映射資訊）

## 測試與回歸步驟

1. 以既有 parser 跑每份樣本，記錄：
   - 匯入筆數
   - skipped/fail 筆數
   - warnings/errors
2. 檢查「同月報表」聚合是否與帳單一致（抽樣核對至少 5 筆）。
3. 驗證不混入信用卡段落（銀行帳本 parser 邊界檢查）。
4. 驗證匯入 dedupe（同檔重匯不重複寫入）。
5. 若有修 parser，需補對應測試：
   - parser 單元測試
   - route/import 回歸測試

## 完成定義（DoD）

- 玉山、永豐各至少 2 份樣本完成回歸記錄。
- 匯入結果與月報抽樣核對通過。
- 測試全綠（API tests + readiness code path）。
- 變更與驗證紀錄同步寫入 `memory/04_validation_log.md`。
