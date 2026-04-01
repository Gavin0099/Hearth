import test from "node:test";
import assert from "node:assert/strict";
import { parseDividendsCsv, prepareDividendImportBatch } from "../src/lib/dividends";
import { rebuildHoldingFromTrades } from "../src/lib/holdings";
import { parseSinopacStockCsv } from "../src/lib/sinopac-stock";

test("dividends csv golden: normalizes valid rows and builds stable source hashes", () => {
  const result = parseDividendsCsv(
    [
      "ticker,pay_date,net_amount,gross_amount,tax_withheld,currency",
      "0056,2026-03-15,1080,1200,120,TWD",
      "voo,2026-03-20,25.5,30,4.5,USD",
    ].join("\n"),
    "account-1",
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.rows.map((row) => ({
      account_id: row.account_id,
      ticker: row.ticker,
      pay_date: row.pay_date,
      net_amount: row.net_amount,
      gross_amount: row.gross_amount,
      tax_withheld: row.tax_withheld,
      currency: row.currency,
      source_hash: row.source_hash,
    })),
    [
      {
        account_id: "account-1",
        ticker: "0056",
        pay_date: "2026-03-15",
        net_amount: 1080,
        gross_amount: 1200,
        tax_withheld: 120,
        currency: "TWD",
        source_hash: result.rows[0]?.source_hash,
      },
      {
        account_id: "account-1",
        ticker: "VOO",
        pay_date: "2026-03-20",
        net_amount: 25.5,
        gross_amount: 30,
        tax_withheld: 4.5,
        currency: "USD",
        source_hash: result.rows[1]?.source_hash,
      },
    ],
  );
  assert.notEqual(result.rows[0]?.source_hash, result.rows[1]?.source_hash);
});

test("dividends csv golden: preserves row-level validation errors while keeping valid rows", () => {
  const result = parseDividendsCsv(
    [
      "ticker,pay_date,net_amount,gross_amount,tax_withheld,currency",
      ",2026-03-15,1080,1200,120,TWD",
      "0056,2026/03/15,1080,1200,120,TWD",
      "00919,2026-03-20,900,900,0,TWD",
    ].join("\n"),
    "account-1",
  );

  assert.deepEqual(result.errors, [
    "line 2: missing ticker",
    "line 3: invalid pay_date \"2026/03/15\"",
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.ticker, "00919");
  assert.equal(result.rows[0]?.net_amount, 900);
});

test("dividend import batch golden: removes payload duplicates and existing hashes", () => {
  const parsed = parseDividendsCsv(
    [
      "ticker,pay_date,net_amount,gross_amount,tax_withheld,currency",
      "0056,2026-03-15,1080,1200,120,TWD",
      "0056,2026-03-15,1080,1200,120,TWD",
      "00919,2026-03-20,900,900,0,TWD",
    ].join("\n"),
    "account-1",
  );

  const result = prepareDividendImportBatch(parsed.rows, [parsed.rows[0]!.source_hash]);

  assert.equal(result.freshRows.length, 1);
  assert.equal(result.freshRows[0]?.ticker, "00919");
  assert.equal(result.skipped, 2);
});

test("dividend import batch golden: keeps all unique rows when no existing hashes match", () => {
  const parsed = parseDividendsCsv(
    [
      "ticker,pay_date,net_amount,gross_amount,tax_withheld,currency",
      "0056,2026-03-15,1080,1200,120,TWD",
      "00919,2026-03-20,900,900,0,TWD",
    ].join("\n"),
    "account-1",
  );

  const result = prepareDividendImportBatch(parsed.rows, []);

  assert.equal(result.freshRows.length, 2);
  assert.equal(result.skipped, 0);
});

test("sinopac stock csv golden: normalizes roc dates, actions, and currencies", () => {
  const result = parseSinopacStockCsv(
    [
      "date,ticker,name,action,shares,price,fee,tax,currency",
      "1130103,2330,TSMC,buy,2,610,1,0,TWD",
      "2026-03-28,VOO,Vanguard S&P 500 ETF,sell,3,25.5,1,0,USD",
    ].join("\n"),
    "account-stock",
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.trades.map((trade) => ({
      account_id: trade.account_id,
      trade_date: trade.trade_date,
      ticker: trade.ticker,
      name: trade.name,
      action: trade.action,
      shares: trade.shares,
      price_per_share: trade.price_per_share,
      fee: trade.fee,
      tax: trade.tax,
      currency: trade.currency,
      source: trade.source,
      source_hash: trade.source_hash,
    })),
    [
      {
        account_id: "account-stock",
        trade_date: "2024-01-03",
        ticker: "2330",
        name: "TSMC",
        action: "buy",
        shares: 2,
        price_per_share: 610,
        fee: 1,
        tax: 0,
        currency: "TWD",
        source: "sinopac-stock",
        source_hash: result.trades[0]?.source_hash,
      },
      {
        account_id: "account-stock",
        trade_date: "2026-03-28",
        ticker: "VOO",
        name: "Vanguard S&P 500 ETF",
        action: "sell",
        shares: 3,
        price_per_share: 25.5,
        fee: 1,
        tax: 0,
        currency: "USD",
        source: "sinopac-stock",
        source_hash: result.trades[1]?.source_hash,
      },
    ],
  );
});

test("sinopac stock csv golden: keeps parsing valid rows while surfacing invalid ones", () => {
  const result = parseSinopacStockCsv(
    [
      "date,ticker,name,action,shares,price,fee,tax,currency",
      "bad-date,2330,TSMC,buy,2,610,1,0,TWD",
      "2026-03-28,,VOO,buy,3,25.5,1,0,USD",
      "2026-03-29,QQQ,Invesco QQQ,buy,5,420,1,0,USD",
    ].join("\n"),
    "account-stock",
  );

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0]?.ticker, "QQQ");
  assert.equal(result.errors.length, 2);
});

test("holding rebuild golden: buy trades produce weighted average cost", () => {
  const result = rebuildHoldingFromTrades([
    { action: "buy", shares: 2, price_per_share: 600, name: "TSMC", currency: "TWD" },
    { action: "buy", shares: 3, price_per_share: 650, name: "TSMC", currency: "TWD" },
  ]);

  assert.deepEqual(result, {
    name: "TSMC",
    total_shares: 5,
    avg_cost: 630,
    currency: "TWD",
  });
});

test("holding rebuild golden: sell trades reduce shares without changing average cost", () => {
  const result = rebuildHoldingFromTrades([
    { action: "buy", shares: 4, price_per_share: 100, name: "VOO", currency: "USD" },
    { action: "buy", shares: 2, price_per_share: 130, name: "VOO", currency: "USD" },
    { action: "sell", shares: 3, price_per_share: 150, name: "VOO", currency: "USD" },
  ]);

  assert.deepEqual(result, {
    name: "VOO",
    total_shares: 3,
    avg_cost: 110,
    currency: "USD",
  });
});

test("holding rebuild golden: fully sold positions collapse to null", () => {
  const result = rebuildHoldingFromTrades([
    { action: "buy", shares: 1, price_per_share: 420, name: "QQQ", currency: "USD" },
    { action: "sell", shares: 1, price_per_share: 430, name: "QQQ", currency: "USD" },
  ]);

  assert.equal(result, null);
});
