import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCtbcPdfTransactions,
  parseEsunBankPdfTransactions,
  parseEsunLoanSection,
  parseEsunPdfTransactions,
  parseMegaPdfTransactions,
  parseSinopacBankPdfTransactions,
  parseSinopacInsuranceSection,
  parseSinopacPdfTransactions,
  parseTaishinPdfTransactions,
} from "@hearth/shared";

test("parseSinopacPdfTransactions handles purchases, cashback, installments, and ignores autopay", () => {
  const text = `
2026/03/28 \u672c\u671f\u6d88\u8cbb\u660e\u7d30
02/25 02/25 \u6c38\u8c50\u81ea\u6263\u5df2\u5165\u5e33\uff0c\u8b1d\u8b1d\uff01 -51,225
03/02 03/02 SPORT \u5361\u8c50\u9ede\u6298\u62b5\u56de\u994b\u91d1 -500
12/22 02/13 6-2 \u671f\uff1a\u5e33\u55ae\u5206\u671f \u5229\u606f 130 6.99%
12/26 03/02 6-2 \u671f\uff1a\u9060\u96c4\u58fd\u671f\u4fdd\u55ae 9 7 0 5,635 22,540
02/03 02/06 6808 A-\u512a\u98df\u4e00\u53e3 \u54c1\u9ebb\u8fa3\u81ed\u8c46\u8150 \u6a39\u6797\u5e97 218
02/04 02/09 6808 APPLE.COM/BILL 0800095988 IE 470
02/19 02/24 6808 A- Blizzard KR19457868 Irvine US 564
02/04 02/09 7509 \u9023\u52a0*\u9023\u52a0*Coupang -630
02/10 02/12 7509 OPENAI *CHATGPT SUBSCR OPENAI.COM US 663 02/10 USD21.000
02/10 02/12 7509 OPENAI *CHATGPT SUBSCR \u570b\u5916\u4ea4\u6613\u670d\u52d9\u8cbb 10
02/11 02/12 7509 CLAUDE.AI SUBSCRIPTION ANTHROPIC.COM US 6,302
03/02 03/02 6808 1\u6708SPORT\u5361\u57fa\u672c\u56de\u994b223\u9ede 0
`;

  assert.deepEqual(parseSinopacPdfTransactions(text), [
    {
      date: "2026-03-02",
      description: "SPORT \u5361\u8c50\u9ede\u6298\u62b5\u56de\u994b\u91d1",
      amount: 500,
      currency: "TWD",
    },
    {
      date: "2025-12-22",
      description: "6-2 \u671f\uff1a\u5e33\u55ae\u5206\u671f \u5229\u606f",
      amount: -130,
      currency: "TWD",
    },
    {
      date: "2025-12-26",
      description: "6-2 \u671f\uff1a\u9060\u96c4\u58fd\u671f\u4fdd\u55ae 9 7 0",
      amount: -5635,
      currency: "TWD",
    },
    {
      date: "2026-02-03",
      description: "A-\u512a\u98df\u4e00\u53e3 \u54c1\u9ebb\u8fa3\u81ed\u8c46\u8150 \u6a39\u6797\u5e97",
      amount: -218,
      currency: "TWD",
    },
    {
      date: "2026-02-04",
      description: "APPLE.COM/BILL 0800095988 IE",
      amount: -470,
      currency: "TWD",
    },
    {
      date: "2026-02-19",
      description: "A- Blizzard KR19457868 Irvine US",
      amount: -564,
      currency: "TWD",
    },
    {
      date: "2026-02-04",
      description: "\u9023\u52a0*\u9023\u52a0*Coupang",
      amount: 630,
      currency: "TWD",
    },
    {
      date: "2026-02-10",
      description: "OPENAI *CHATGPT SUBSCR OPENAI.COM US",
      amount: -663,
      currency: "TWD",
    },
    {
      date: "2026-02-10",
      description: "OPENAI *CHATGPT SUBSCR \u570b\u5916\u4ea4\u6613\u670d\u52d9\u8cbb",
      amount: -10,
      currency: "TWD",
    },
    {
      date: "2026-02-11",
      description: "CLAUDE.AI SUBSCRIPTION ANTHROPIC.COM US",
      amount: -6302,
      currency: "TWD",
    },
  ]);
});

