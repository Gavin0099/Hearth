import { parseCsv } from "./csv";

export type StockTradeInput = {
  account_id: string;
  trade_date: string; // YYYY-MM-DD
  ticker: string;
  name: string | null;
  action: "buy" | "sell";
  shares: number;
  price_per_share: number;
  fee: number;
  tax: number;
  currency: string;
  source: string;
  source_hash: string;
};

type RawRow = Record<string, string>;

// Column aliases for 永豐 and common TW brokerage formats
const dateAliases = ["成交日期", "交易日期", "date"];
const tickerAliases = ["股票代號", "代號", "ticker"];
const nameAliases = ["股票名稱", "名稱", "name"];
const actionAliases = ["買賣別", "買賣", "方向", "action"];
const sharesAliases = ["成交股數", "股數", "shares"];
const priceAliases = ["成交單價", "單價", "成交均價", "price"];
const feeAliases = ["手續費", "fee"];
const taxAliases = ["交易稅", "證交稅", "tax"];
const currencyAliases = ["幣別", "currency"];

function get(row: RawRow, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

/**
 * Convert ROC date (112/01/03 or 1120103) to ISO date (2023-01-03).
 * Also accepts ISO dates directly.
 */
function parseTradeDate(raw: string): string | null {
  const s = raw.trim().replace(/\//g, "-");

  // ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  // ROC with slashes: 112-01-03 (after replace)
  const rocSlash = s.match(/^(\d{3})-(\d{2})-(\d{2})$/);
  if (rocSlash) {
    const year = parseInt(rocSlash[1]) + 1911;
    return `${year}-${rocSlash[2]}-${rocSlash[3]}`;
  }

  // ROC compact: 1120103
  const rocCompact = raw.trim().match(/^(\d{3})(\d{2})(\d{2})$/);
  if (rocCompact) {
    const year = parseInt(rocCompact[1]) + 1911;
    return `${year}-${rocCompact[2]}-${rocCompact[3]}`;
  }

  return null;
}

function parseAction(raw: string): "buy" | "sell" | null {
  const s = raw.trim().toLowerCase();
  if (s.includes("買") || s === "buy" || s === "b") return "buy";
  if (s.includes("賣") || s === "sell" || s === "s") return "sell";
  return null;
}

function parseNumber(raw: string): number {
  // Remove commas and spaces, parse float
  return parseFloat(raw.replace(/,/g, "").replace(/\s/g, "")) || 0;
}

function buildSourceHash(row: {
  account_id: string;
  trade_date: string;
  ticker: string;
  action: string;
  shares: number;
  price_per_share: number;
}): string {
  const key = `sinopac-stock|${row.account_id}|${row.trade_date}|${row.ticker}|${row.action}|${row.shares}|${row.price_per_share}`;
  // Simple hash: base64url of the key (no crypto needed, just dedup)
  return btoa(unescape(encodeURIComponent(key))).replace(/=/g, "").slice(0, 64);
}

export type ParseStockTradesResult = {
  trades: StockTradeInput[];
  errors: string[];
};

export function parseSinopacStockCsv(
  csvText: string,
  accountId: string,
): ParseStockTradesResult {
  const rows = parseCsv(csvText);
  const trades: StockTradeInput[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const line = index + 2;

    const rawDate = get(row, dateAliases);
    const rawTicker = get(row, tickerAliases);
    const rawName = get(row, nameAliases);
    const rawAction = get(row, actionAliases);
    const rawShares = get(row, sharesAliases);
    const rawPrice = get(row, priceAliases);
    const rawFee = get(row, feeAliases);
    const rawTax = get(row, taxAliases);
    const rawCurrency = get(row, currencyAliases);

    const trade_date = parseTradeDate(rawDate);
    if (!trade_date) {
      errors.push(`line ${line}: 無效日期 "${rawDate}"`);
      return;
    }

    const ticker = rawTicker.toUpperCase();
    if (!ticker) {
      errors.push(`line ${line}: 缺少股票代號`);
      return;
    }

    const action = parseAction(rawAction);
    if (!action) {
      errors.push(`line ${line}: 無法辨識買賣別 "${rawAction}"`);
      return;
    }

    const shares = parseNumber(rawShares);
    if (shares <= 0) {
      errors.push(`line ${line}: 無效股數 "${rawShares}"`);
      return;
    }

    const price_per_share = parseNumber(rawPrice);
    if (price_per_share <= 0) {
      errors.push(`line ${line}: 無效成交單價 "${rawPrice}"`);
      return;
    }

    const fee = parseNumber(rawFee);
    const tax = parseNumber(rawTax);
    const currency = rawCurrency || "TWD";
    const name = rawName || null;

    const trade: Omit<StockTradeInput, "source_hash"> = {
      account_id: accountId,
      trade_date,
      ticker,
      name,
      action,
      shares,
      price_per_share,
      fee,
      tax,
      currency,
      source: "sinopac-stock",
    };

    trades.push({
      ...trade,
      source_hash: buildSourceHash(trade),
    });
  });

  return { trades, errors };
}
