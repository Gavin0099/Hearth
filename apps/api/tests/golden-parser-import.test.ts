import test from "node:test";
import assert from "node:assert/strict";
import { parseCreditCardTransactionsCsv } from "../src/lib/credit-card";
import { parseSinopacTransactionsCsv } from "../src/lib/sinopac";

const sinopacGoldenCases = [
  {
    name: "maps debit, credit, and ignored summary rows into normalized transactions",
    csv: [
      "date,amount,description,currency,type\n2026/03/12,120,,TWD,debit\nsummary,,,,\n2026/03/13,1500,,TWD,credit\n",
    ].join(""),
    expected: {
      skipped: 1,
      errors: [],
      normalized: [
        {
          account_id: "account-1",
          date: "2026-03-12",
          amount: -120,
          currency: "TWD",
          category: null,
          description: null,
          source: "sinopac_bank",
        },
        {
          account_id: "account-1",
          date: "2026-03-13",
          amount: 1500,
          currency: "TWD",
          category: null,
          description: null,
          source: "sinopac_bank",
        },
      ],
    },
  },
  {
    name: "reports invalid zero-amount rows without silently importing them",
    csv: [
      "date,amount,description,currency,type\n2026/03/15,0,,TWD,debit\n",
    ].join(""),
    expected: {
      skipped: 0,
      errors: ["line 2: amount must be a non-zero number"],
      normalized: [],
    },
  },
];

const creditCardGoldenCases = [
  {
    name: "keeps purchases negative, refunds positive, and skips payment rows",
    csv: [
      "date,amount,description,currency,type\n2026/03/20,500,,TWD,purchase\n2026/03/21,200,,TWD,refund\n2026/03/22,1000,,TWD,payment\n",
    ].join(""),
    expected: {
      skipped: 1,
      errors: [],
      normalized: [
        {
          account_id: "account-1",
          date: "2026-03-20",
          amount: -500,
          currency: "TWD",
          category: null,
          description: null,
          source: "credit_card_tw",
        },
        {
          account_id: "account-1",
          date: "2026-03-21",
          amount: 200,
          currency: "TWD",
          category: null,
          description: null,
          source: "credit_card_tw",
        },
      ],
    },
  },
  {
    name: "returns validation errors for missing dates while preserving parsable rows",
    csv: [
      "date,amount,description,currency,type\n,300,,TWD,purchase\n2026/03/23,150,,TWD,purchase\n",
    ].join(""),
    expected: {
      skipped: 0,
      errors: ["line 2: date is required"],
      normalized: [
        {
          account_id: "account-1",
          date: "2026-03-23",
          amount: -150,
          currency: "TWD",
          category: null,
          description: null,
          source: "credit_card_tw",
        },
      ],
    },
  },
];

for (const fixture of sinopacGoldenCases) {
  test(`sinopac csv golden: ${fixture.name}`, () => {
    assert.deepEqual(parseSinopacTransactionsCsv(fixture.csv, "account-1"), fixture.expected);
  });
}

for (const fixture of creditCardGoldenCases) {
  test(`credit-card csv golden: ${fixture.name}`, () => {
    assert.deepEqual(parseCreditCardTransactionsCsv(fixture.csv, "account-1"), fixture.expected);
  });
}