test("parseSinopacPdfTransactions keeps current installment amount when statement uses spaced colon and full-width digits", () => {
  const text = `
2026/03/28 本期消費明細
12/26 03/02 2604 6- 2 期 : 遠雄續期保費９７０５ 5 635 22,540
`;

  assert.deepEqual(parseSinopacPdfTransactions(text), [
    {
      date: "2025-12-26",
      description: "6- 2 期 : 遠雄續期保費9705",
      amount: -5635,
      currency: "TWD",
    },
  ]);
});

test("parseEsunPdfTransactions limits parsing to detail sections and handles cashback plus installment rows", () => {
  const text = `
2026/03/31 \u7389\u5c71\u9280\u884c\u4fe1\u7528\u5361\u5c0d\u5e33\u55ae
\u4e0a\u671f\u61c9\u7e73\u91d1\u984d\uff1a
02/23 \u611f\u8b1d\u60a8\u7528\u7db2\u8def\u9280\u884c\u7e73\u6b3e TWD -18,366
\u672c\u671f\u8cbb\u7528\u660e\u7d30\uff1a
03/06 03/06 U Bear \u5361\u7db2\u8cfc\u52a0\u78bc 2%\u73fe\u91d1\u56de\u994b TWD -1
\u672c\u671f\u6d88\u8cbb\u660e\u7d30\uff1a
\u5361\u865f\uff1a5242-XXXX-XXXX-0722 (Unicard-\u6b63\u5361)
12/25 03/07 \u704c\u6e89\u773c\u79d1\u8a3a\u6240-\u53f0\u5317 \u520606\u671f\u4e4b\u7b2c03\u671f TWD 98,000 TWD 16,333
02/11 02/25 \u60a0\u904a\u5361\u81ea\u52d5\u52a0\u503c\u91d1\u984d\uff0d\u53f0\u5317\u6377\u904b\u5927\u576a\u6797 TWD 500
02/12 02/23 \u6a02\u8cfc\u8766\u76ae\uff0d\u65b0\u52a0\u5761\u5546\u8766\u76ae\u6578\u4f4d TWD 1,369
02/28 03/04 \u6a02\u8cfc\u8766\u76ae\uff0d s m i l e f i x TWD 259
\u5361\u865f\uff1a5589-XXXX-XXXX-2251 (U Bear\u5361-\u6b63\u5361)
02/24 03/02 \u85cd\u65b0\u2014\u65b9\u683c\u5b50 v o c u s TWD 50
\u672c\u671f\u5408\u8a08\uff1a TWD 18,510
`;

  assert.deepEqual(parseEsunPdfTransactions(text), [
    {
      date: "2026-03-06",
      description: "U Bear \u5361\u7db2\u8cfc\u52a0\u78bc 2%\u73fe\u91d1\u56de\u994b",
      amount: 1,
      currency: "TWD",
    },
    {
      date: "2025-12-25",
      description: "\u704c\u6e89\u773c\u79d1\u8a3a\u6240-\u53f0\u5317 \u520606\u671f\u4e4b\u7b2c03\u671f",
      amount: -16333,
      currency: "TWD",
    },
    {
      date: "2026-02-11",
      description: "\u60a0\u904a\u5361\u81ea\u52d5\u52a0\u503c\u91d1\u984d\uff0d\u53f0\u5317\u6377\u904b\u5927\u576a\u6797",
      amount: -500,
      currency: "TWD",
    },
    {
      date: "2026-02-12",
      description: "\u6a02\u8cfc\u8766\u76ae\uff0d\u65b0\u52a0\u5761\u5546\u8766\u76ae\u6578\u4f4d",
      amount: -1369,
      currency: "TWD",
    },
    {
      date: "2026-02-28",
      description: "\u6a02\u8cfc\u8766\u76ae\uff0d s m i l e f i x",
      amount: -259,
      currency: "TWD",
    },
    {
      date: "2026-02-24",
      description: "\u85cd\u65b0\u2014\u65b9\u683c\u5b50 v o c u s",
      amount: -50,
      currency: "TWD",
    },
  ]);
});

