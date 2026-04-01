import { parseCsv } from "./csv";

export type DividendImportRow = {
  account_id: string;
  ticker: string;
  pay_date: string;
  net_amount: number;
  gross_amount: number | null;
  tax_withheld: number;
  currency: string;
  source_hash: string;
};

export type ParseDividendsCsvResult = {
  rows: DividendImportRow[];
  errors: string[];
};

function buildDividendSourceHash(accountId: string, ticker: string, payDate: string, netAmount: number) {
  const hashKey = `dividends|${accountId}|${ticker}|${payDate}|${netAmount}`;
  return btoa(unescape(encodeURIComponent(hashKey))).replace(/=/g, "").slice(0, 64);
}

export function parseDividendsCsv(csvText: string, accountId: string): ParseDividendsCsvResult {
  const rows = parseCsv(csvText);
  const errors: string[] = [];
  const dividendRows: DividendImportRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;

    const ticker = (row["ticker"] ?? row["?∠巨隞??"] ?? row["隞??"] ?? "").trim().toUpperCase();
    const payDate = (row["pay_date"] ?? row["???"] ?? row["?潭??"] ?? "").trim();
    const netAmountRaw = (row["net_amount"] ?? row["撖阡??亙董"] ?? row["瘛券?"] ?? "").replace(/,/g, "");
    const grossAmountRaw = (row["gross_amount"] ?? row["?蝮賡?"] ?? row["瘥?"] ?? "").replace(/,/g, "");
    const taxRaw = (row["tax_withheld"] ?? row["??像蝔?"] ?? row["蝔?"] ?? "0").replace(/,/g, "");
    const currency = (row["currency"] ?? row["撟?"] ?? "TWD").trim();

    if (!ticker) {
      errors.push(`line ${line}: missing ticker`);
      continue;
    }

    if (!payDate || !/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
      errors.push(`line ${line}: invalid pay_date "${payDate}"`);
      continue;
    }

    const net_amount = parseFloat(netAmountRaw);
    if (Number.isNaN(net_amount) || net_amount < 0) {
      errors.push(`line ${line}: invalid net_amount "${netAmountRaw}"`);
      continue;
    }

    const gross_amount = grossAmountRaw ? parseFloat(grossAmountRaw) : null;
    const tax_withheld = parseFloat(taxRaw) || 0;

    dividendRows.push({
      account_id: accountId,
      ticker,
      pay_date: payDate,
      net_amount,
      gross_amount,
      tax_withheld,
      currency,
      source_hash: buildDividendSourceHash(accountId, ticker, payDate, net_amount),
    });
  }

  return {
    rows: dividendRows,
    errors,
  };
}
