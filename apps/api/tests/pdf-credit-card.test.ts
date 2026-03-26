import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEsunPdfTransactions,
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
      date: "2026-12-22",
      description: "6-2 \u671f\uff1a\u5e33\u55ae\u5206\u671f \u5229\u606f",
      amount: -130,
      currency: "TWD",
    },
    {
      date: "2026-12-26",
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
      date: "2026-12-26",
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
      date: "2026-12-25",
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