test("parseTaishinPdfTransactions handles ROC full-date rows with trailing country code", () => {
  const text = `
115/03/09 115/03/09 台新銀行信用卡電子帳單
消費日 入帳起息日消費明細
115/02/14 115/02/24 迪加-全家便利TAIPEI 119 TW
115/02/14 115/02/24 連加*連加*統一-超商TAIPEI 87 TW
115/02/27 115/03/03 連加*連加*統一-超商TAIPEI 198 TW
115/03/14 115/03/16 連加-全家便利TAIPEI 84 TW
`;

  assert.deepEqual(parseTaishinPdfTransactions(text), [
    {
      date: "2026-02-14",
      description: "迪加-全家便利TAIPEI",
      amount: -119,
      currency: "TWD",
    },
    {
      date: "2026-02-14",
      description: "連加*連加*統一-超商TAIPEI",
      amount: -87,
      currency: "TWD",
    },
    {
      date: "2026-02-27",
      description: "連加*連加*統一-超商TAIPEI",
      amount: -198,
      currency: "TWD",
    },
    {
      date: "2026-03-14",
      description: "連加-全家便利TAIPEI",
      amount: -84,
      currency: "TWD",
    },
  ]);
});

test("parseTaishinPdfTransactions applies previous-year heuristic for MM/DD rows in early-year statements", () => {
  const text = `
2026/02/28 台新銀行信用卡電子帳單
消費日 入帳起息日消費明細
12/27 01/02 連加*連加*統一-超商TAIPEI 198 TW
02/14 02/24 迪加-全家便利TAIPEI 119 TW
`;

  assert.deepEqual(parseTaishinPdfTransactions(text), [
    {
      date: "2025-12-27",
      description: "連加*連加*統一-超商TAIPEI",
      amount: -198,
      currency: "TWD",
    },
    {
      date: "2026-02-14",
      description: "迪加-全家便利TAIPEI",
      amount: -119,
      currency: "TWD",
    },
  ]);
});

test("parseCtbcPdfTransactions handles ROC full-date rows with amount before card suffix", () => {
  const text = `
115/01/12 台幣消費明細
消費日 入帳起息日 消費暨收費摘要表 台幣金額 卡號末四碼 消費地 幣別 消費地金額
114/12/20 114/12/23 STEAM PURCHASE 326 6155 DE TWD 326.00
114/12/20 114/12/23 國外交易手續費 5 6155
114/12/29 115/01/02 STEAM PURCHASE 141 6155 DE TWD 141.00
114/12/29 115/01/02 國外交易手續費 2 6155
115/01/03 115/01/06 STEAM PURCHASE -113 6155 DE TWD -113.00
115/01/03 115/01/06 STEAM PURCHASE -132 6155 DE TWD -132.00
115/01/03 115/01/05 STEAMGAMES.COM 4259522 209 6155 US TWD 209.00
115/01/04 115/01/05 國外交易手續費 3 6155
115/01/04 115/01/06 STEAMGAMES.COM 4259522 119 6155 US TWD 119.00
115/01/04 115/01/06 國外交易手續費 2 6155
115/01/09 115/01/12 統一-超商-央和 297 6155 TW
`;

  assert.deepEqual(parseCtbcPdfTransactions(text), [
    {
      date: "2025-12-20",
      description: "STEAM PURCHASE",
      amount: -326,
      currency: "TWD",
    },
    {
      date: "2025-12-20",
      description: "國外交易手續費",
      amount: -5,
      currency: "TWD",
    },
    {
      date: "2025-12-29",
      description: "STEAM PURCHASE",
      amount: -141,
      currency: "TWD",
    },
    {
      date: "2025-12-29",
      description: "國外交易手續費",
      amount: -2,
      currency: "TWD",
    },
    {
      date: "2026-01-03",
      description: "STEAM PURCHASE",
      amount: 113,
      currency: "TWD",
    },
    {
      date: "2026-01-03",
      description: "STEAM PURCHASE",
      amount: 132,
      currency: "TWD",
    },
    {
      date: "2026-01-03",
      description: "STEAMGAMES.COM 4259522",
      amount: -209,
      currency: "TWD",
    },
    {
      date: "2026-01-04",
      description: "國外交易手續費",
      amount: -3,
      currency: "TWD",
    },
    {
      date: "2026-01-04",
      description: "STEAMGAMES.COM 4259522",
      amount: -119,
      currency: "TWD",
    },
    {
      date: "2026-01-04",
      description: "國外交易手續費",
      amount: -2,
      currency: "TWD",
    },
    {
      date: "2026-01-09",
      description: "統一-超商-央和",
      amount: -297,
      currency: "TWD",
    },
  ]);
});

