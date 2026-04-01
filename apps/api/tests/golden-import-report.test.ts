import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import type { TransactionRecord } from "@hearth/shared";
import { parseMonthlyExcel } from "../src/lib/excel-monthly";
import { summarizeTransactions } from "../src/routes/report";

function createWorkbookBuffer(
  sheets: Array<{
    name: string;
    rows: unknown[][];
    merges?: string[];
  }>,
) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows, merges }) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    if (merges?.length) {
      worksheet["!merges"] = merges.map((range) => XLSX.utils.decode_range(range));
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }).buffer as ArrayBuffer;
}

const monthlyReportGoldenCases: Array<{
  name: string;
  transactions: TransactionRecord[];
  expected: ReturnType<typeof summarizeTransactions>;
}> = [
  {
    name: "aggregates mixed income and expense with uncategorized fallback",
    transactions: [
      {
        id: "txn-1",
        account_id: "account-1",
        date: "2026-03-01",
        amount: -120,
        currency: "TWD",
        category: "Food",
        description: "Lunch",
        source: "manual",
        source_hash: null,
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        id: "txn-2",
        account_id: "account-1",
        date: "2026-03-01",
        amount: 3000,
        currency: "TWD",
        category: "Salary",
        description: "Payday",
        source: "manual",
        source_hash: null,
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        id: "txn-3",
        account_id: "account-2",
        date: "2026-03-02",
        amount: -80,
        currency: "TWD",
        category: " ",
        description: "Bus",
        source: "manual",
        source_hash: null,
        created_at: "2026-03-02T00:00:00Z",
      },
    ],
    expected: {
      income: 3000,
      expense: 200,
      transactionCount: 3,
      categories: [
        { category: "Food", amount: 120 },
        { category: "未分類", amount: 80 },
      ],
      dailySeries: [
        { date: "2026-03-01", income: 3000, expense: 120 },
        { date: "2026-03-02", income: 0, expense: 80 },
      ],
    },
  },
  {
    name: "sorts categories by absolute expense and combines same-day multi-account totals",
    transactions: [
      {
        id: "txn-4",
        account_id: "account-1",
        date: "2026-03-05",
        amount: -50,
        currency: "TWD",
        category: "Transport",
        description: "Metro",
        source: "manual",
        source_hash: null,
        created_at: "2026-03-05T00:00:00Z",
      },
      {
        id: "txn-5",
        account_id: "account-2",
        date: "2026-03-05",
        amount: -250,
        currency: "TWD",
        category: "Food",
        description: "Dinner",
        source: "manual",
        source_hash: null,
        created_at: "2026-03-05T00:00:00Z",
      },
      {
        id: "txn-6",
        account_id: "account-2",
        date: "2026-03-06",
        amount: 100,
        currency: "TWD",
        category: "Refund",
        description: "Refund",
        source: "manual",
        source_hash: null,
        created_at: "2026-03-06T00:00:00Z",
      },
    ],
    expected: {
      income: 100,
      expense: 300,
      transactionCount: 3,
      categories: [
        { category: "Food", amount: 250 },
        { category: "Transport", amount: 50 },
      ],
      dailySeries: [
        { date: "2026-03-05", income: 0, expense: 300 },
        { date: "2026-03-06", income: 100, expense: 0 },
      ],
    },
  },
];

const excelMonthlyGoldenCases: Array<{
  name: string;
  buildBuffer: () => ArrayBuffer;
  expected: {
    normalizedCount: number;
    skipped: number;
    errors: string[];
    warnings: string[];
    recurringCandidates: Array<{ sheet: string; kind: string; section: string; label: string | null }>;
    firstRows: Array<{ date: string; amount: number; category: string | null; description: string | null }>;
  };
}> = [
  {
    name: "grid layout preserves recurring sidebar warnings and imports day columns",
    buildBuffer: () =>
      createWorkbookBuffer([
        {
          name: "2026-03",
          rows: [
            ["category", "description", "2026/03/01", "2026/03/02"],
            ["擗ㄡ", "Lunch", 120, ""],
            ["鈭日?", "Metro", "", 45],
            ["?箏??臬", "", "", ""],
            ["?箏??臬", "?輻?", "", ""],
          ],
        },
      ]),
    expected: {
      normalizedCount: 2,
      skipped: 2,
      errors: [],
      warnings: [],
      recurringCandidates: [],
      firstRows: [
        { date: "2026-03-01", amount: -120, category: "擗ㄡ", description: "Lunch" },
        { date: "2026-03-02", amount: -45, category: "鈭日?", description: "Metro" },
      ],
    },
  },
  {
    name: "pair-column layout infers date from sheet name and expands merged headers",
    buildBuffer: () =>
      createWorkbookBuffer([
        {
          name: "2026-04",
          rows: [
            ["", "", "1", "", "2", ""],
            ["", "", "item", "amount", "item", "amount"],
            ["擗ㄡ", "", "早餐", 60, "午餐", 120],
            ["?望??臬", "", "", "", "", ""],
            ["?望??臬", "?輻?", "", "", "", ""],
          ],
          merges: ["A3:B3", "A4:B4"],
        },
      ]),
    expected: {
      normalizedCount: 2,
      skipped: 2,
      errors: [],
      warnings: [],
      recurringCandidates: [],
      firstRows: [
        { date: "2026-04-01", amount: -60, category: "其他", description: "早餐" },
        { date: "2026-04-02", amount: -120, category: "其他", description: "午餐" },
      ],
    },
  },
];

for (const fixture of monthlyReportGoldenCases) {
  test(`monthly report golden: ${fixture.name}`, () => {
    assert.deepEqual(summarizeTransactions(fixture.transactions), fixture.expected);
  });
}

for (const fixture of excelMonthlyGoldenCases) {
  test(`excel-monthly golden: ${fixture.name}`, () => {
    const result = parseMonthlyExcel(fixture.buildBuffer(), "account-1");

    assert.equal(result.normalized.length, fixture.expected.normalizedCount);
    assert.equal(result.skipped, fixture.expected.skipped);
    assert.deepEqual(result.errors, fixture.expected.errors);
    assert.deepEqual(result.warnings ?? [], fixture.expected.warnings);
    assert.deepEqual(result.recurringCandidates ?? [], fixture.expected.recurringCandidates);
    assert.deepEqual(
      result.normalized.slice(0, fixture.expected.firstRows.length).map((row) => ({
        date: row.date,
        amount: row.amount,
        category: row.category,
        description: row.description,
      })),
      fixture.expected.firstRows,
    );
  });
}