test("parseCtbcPdfTransactions applies previous-year heuristic for MM/DD rows in early-year statements", () => {
  const text = `
2026/02/12 台幣消費明細
消費日 入帳起息日 消費暨收費摘要表 台幣金額 卡號末四碼 消費地 幣別 消費地金額
12/20 12/23 STEAM PURCHASE 326 6155 DE TWD 326.00
02/09 02/12 統一-超商-央和 297 6155 TW
`;

  assert.deepEqual(parseCtbcPdfTransactions(text), [
    {
      date: "2025-12-20",
      description: "STEAM PURCHASE",
      amount: -326,
      currency: "TWD",
    },
    {
      date: "2026-02-09",
      description: "統一-超商-央和",
      amount: -297,
      currency: "TWD",
    },
  ]);
});

test("parseCtbcPdfTransactions falls back to full-text scan when rows are not separated by newlines", () => {
  const text = `
115 01 12 台幣消費明細
114 12 20 114 12 23 STEAM PURCHASE 326 6155 DE TWD 326.00 114 12 20 114 12 23 國外交易手續費 5 6155 115 01 09 115 01 12 統一-超商-央和 297 6155 TW
`;

  assert.deepEqual(parseCtbcPdfTransactions(text), [
    {
      date: "2025-12-20",
      description: "STEAM PURCHASE",
      amount: -326,
      currency: "TWD",
    },
    {
      date: "2025-12-20",
      description: "國外交易手續費",
      amount: -5,
      currency: "TWD",
    },
    {
      date: "2026-01-09",
      description: "統一-超商-央和",
      amount: -297,
      currency: "TWD",
    },
  ]);
});

test("parseMegaPdfTransactions handles full ROC year dates with fullwidth description on same line", () => {
  const text = `
115/03/12 $180,000 $18,000／$72,000
台 幣 495.00 - 495.00 + 0.00 + 495.00 = 495.00 495.00 115/03/27
115/03/04已繳款金額-全國繳稅費平台 -495.00
5241-70XX-XXXX-8677 本期交易明細
115/03/10 115/03/12 Ｇｏｇｏｒｏ Ｎｅｔｗｏｒｋ TAOYUAN TWD 499.00 499.00
115/03/12 Gogoro電池資費回饋 TWD -4.00 -4.00
`;

  assert.deepEqual(parseMegaPdfTransactions(text), [
    {
      date: "2026-03-10",
      description: "Ｇｏｇｏｒｏ Ｎｅｔｗｏｒｋ TAOYUAN",
      amount: -499,
      currency: "TWD",
    },
    {
      date: "2026-03-12",
      description: "Gogoro電池資費回饋",
      amount: 4,
      currency: "TWD",
    },
  ]);
});

test("parseMegaPdfTransactions handles description on adjacent line (date+amount row without description)", () => {
  // In some Mega PDFs the description occupies a different y-bucket than the date/amount row
  const text = `
5241-70XX-XXXX-8677 本期交易明細
Ｇｏｇｏｒｏ Ｎｅｔｗｏｒｋ TAOYUAN
115/03/10 115/03/12 TWD 499.00 499.00
Gogoro電池資費回饋
115/03/12 TWD -4.00 -4.00
`;

  assert.deepEqual(parseMegaPdfTransactions(text), [
    {
      date: "2026-03-10",
      description: "Ｇｏｇｏｒｏ Ｎｅｔｗｏｒｋ TAOYUAN",
      amount: -499,
      currency: "TWD",
    },
    {
      date: "2026-03-12",
      description: "Gogoro電池資費回饋",
      amount: 4,
      currency: "TWD",
    },
  ]);
});

test("parseCtbcPdfTransactions recovers transaction rows from noisy token stream with cover-page summary fragments", () => {
  const text = `
115/04 7.7
:0800-024365 02-2745-8080
115/04/01 300,000
115/04
59 115/05/12 7-ELEVEN ATM (02)2171-1130 (
115/04/03 115/04/05 OPENAI *CHATGPT SUBSCR 660 6155 US TWD 21.00
0800-899-399
115/04/09 115/04/10 國外交易手續費 10 6155
`;

  assert.deepEqual(parseCtbcPdfTransactions(text), [
    {
      date: "2026-04-03",
      description: "OPENAI *CHATGPT SUBSCR",
      amount: -660,
      currency: "TWD",
    },
    {
      date: "2026-04-09",
      description: "國外交易手續費",
      amount: -10,
      currency: "TWD",
    },
  ]);
});

test("parseEsunBankPdfTransactions handles ROC-date account statement rows", () => {
  const text = `
存款 資料日期:2026/02/28
115/02/05 ＡＴＭ跨行轉 20,000.00 永*銀行 807 0000700400***005 20,747.00
115/02/07 薪資轉帳 35,000.00 公司薪資 55,747.00
`;

  assert.deepEqual(parseEsunBankPdfTransactions(text), [
    {
      date: "2026-02-05",
      description: "ＡＴＭ跨行轉 永*銀行",
      amount: -20000,
      currency: "TWD",
    },
    {
      date: "2026-02-07",
      description: "薪資轉帳 公司薪資",
      amount: 35000,
      currency: "TWD",
    },
  ]);
});

test("parseSinopacBankPdfTransactions ignores credit-card detail sections in mixed statements", () => {
  const text = `
永豐銀行綜合對帳單
007-00*-**27100-*
期初餘額 50,000.00
2026/02/05 ＡＴＭ跨行轉 20,000.00 30,000.00 永*銀行
2026/02/07 薪資轉帳 35,000.00 65,000.00 公司薪資
本期消費明細
02/10 02/12 OPENAI *CHATGPT SUBSCR 663
02/11 02/12 CLAUDE.AI SUBSCRIPTION 6,302
貸款
`;

  assert.deepEqual(parseSinopacBankPdfTransactions(text), [
    {
      date: "2026-02-05",
      description: "ＡＴＭ跨行轉 永*銀行",
      amount: -20000,
      currency: "TWD",
      subAccount: "27100",
    },
    {
      date: "2026-02-07",
      description: "薪資轉帳 公司薪資",
      amount: 35000,
      currency: "TWD",
      subAccount: "27100",
    },
  ]);
});

test("parseEsunBankPdfTransactions ignores credit-card detail sections in mixed statements", () => {
  const text = `
存款 資料日期:2026/02/28
115/02/05 ＡＴＭ跨行轉 20,000.00 永*銀行 807 0000700400***005 20,747.00
115/02/07 薪資轉帳 35,000.00 公司薪資 55,747.00
本期消費明細：
02/12 02/23 樂購蝦皮－新加坡商蝦皮數位 TWD 1,369
02/28 03/04 樂購蝦皮－ s m i l e f i x TWD 259
貸款 資料日期:2026/02/26
`;

  assert.deepEqual(parseEsunBankPdfTransactions(text), [
    {
      date: "2026-02-05",
      description: "ＡＴＭ跨行轉 永*銀行",
      amount: -20000,
      currency: "TWD",
    },
    {
      date: "2026-02-07",
      description: "薪資轉帳 公司薪資",
      amount: 35000,
      currency: "TWD",
    },
  ]);
});

test("parseEsunLoanSection extracts masked loan accounts and balances", () => {
  const text = `
貸款
資料日期:2026/02/26
個人擔保貸款 0484165***406 TWD 9,600,000.00
個人擔保貸款 0484165***417 TWD 543,524.00
說明：
`;

  assert.deepEqual(parseEsunLoanSection(text), [
    {
      accountNo: "0484165***406",
      paymentDate: "2026-02-26",
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: 9600000,
    },
    {
      accountNo: "0484165***417",
      paymentDate: "2026-02-26",
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: 543524,
    },
  ]);
});

test("parseEsunLoanSection handles inline data-date header and spaced masked account", () => {
  const text = `
貸款 資料日期:2026/02/26
個人擔保貸款 0 4 8 4 1 6 5 * * * 4 0 6 TWD 9,600,000.00
說明：
`;

  assert.deepEqual(parseEsunLoanSection(text), [
    {
      accountNo: "0484165***406",
      paymentDate: "2026-02-26",
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: 9600000,
    },
  ]);
});

test("parseEsunLoanSection falls back to full-text scan when loan header is fragmented", () => {
  const text = `
◎玉山客服中心專線：(02)2182-1313
存款 資料日期:2026/02/28
貸 款 資料日期:2026/02/26
個人擔保貸款 0484165***406 TWD 9,600,000.00
個人擔保貸款 0484165***417 TWD 543,524.00
`;

  assert.deepEqual(parseEsunLoanSection(text), [
    {
      accountNo: "0484165***406",
      paymentDate: "2026-02-26",
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: 9600000,
    },
    {
      accountNo: "0484165***417",
      paymentDate: "2026-02-26",
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: 543524,
    },
  ]);
});

test("parseEsunLoanSection handles ROC data-date and integer balances", () => {
  const text = `
貸款 資料日期:115/02/25
個人擔保貸款 0484165***406 TWD 2,327,230
`;

  assert.deepEqual(parseEsunLoanSection(text), [
    {
      accountNo: "0484165***406",
      paymentDate: "2026-02-25",
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: 2327230,
    },
  ]);
});

test("parseEsunLoanSection ignores deposit snapshot rows in mixed asset summaries", () => {
  const text = `
存款 資料日期:2026/02/28
臺幣活存 0266968***009 TWD 1,862.00
貸款 資料日期:2026/02/26
個人擔保貸款 0484165***406 TWD 9,600,000.00
個人擔保貸款 0484165***417 TWD 543,524.00
`;

  assert.deepEqual(parseEsunLoanSection(text), [
    {
      accountNo: "0484165***406",
      paymentDate: "2026-02-26",
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: 9600000,
    },
    {
      accountNo: "0484165***417",
      paymentDate: "2026-02-26",
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: 543524,
    },
  ]);
});

test("parseSinopacInsuranceSection handles inline insurance header and policy rows", () => {
  const text = `
永豐銀行綜合對帳單
保險 非投資型
P12****77401 非投資型
富邦人壽
安心醫療健康保險
P122****74
2009/05/27 2094/05/26 TWD 2,000 20年/年繳 23,859 2030/05/27 418,433
貸款
`;

  assert.deepEqual(parseSinopacInsuranceSection(text), [
    {
      insuranceType: "non-investment",
      policyNo: "P12****77401",
      company: "富邦人壽",
      productName: "安心醫療健康保險",
      insuredPerson: "P122****74",
      startDate: "2009-05-27",
      endDate: "2094-05-26",
      currency: "TWD",
      coverage: 2000,
      nextPremium: 23859,
      paymentPeriod: "20年/年繳",
      accumulatedPremium: 418433,
      nextPaymentDate: "2030-05-27",
    },
  ]);
});
