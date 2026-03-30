export type ParsedPdfTransaction = {
  date: string;
  description: string;
  amount: number;
  currency: string;
  /** 子帳號末碼，用於多子帳戶對帳單（如永豐綜合對帳單） */
  subAccount?: string;
};

const supportedCurrencies = ["TWD", "NTD", "USD", "JPY"] as const;

const genericPositiveMarkers = [
  "\u9000\u6b3e",
  "\u9000\u8cbb",
  "\u9000\u8ca8",
  "\u56de\u994b",
  "\u6298\u62b5",
  "\u73fe\u91d1\u56de\u994b",
  "refund",
  "reversal",
  "credit",
];

const genericIgnoredMarkers = [
  "\u672c\u671f\u61c9\u7e73\u7e3d\u91d1\u984d",
  "\u6700\u4f4e\u61c9\u7e73\u91d1\u984d",
  "\u4fe1\u7528\u984d\u5ea6",
  "\u5faa\u74b0\u5229\u606f",
  "\u524d\u671f\u9918\u984d",
  "\u672c\u671f\u65b0\u589e\u6b3e\u9805",
  "\u672c\u671f\u5e33\u55ae\u91d1\u984d",
  "\u7e73\u6b3e\u622a\u6b62\u65e5",
  "\u672c\u671f\u5408\u8a08",
  "payment",
];

const sinopacIgnoredMarkers = [
  "\u6c38\u8c50\u81ea\u6263\u5df2\u5165\u5e33",
  "\u8b1d\u8b1d",
];

const esunIgnoredMarkers = [
  "\u611f\u8b1d\u60a8\u7528\u7db2\u8def\u9280\u884c\u7e73\u6b3e",
  "\u5361\u865f\uff1a",
  "\u672a\u5230\u671f\u91d1\u984d",
  "\u4e0a\u671f\u61c9\u7e73\u91d1\u984d",
  "\u672c\u671f\u61c9\u7e73\u7e3d\u91d1\u984d",
];

// 國泰 (Cathay)
const cathayIgnoredMarkers = [
  "\u5361\u865f\uff1a",              // 卡號：
  "\u5361\u865f:",                   // 卡號:
  "\u4e0a\u671f\u61c9\u7e73",        // 上期應繳
  "\u672c\u671f\u5e33\u55ae\u7d50\u7b97", // 本期帳單結算
  "\u7e73\u6b3e\u622a\u6b62",        // 繳款截止
  "\u5408\u8a08\u6b3e\u9805",        // 合計款項
  "\u4fe1\u7528\u984d\u5ea6",        // 信用額度
  "\u524d\u671f\u9918\u984d",        // 前期餘額
  "\u7e73\u6b3e\u5c0f\u8a08",        // 繳款小計
  "\u6b63\u5361\u672c\u671f\u6d88\u8cbb", // 正卡本期消費
];

// 台新 (Taishin) — dual-date rows, no card-last-4
const taishinIgnoredMarkers = [
  "\u4e0a\u671f\u9918\u984d",
  "\u4e0a\u671f\u5e33\u55ae\u9918\u984d",
  "\u7e73\u6b3e\u91d1\u984d",
  "\u81ea\u52d5\u6263\u6b3e",
  "\u5206\u671f\u672a\u5230\u671f\u603b\u91d1",
  "\u5206\u671f\u672a\u5230\u671f\u7e3d\u91d1",
];

// 中信 (CTBC) — sinopac-like with optional last-4
const ctbcIgnoredMarkers = [
  "\u81ea\u52d5\u6263\u6b3e\u5df2\u5165\u5e33",
  "\u7e73\u6b3e\u91d1\u984d",
  "\u4e0a\u671f\u9918\u984d",
];

function normalizeFullWidthDigits(text: string) {
  return text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\u3000/g, " ")
    .replace(/／/g, "/")
    .replace(/．/g, ".")
    .replace(/，/g, ",")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/(?<![\d/,])((?:20\d{2}|1\d{2}))\s*[\/ ]\s*(\d{1,2})\s*[\/ ]\s*(\d{1,2})(?![\d/,])/g, "$1/$2/$3")
    .replace(/(?<![\d/,])(\d{1,2})\s*[\/ ]\s*(\d{1,2})(?!\s*[\/ ]\s*\d)(?![\d/,])/g, "$1/$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function normalizeDate(dateToken: string, statementYear?: number, statementMonth?: number) {
  const normalized = normalizeFullWidthDigits(dateToken)
    .replace(/／/g, "/")
    .replace(/[.\uff0e]/g, "/")
    .replace(/[-－]/g, "/");

  // YYYY/MM/DD (Gregorian with full year)
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) {
    return normalized.replace(/\//g, "-");
  }

  // YYY/MM/DD (ROC calendar, e.g. 113/01/15 → 2024-01-15)
  const rocMatch = normalized.match(/^(1\d{2})\/(\d{2})\/(\d{2})$/);
  if (rocMatch) {
    return `${Number(rocMatch[1]) + 1911}-${rocMatch[2]}-${rocMatch[3]}`;
  }

  // MM/DD (no year) — apply cross-year heuristic when statement month is known:
  // if the transaction month is more than 3 months ahead of the statement month,
  // it belongs to the previous year (e.g. 12/26 in a March statement → prev year).
  const match = normalized.match(/^(\d{2})\/(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = statementYear ?? new Date().getFullYear();
  const txMonth = Number(match[1]);
  const resolvedYear =
    statementMonth !== undefined && txMonth - statementMonth > 3 ? year - 1 : year;
  return `${resolvedYear}-${match[1]}-${match[2]}`;
}

function parseAmount(raw: string) {
  const cleaned = normalizeFullWidthDigits(raw)
    .replace(/[，]/g, ",")
    .replace(/[＋]/g, "+")
    .replace(/[－]/g, "-")
    .replace(/[,\s]/g, "");
  const negativeByFormat = cleaned.startsWith("-") || /^\(.*\)$/.test(cleaned);
  const numeric = Number(cleaned.replace(/[()]/g, "").replace(/^\+/, ""));
  if (!Number.isFinite(numeric) || numeric === 0) {
    return null;
  }

  return negativeByFormat ? -Math.abs(numeric) : Math.abs(numeric);
}

function inferStatementYear(text: string) {
  const explicit = text.match(/\b(20\d{2})[\/.-]\d{1,2}[\/.-]\d{1,2}\b/);
  if (explicit) {
    return Number(explicit[1]);
  }

  const roc = text.match(/\b(1\d{2})[\/.-]\d{1,2}[\/.-]\d{1,2}\b/);
  if (roc) {
    return Number(roc[1]) + 1911;
  }

  return undefined;
}

function inferStatementMonth(text: string) {
  // Try Gregorian full date first (e.g. 2026/03/28)
  const explicit = text.match(/\b20\d{2}[\/.-](\d{1,2})[\/.-]\d{1,2}\b/);
  if (explicit) {
    return Number(explicit[1]);
  }

  // ROC full date (e.g. 115/03/28)
  const roc = text.match(/\b1\d{2}[\/.-](\d{1,2})[\/.-]\d{1,2}\b/);
  if (roc) {
    return Number(roc[1]);
  }

  return undefined;
}

function resolveCurrency(currencyToken?: string) {
  const normalized = (currencyToken ?? "TWD").trim().toUpperCase();
  if (normalized === "NTD") {
    return "TWD";
  }

  return supportedCurrencies.includes(normalized as (typeof supportedCurrencies)[number])
    ? normalized
    : "TWD";
}

function includesAny(haystack: string, markers: string[]) {
  const normalized = haystack.trim().toLowerCase();
  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

function isPositiveDescription(description: string) {
  return includesAny(description, genericPositiveMarkers);
}

function isIgnoredDescription(description: string, bankMarkers: string[]) {
  return includesAny(description, [...genericIgnoredMarkers, ...bankMarkers]);
}

function normalizeSignedAmount(description: string, rawAmount: string) {
  const parsed = parseAmount(rawAmount);
  if (parsed === null) {
    return null;
  }

  if (
    isPositiveDescription(description) ||
    rawAmount.trim().startsWith("+") ||
    rawAmount.trim().startsWith("-")
  ) {
    return Math.abs(parsed);
  }

  return -Math.abs(parsed);
}

function buildTransaction(
  statementYear: number | undefined,
  dateToken: string,
  description: string,
  rawAmount: string,
  currencyToken?: string,
  statementMonth?: number,
) {
  const date = normalizeDate(dateToken, statementYear, statementMonth);
  const amount = normalizeSignedAmount(description, rawAmount);
  if (!date || amount === null) {
    return null;
  }

  return {
    date,
    description: description.trim(),
    amount,
    currency: resolveCurrency(currencyToken),
  } satisfies ParsedPdfTransaction;
}

function isNumericToken(token: string) {
  return /^-?\d[\d,]*$/.test(token);
}

function isPercentToken(token: string) {
  return /^\d+(?:\.\d+)?%$/.test(token);
}

function isSinopacInstallmentLine(text: string) {
  return /\u671f\s*[:\uff1a]/u.test(text);
}

function normalizeGroupedNumericToken(token: string) {
  return token.replace(/[,\s]/g, "");
}

function startsWithDateToken(text: string) {
  return /^(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})/.test(text);
}

function containsAdjacentDateTokens(text: string) {
  return /(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})\s+(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})/.test(text);
}

function extractSinopacDetail(rest: string) {
  const withoutFxTail = rest
    .trim()
    .replace(/\s+\d{2}\/\d{2}\s+(?:TWD|NTD|USD|JPY)\d+(?:\.\d+)?$/u, "");
  const tokens = withoutFxTail.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }

  const percentIndex = tokens.findIndex((token) => isPercentToken(token));
  const numericIndices = tokens
    .map((token, index) => (isNumericToken(token) ? index : -1))
    .filter((index) => index >= 0);

  if (percentIndex >= 0) {
    const amountIndex = percentIndex - 1;
    if (amountIndex < 0 || !isNumericToken(tokens[amountIndex])) {
      return null;
    }

    return {
      description: tokens.slice(0, amountIndex).join(" "),
      amountToken: tokens[amountIndex],
    };
  }

  if (isSinopacInstallmentLine(rest)) {
    const installmentAmountMatch = rest.match(
      /^(?<description>.+?)\s+(?<amount1>\d{1,3}(?:[,\s]\d{3})+|\d+)\s+(?<amount2>\d{1,3}(?:[,\s]\d{3})+|\d+)$/u,
    );
    if (installmentAmountMatch?.groups) {
      return {
        description: installmentAmountMatch.groups.description.trim(),
        amountToken: normalizeGroupedNumericToken(installmentAmountMatch.groups.amount1),
      };
    }
  }

  if (numericIndices.length === 0) {
    return null;
  }

  let amountIndex = numericIndices[numericIndices.length - 1];

  if (isSinopacInstallmentLine(rest) && numericIndices.length >= 2) {
    const lastIndex = numericIndices[numericIndices.length - 1];
    const secondLastIndex = numericIndices[numericIndices.length - 2];
    if (lastIndex === tokens.length - 1 && secondLastIndex === tokens.length - 2) {
      amountIndex = secondLastIndex;
    }
  }

  if (amountIndex < 0) {
    return null;
  }

  if (amountIndex !== numericIndices[numericIndices.length - 1]) {
    return {
      description: tokens.slice(0, amountIndex).join(" "),
      amountToken: tokens[amountIndex],
    };
  }

  return {
    description: tokens.slice(0, amountIndex).join(" "),
    amountToken: tokens[amountIndex],
  };
}

function parseSinopacLine(line: string, statementYear?: number, statementMonth?: number) {
  const match = line.match(
    /^(?<consume>\d{2}\/\d{2})\s+(?<posted>\d{2}\/\d{2})\s+(?:(?<card>\d{4})\s+)?(?<rest>.+)$/u,
  );
  if (!match?.groups) {
    return null;
  }

  const detail = extractSinopacDetail(match.groups.rest);
  if (!detail) {
    return null;
  }

  const description = detail.description.trim();
  if (isIgnoredDescription(description, sinopacIgnoredMarkers)) {
    return null;
  }

  // Filter parse artifacts from PDF y-coordinate grouping:
  // 1. Description that itself starts with a date = concatenated/shifted row
  if (startsWithDateToken(description)) return null;
  // 2. FX-rate lines (e.g. "USD21.000 ...")
  if (/^[A-Z]{3}\d/.test(description)) return null;
  // 3. Description containing two adjacent date tokens = merged multi-row blob
  if (containsAdjacentDateTokens(description)) return null;

  return buildTransaction(
    statementYear,
    match.groups.consume,
    description,
    detail.amountToken,
    undefined,
    statementMonth,
  );
}

function parseSinopacPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const statementMonth = inferStatementMonth(normalizedText);
  const transactions: ParsedPdfTransaction[] = [];

  normalizedText.split("\n").forEach((line) => {
    const parsed = parseSinopacLine(line.trim(), statementYear, statementMonth);
    if (parsed) {
      transactions.push(parsed);
    }
  });

  return transactions;
}

function extractEsunDetail(line: string) {
  const twoAmountMatch = line.match(
    /^(?<consume>\d{2}\/\d{2})\s+(?<posted>\d{2}\/\d{2})\s+(?<description>.+?)\s+(?<currency1>TWD|NTD|USD|JPY)\s+(?<amount1>-?\d[\d,]*)\s+(?<currency2>TWD|NTD|USD|JPY)\s+(?<amount2>-?\d[\d,]*)$/u,
  );
  if (twoAmountMatch?.groups) {
    return {
      dateToken: twoAmountMatch.groups.consume,
      description: twoAmountMatch.groups.description,
      currencyToken: twoAmountMatch.groups.currency2,
      amountToken: twoAmountMatch.groups.amount2,
    };
  }

  const oneAmountMatch = line.match(
    /^(?<consume>\d{2}\/\d{2})\s+(?<posted>\d{2}\/\d{2})\s+(?<description>.+?)\s+(?:(?<currency>TWD|NTD|USD|JPY)\s+)?(?<amount>-?\d[\d,]*)$/u,
  );
  if (oneAmountMatch?.groups) {
    return {
      dateToken: oneAmountMatch.groups.consume,
      description: oneAmountMatch.groups.description,
      currencyToken: oneAmountMatch.groups.currency,
      amountToken: oneAmountMatch.groups.amount,
    };
  }

  return null;
}

function parseEsunPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const statementMonth = inferStatementMonth(normalizedText);
  const transactions: ParsedPdfTransaction[] = [];
  let activeSection: "none" | "fees" | "spend" = "none";

  normalizedText.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.includes("\u672c\u671f\u8cbb\u7528\u660e\u7d30")) {
      activeSection = "fees";
      return;
    }

    if (trimmed.includes("\u672c\u671f\u6d88\u8cbb\u660e\u7d30")) {
      activeSection = "spend";
      return;
    }

    if (
      trimmed.includes("\u672c\u671f\u5408\u8a08") ||
      trimmed.includes("\u672c\u671f\u61c9\u7e73\u7e3d\u91d1\u984d")
    ) {
      activeSection = "none";
      return;
    }

    if (activeSection === "none") {
      return;
    }

    const detail = extractEsunDetail(trimmed);
    if (!detail) {
      return;
    }

    const description = detail.description.trim();
    if (isIgnoredDescription(description, esunIgnoredMarkers)) {
      return;
    }

    const transaction = buildTransaction(
      statementYear,
      detail.dateToken,
      description,
      detail.amountToken,
      detail.currencyToken,
      statementMonth,
    );
    if (transaction) {
      transactions.push(transaction);
    }
  });

  return transactions;
}


// ─────────────────────────────────────────────────────────────
// 國泰 (Cathay) — actual row format confirmed from statement:
// 消費日  入帳起息日  交易說明  新臺幣金額  卡號後四碼  [行動卡號]  [國家]  [幣別]  [外幣金額]  [折算日]
// Key: TWD amount comes BEFORE the 4-digit card number.
// Rows without a card number (e.g. payments) are excluded by the regex.
// ─────────────────────────────────────────────────────────────

function extractCathayDetail(line: string) {
  // Format: MM/DD MM/DD description TWD_amount card4 [optional rest]
  // The trailing \d{4} (card last-4) distinguishes real transactions from summaries/payments.
  const match = line.match(
    /^(?<consume>(?:\d{3,4}\/)?(?:\d{2}\/\d{2}))\s+(?<posted>(?:\d{3,4}\/)?(?:\d{2}\/\d{2}))\s+(?<description>.+?)\s+(?<amount>-?\d[\d,]*)\s+\d{4}(?:\s+.*)?$/u,
  );
  if (!match?.groups) return null;
  return {
    dateToken: match.groups.consume,
    description: match.groups.description,
    currencyToken: undefined as string | undefined,
    amountToken: match.groups.amount,
  };
}

// Section openers for 國泰 (many variants seen in the wild)
const cathaySectionOpeners = [
  "\u60a8\u672c\u6708\u6d88\u8cbb\u660e\u7d30\u5982\u4e0b", // 您本月消費明細如下 ← actual header
  "\u672c\u671f\u6d88\u8cbb\u660e\u7d30",                   // 本期消費明細
  "\u672c\u671f\u8cbb\u7528\u660e\u7d30",                   // 本期費用明細
  "\u6d88\u8cbb\u660e\u7d30",                                // 消費明細
  "\u5237\u5361\u660e\u7d30",                                // 刷卡明細
  "\u4ea4\u6613\u660e\u7d30",                                // 交易明細
];

// Section closers (anything with 合計 or 應繳 ends the section)
function isCathaySectionClose(line: string) {
  return (
    line.includes("\u672c\u671f\u5408\u8a08") ||   // 本期合計
    line.includes("\u672c\u671f\u61c9\u7e73") ||   // 本期應繳
    line.includes("\u5408\u8a08\u91d1\u984d") ||   // 合計金額
    line.includes("\u5e33\u55ae\u91d1\u984d")       // 帳單金額
  );
}

function parseCathayLines(
  lines: string[],
  statementYear: number | undefined,
  sectionGated: boolean,
  statementMonth?: number,
): ParsedPdfTransaction[] {
  const transactions: ParsedPdfTransaction[] = [];
  let activeSection = !sectionGated;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (sectionGated) {
      if (cathaySectionOpeners.some((h) => trimmed.includes(h))) {
        activeSection = true;
        continue;
      }
      if (activeSection && isCathaySectionClose(trimmed)) {
        activeSection = false;
        continue;
      }
    }

    if (!activeSection) continue;

    const detail = extractCathayDetail(trimmed);
    if (!detail) continue;

    const description = detail.description.trim();
    if (isIgnoredDescription(description, cathayIgnoredMarkers)) continue;

    const transaction = buildTransaction(
      statementYear,
      detail.dateToken,
      description,
      detail.amountToken,
      detail.currencyToken,
      statementMonth,
    );
    if (transaction) transactions.push(transaction);
  }

  return transactions;
}

function parseCathayPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const statementMonth = inferStatementMonth(normalizedText);
  const lines = normalizedText.split("\n");

  // Try section-gated first (more precise)
  const gated = parseCathayLines(lines, statementYear, true, statementMonth);
  if (gated.length > 0) return gated;

  // Fallback: scan all lines without section gating
  return parseCathayLines(lines, statementYear, false, statementMonth);
}

// ─────────────────────────────────────────────────────────────
// 台新 (Taishin) — dual-date, description, amount
// Row shape: MM/DD MM/DD 說明 [幣別] 金額
// Same as Cathay line shape but without mandatory section gating;
// we still use section markers to improve precision.
// ─────────────────────────────────────────────────────────────

function extractTaishinDetail(line: string) {
  const datePattern = String.raw`(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})`;

  const twoAmountMatch = line.match(
    new RegExp(
      String.raw`^(?<consume>${datePattern})\s+(?<posted>${datePattern})\s+(?<description>.+?)\s+(?<currency1>TWD|NTD|USD|JPY)\s+(?<amount1>-?\d[\d,]*)\s+(?<currency2>TWD|NTD|USD|JPY)\s+(?<amount2>-?\d[\d,]*)$`,
      "u",
    ),
  );
  if (twoAmountMatch?.groups) {
    return {
      dateToken: twoAmountMatch.groups.consume,
      description: twoAmountMatch.groups.description,
      currencyToken: twoAmountMatch.groups.currency2,
      amountToken: twoAmountMatch.groups.amount2,
    };
  }

  const oneAmountMatch = line.match(
    new RegExp(
      String.raw`^(?<consume>${datePattern})\s+(?<posted>${datePattern})\s+(?<description>.+?)\s+(?:(?<currency>TWD|NTD|USD|JPY)\s+)?(?<amount>-?\d[\d,]*)(?:\s+(?<country>[A-Z]{2}))?(?:\s+(?<foreignCurrency>TWD|NTD|USD|JPY)\s+(?<foreignAmount>-?\d[\d,]*))?$`,
      "u",
    ),
  );
  if (oneAmountMatch?.groups) {
    return {
      dateToken: oneAmountMatch.groups.consume,
      description: oneAmountMatch.groups.description,
      currencyToken: oneAmountMatch.groups.currency,
      amountToken: oneAmountMatch.groups.amount,
    };
  }

  return null;
}

function parseTaishinPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const transactions: ParsedPdfTransaction[] = [];
  let activeSection: "none" | "spend" = "none";

  normalizedText.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // 消費明細 section opener
    if (trimmed.includes("\u6d88\u8cbb\u660e\u7d30") || trimmed.includes("\u672c\u671f\u660e\u7d30")) {
      activeSection = "spend";
      return;
    }
    // Generic closers
    if (
      trimmed.includes("\u672c\u671f\u5408\u8a08") ||
      trimmed.includes("\u672c\u671f\u61c9\u7e73") ||
      trimmed.includes("\u7e73\u6b3e\u8cc7\u8a0a")
    ) {
      activeSection = "none";
      return;
    }

    // Parse even outside section if line looks like a transaction row
    // (台新帳單有時沒有明確 section header)
    const detail = extractTaishinDetail(trimmed);
    if (!detail) return;

    const description = detail.description.trim();
    if (isIgnoredDescription(description, taishinIgnoredMarkers)) return;

    if (activeSection === "none") {
      // Only accept lines that look like real transactions (not summaries)
      if (trimmed.length < 10) return;
    }

    const transaction = buildTransaction(
      statementYear,
      detail.dateToken,
      description,
      detail.amountToken,
      detail.currencyToken,
    );
    if (transaction) transactions.push(transaction);
  });

  return transactions;
}

// ─────────────────────────────────────────────────────────────
// 中信 (CTBC) — Sinopac-like with optional card last-4
// Row shape: MM/DD MM/DD [卡末四] 說明 金額 [尾欄]
// ─────────────────────────────────────────────────────────────

function parseCtbcLine(line: string, statementYear?: number) {
  const datePattern = String.raw`(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})`;
  const match = line.match(
    new RegExp(
      String.raw`^(?<consume>${datePattern})\s+(?<posted>${datePattern})\s+(?<description>.+?)\s+(?<amount>-?\d[\d,]*(?:\.\d+)?)\s+(?<card>\d{4})(?:\s+(?<country>[A-Z]{2}))?(?:\s+(?<currency>TWD|NTD|USD|JPY)\s+(?<foreignAmount>-?\d[\d,]*(?:\.\d+)?))?$`,
      "u",
    ),
  );
  if (!match?.groups) return null;

  const detail = {
    dateToken: match.groups.consume,
    description: match.groups.description,
    amountToken: match.groups.amount,
  };
  if (!detail) return null;

  const description = detail.description.trim();
  if (isIgnoredDescription(description, ctbcIgnoredMarkers)) return null;

  // Filter PDF artifacts from line grouping / header bleed.
  if (startsWithDateToken(description)) return null;
  if (/^(TWD|NTD|USD|JPY)\b/.test(description)) return null;
  if (containsAdjacentDateTokens(description)) return null;

  return buildTransaction(statementYear, detail.dateToken, description, detail.amountToken);
}

function isCtbcDateToken(token: string) {
  return /^(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})$/.test(token);
}

function isCtbcAmountToken(token: string) {
  return /^-?\d[\d,]*(?:\.\d+)?$/.test(token);
}

function parseCtbcTokenStream(text: string, statementYear?: number) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const transactions: ParsedPdfTransaction[] = [];

  for (let i = 0; i < tokens.length - 1; i++) {
    if (!isCtbcDateToken(tokens[i]) || !isCtbcDateToken(tokens[i + 1])) {
      continue;
    }

    const nextRowIndex = (() => {
      for (let j = i + 2; j < tokens.length - 1; j++) {
        if (isCtbcDateToken(tokens[j]) && isCtbcDateToken(tokens[j + 1])) {
          return j;
        }
      }
      return tokens.length;
    })();

    const windowTokens = tokens.slice(i + 2, Math.min(nextRowIndex, i + 24));
    if (windowTokens.length < 3) {
      continue;
    }

    let parsed: ParsedPdfTransaction | null = null;

    for (let relativeCardIndex = 1; relativeCardIndex < windowTokens.length; relativeCardIndex++) {
      const cardToken = windowTokens[relativeCardIndex];
      const amountToken = windowTokens[relativeCardIndex - 1];
      if (!/^\d{4}$/.test(cardToken) || !isCtbcAmountToken(amountToken)) {
        continue;
      }

      const descriptionTokens = windowTokens.slice(0, relativeCardIndex - 1);
      if (descriptionTokens.length === 0) {
        continue;
      }

      parsed = parseCtbcLine(
        [
          tokens[i],
          tokens[i + 1],
          descriptionTokens.join(" "),
          amountToken,
          cardToken,
          ...windowTokens.slice(relativeCardIndex + 1),
        ].join(" "),
        statementYear,
      );

      if (parsed) {
        transactions.push(parsed);
        i = nextRowIndex - 1;
        break;
      }
    }
  }

  return transactions;
}

function parseCtbcPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const transactions: ParsedPdfTransaction[] = [];

  normalizedText.split("\n").forEach((line) => {
    const parsed = parseCtbcLine(line.trim(), statementYear);
    if (parsed) transactions.push(parsed);
  });

  if (transactions.length > 0) {
    return transactions;
  }

  const tokenStreamTransactions = parseCtbcTokenStream(normalizedText, statementYear);
  if (tokenStreamTransactions.length > 0) {
    return tokenStreamTransactions;
  }

  const stream = normalizedText.replace(/\n/g, " ");
  const streamPattern = /(?<consume>(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2}))\s+(?<posted>(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2}))\s+(?<description>.+?)\s+(?<amount>-?\d[\d,]*(?:\.\d+)?)\s+(?<card>\d{4})(?:\s+(?<country>[A-Z]{2}))?(?:\s+(?<currency>TWD|NTD|USD|JPY)\s+(?<foreignAmount>-?\d[\d,]*(?:\.\d+)?))?(?=\s+(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})\s+(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})|\s*$)/gu;

  for (const match of stream.matchAll(streamPattern)) {
    if (!match.groups) continue;
    const parsed = parseCtbcLine(
      `${match.groups.consume} ${match.groups.posted} ${match.groups.description} ${match.groups.amount} ${match.groups.card}${match.groups.country ? ` ${match.groups.country}` : ""}${match.groups.currency && match.groups.foreignAmount ? ` ${match.groups.currency} ${match.groups.foreignAmount}` : ""}`,
      statementYear,
    );
    if (parsed) {
      transactions.push(parsed);
    }
  }

  // ── Fallback: no-description-on-same-line format ─────────────
  // Some CTBC PDF versions store the merchant name on a separate line from the
  // date/amount/card row (the PDF text layer puts them in different y-buckets).
  // Pattern: "date date amount card4 [country] [currency foreignAmount]" on one line,
  // description text on the preceding or following non-date line.
  const datePattern2 = String.raw`(?:\d{2}\/\d{2}|\d{3,4}\/\d{2}\/\d{2})`;
  const noDescRegex = new RegExp(
    String.raw`^(?<consume>${datePattern2})\s+(?<posted>${datePattern2})\s+(?<amount>-?\d[\d,]*(?:\.\d+)?)\s+(?<card>\d{4})(?:\s+[A-Z]{2})?(?:\s+(?:TWD|NTD|USD|JPY)\s+-?\d[\d,]*(?:\.\d+)?)?$`,
    "u",
  );
  const lines2 = normalizedText.split("\n");
  for (let idx = 0; idx < lines2.length; idx++) {
    const line = lines2[idx].trim();
    const m = line.match(noDescRegex);
    if (!m?.groups) continue;

    // Search nearby lines (prefer previous, then next) for a non-date, non-numeric description
    let description = "";
    for (let d = idx - 1; d >= Math.max(0, idx - 3) && !description; d--) {
      const candidate = lines2[d].trim();
      if (
        candidate &&
        !startsWithDateToken(candidate) &&
        !/^\d[\d,./+-]*$/.test(candidate) &&
        !isIgnoredDescription(candidate, ctbcIgnoredMarkers)
      ) {
        description = candidate;
      }
    }
    for (let d = idx + 1; d <= Math.min(lines2.length - 1, idx + 3) && !description; d++) {
      const candidate = lines2[d].trim();
      if (
        candidate &&
        !startsWithDateToken(candidate) &&
        !/^\d[\d,./+-]*$/.test(candidate) &&
        !isIgnoredDescription(candidate, ctbcIgnoredMarkers)
      ) {
        description = candidate;
      }
    }
    if (!description) continue; // skip if no description found nearby

    const tx = buildTransaction(statementYear, m.groups.consume, description, m.groups.amount);
    if (tx) transactions.push(tx);
  }

  return transactions;
}

// ─────────────────────────────────────────────────────────────
// 兆豐 (Mega) — dual-date format, supports full ROC year dates
// Row shape: [YYY/]MM/DD [YYY/]MM/DD [卡末四] 說明 [幣別] 金額 [台幣金額]
// The last numeric token is always the TWD amount.
// ─────────────────────────────────────────────────────────────

const megaIgnoredMarkers = [
  "\u7e73\u6b3e\u91d1\u984d",
  "\u4e0a\u671f\u9918\u984d",
  "\u81ea\u52d5\u626e\u6b3e",
];

function extractMegaDetail(rest: string) {
  // Strip trailing currency+amount pairs (e.g. "TWD 91.00 91.00" → keep last amount)
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Find the last numeric token as the TWD amount
  let amountIndex = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^-?\d[\d,]*(?:\.\d+)?$/.test(tokens[i])) {
      amountIndex = i;
      break;
    }
  }
  if (amountIndex <= 0) return null;

  // Strip trailing currency codes and foreign amounts between description and TWD amount
  let descEnd = amountIndex - 1;
  while (descEnd >= 0 && (/^(?:TWD|NTD|USD|JPY|EUR|GBP|AUD|CAD|HKD|SGD|CNY)$/.test(tokens[descEnd]) || /^-?\d[\d,]*(?:\.\d+)?$/.test(tokens[descEnd]))) {
    descEnd--;
  }
  if (descEnd < 0) return null;

  return {
    description: tokens.slice(0, descEnd + 1).join(" "),
    amountToken: tokens[amountIndex],
  };
}

function parseMegaLine(line: string, statementYear?: number) {
  const datePattern = String.raw`(?:\d{3}\/\d{2}\/\d{2}|\d{2}\/\d{2})`;
  const match = line.match(
    new RegExp(
      String.raw`^(?<consume>${datePattern})\s+(?<posted>${datePattern})\s+(?:(?<card>\d{4})\s+)?(?<rest>.+)$`,
      "u",
    ),
  );
  if (!match?.groups) return null;

  const detail = extractMegaDetail(match.groups.rest);
  if (!detail) return null;

  const description = detail.description.trim();
  if (isIgnoredDescription(description, megaIgnoredMarkers)) return null;

  if (startsWithDateToken(description)) return null;
  if (/^[A-Z]{3}\d/.test(description)) return null;
  if (containsAdjacentDateTokens(description)) return null;

  return buildTransaction(statementYear, match.groups.consume, description, detail.amountToken);
}

function isMegaDescriptionCandidate(line: string) {
  const t = line.trim();
  if (!t) return false;
  if (startsWithDateToken(t)) return false;
  if (/^\d[\d,./+-]*$/.test(t)) return false;
  if (/^(?:TWD|NTD|USD|JPY|EUR|GBP|AUD|CAD|HKD|SGD|CNY)$/.test(t)) return false;
  if (isIgnoredDescription(t, megaIgnoredMarkers)) return false;
  return true;
}

function parseMegaPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const transactions: ParsedPdfTransaction[] = [];
  const lines = normalizedText.split("\n");
  const datePattern = String.raw`(?:\d{3}\/\d{2}\/\d{2}|\d{2}\/\d{2})`;

  // Regex for date-only rows (no parseable description in the rest field)
  const noDescRegex = new RegExp(
    String.raw`^(?<consume>${datePattern})\s+(?<posted>${datePattern})\s+(?:(?<card>\d{4})\s+)?(?<rest>(?:(?:TWD|NTD|USD|JPY|EUR|GBP|AUD|CAD|HKD|SGD|CNY)\s+)?-?\d[\d,]*(?:\.\d+)?(?:\s+-?\d[\d,]*(?:\.\d+)?)*)$`,
    "u",
  );

  // Regex for single-date rows (refund / fee lines with one date)
  const singleDateRegex = new RegExp(
    String.raw`^(?<posted>${datePattern})\s+(?<rest>.+)$`,
    "u",
  );

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();

    // Standard two-date line with description included
    const parsed = parseMegaLine(line, statementYear);
    if (parsed) {
      transactions.push(parsed);
      continue;
    }

    // Two-date line where description is on an adjacent line
    const noDescMatch = line.match(noDescRegex);
    if (noDescMatch?.groups) {
      let description = "";
      for (let d = idx - 1; d >= Math.max(0, idx - 3) && !description; d--) {
        if (isMegaDescriptionCandidate(lines[d])) description = lines[d].trim();
      }
      if (!description) {
        for (let d = idx + 1; d <= Math.min(lines.length - 1, idx + 3) && !description; d++) {
          if (isMegaDescriptionCandidate(lines[d])) description = lines[d].trim();
        }
      }
      if (description) {
        // Extract the last numeric token from rest as the TWD amount
        const restTokens = noDescMatch.groups.rest.trim().split(/\s+/).filter(Boolean);
        const amountToken = restTokens[restTokens.length - 1];
        if (amountToken) {
          const tx = buildTransaction(statementYear, noDescMatch.groups.consume, description, amountToken);
          if (tx) {
            transactions.push(tx);
            continue;
          }
        }
      }
    }

    // Single-date line (e.g. refund rows with only a posted date)
    const sdMatch = line.match(singleDateRegex);
    if (sdMatch?.groups && !startsWithDateToken(sdMatch.groups.rest)) {
      const detail = extractMegaDetail(sdMatch.groups.rest);
      if (detail) {
        // Rest contains an embedded description
        const description = detail.description.trim();
        if (
          description &&
          !isIgnoredDescription(description, megaIgnoredMarkers) &&
          !startsWithDateToken(description) &&
          !containsAdjacentDateTokens(description)
        ) {
          const tx = buildTransaction(statementYear, sdMatch.groups.posted, description, detail.amountToken);
          if (tx) transactions.push(tx);
        }
      } else {
        // No description in rest — look at adjacent lines
        const restTokens = sdMatch.groups.rest.trim().split(/\s+/).filter(Boolean);
        const amountToken = restTokens[restTokens.length - 1];
        if (amountToken && /^-?\d[\d,]*(?:\.\d+)?$/.test(amountToken)) {
          let description = "";
          for (let d = idx - 1; d >= Math.max(0, idx - 3) && !description; d--) {
            if (isMegaDescriptionCandidate(lines[d])) description = lines[d].trim();
          }
          if (!description) {
            for (let d = idx + 1; d <= Math.min(lines.length - 1, idx + 3) && !description; d++) {
              if (isMegaDescriptionCandidate(lines[d])) description = lines[d].trim();
            }
          }
          if (description) {
            const tx = buildTransaction(statementYear, sdMatch.groups.posted, description, amountToken);
            if (tx) transactions.push(tx);
          }
        }
      }
    }
  }

  return transactions;
}

// ─────────────────────────────────────────────────────────────
// 永豐 銀行帳戶 綜合對帳單
// Row shape (after PDF text extraction):
//   YYYY/MM/DD  摘要  [支出 or 存入 amount]  balance  [備註/資金用途]
// Sign is determined by balance delta: balance[i] - balance[i-1].
// Multiple currency sections (新臺幣 / 美元) are detected from headers.
// ─────────────────────────────────────────────────────────────

function collapseInterCharSpaces(text: string): string {
  // Some PDFs (e.g. 玉山綜合對帳單) emit each character with surrounding spaces,
  // so "綜合對帳單" becomes "綜 合 對 帳 單" and "02/01" becomes "0 2 / 0 1".
  // Strategy: for each line, if ≥60% of space-separated tokens are single chars,
  // treat the line as "spaced" and merge consecutive single-char tokens together.
  return text
    .split("\n")
    .map((line) => {
      const tokens = line.split(" ").filter(Boolean);
      if (tokens.length < 4) return line;
      const singleCharCount = tokens.filter((t) => t.length === 1).length;
      if (singleCharCount / tokens.length < 0.6) return line;

      // Merge consecutive single-char tokens; multi-char tokens act as natural separators
      const merged: string[] = [];
      let current = "";
      for (const token of tokens) {
        if (token.length === 1) {
          current += token;
        } else {
          if (current) { merged.push(current); current = ""; }
          merged.push(token);
        }
      }
      if (current) merged.push(current);
      return merged.join(" ");
    })
    .join("\n");
}

function parseSinopacBankPdfText(text: string): ParsedPdfTransaction[] {
  // Pre-process: collapse inter-character spaces common in some bank PDF extractions
  const deSpaced = collapseInterCharSpaces(text);
  const normalizedText = normalizeWhitespace(deSpaced);
  const lines = normalizedText.split("\n");

  let currency = "TWD";
  let subAccount = ""; // 目前所在的子帳號末碼，例如 "27100"

  interface BankRow {
    date: string;
    description: string;
    amount: number;
    balance: number;
    currency: string;
    subAccount: string;
  }

  // 每個子帳號各自的 rawRows，key = "${currency}-${subAccount}"
  const sectionRows = new Map<string, { rows: BankRow[]; openingBalance: number | null }>();

  function currentSection() {
    const key = `${currency}-${subAccount}`;
    if (!sectionRows.has(key)) {
      sectionRows.set(key, { rows: [], openingBalance: null });
    }
    return sectionRows.get(key)!;
  }

  // Regex to detect comma-formatted amounts (not raw reference IDs)
  const amountRe = /^\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?$/;
  // Regex to detect account number lines (e.g. "007-00*-**27100-*" or "198-01*-**38042-*")
  const acctNoRe = /\b\d{3}-\d{2}\*?-\*{0,2}(\d{4,6})-?\*?\b/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Currency section detection
    if (trimmed.includes("美元") || /\bUSD\b/.test(trimmed)) {
      currency = "USD";
    } else if (trimmed.includes("日圓") || trimmed.includes("日幣") || /\bJPY\b/.test(trimmed)) {
      currency = "JPY";
    } else if (trimmed.includes("新臺幣") || /\bTWD\b/.test(trimmed)) {
      currency = "TWD";
    }

    // Sub-account detection: pick up account number lines
    const acctMatch = trimmed.match(acctNoRe);
    if (acctMatch) {
      subAccount = acctMatch[1]; // e.g. "27100"
    }

    // Opening balance line (期初餘額 / 前期結餘) — per sub-account section
    const section = currentSection();
    if (section.openingBalance === null && /期初餘額|前期結餘|上期結餘/.test(trimmed)) {
      const ob = trimmed.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?)(?:\s|$)/);
      if (ob) {
        section.openingBalance = Number(ob[1].replace(/,/g, ""));
      }
    }

    // Transaction row: starts with YYYY/MM/DD or ROC YYY/MM/DD
    const rowMatch = trimmed.match(/^(?<date>(?:\d{3}|\d{4})\/\d{2}\/\d{2})\s+(?<rest>.+)$/u);
    if (!rowMatch?.groups) continue;

    const tokens = rowMatch.groups.rest.split(/\s+/).filter(Boolean);

    // Collect comma-formatted amount-like tokens with their positions
    const amountTokens = tokens
      .map((t, i) => ({ i, v: amountRe.test(t) ? Number(t.replace(/,/g, "")) : null }))
      .filter((x): x is { i: number; v: number } => x.v !== null && x.v > 0);

    // Need at least 2 amount-like tokens: [transaction_amount, balance]
    if (amountTokens.length < 2) continue;

    const balance = amountTokens[amountTokens.length - 1].v;
    const amount = amountTokens[amountTokens.length - 2].v;
    const firstAmountIdx = amountTokens[amountTokens.length - 2].i;

    // Description = tokens before the transaction amount
    const descTokens = tokens.slice(0, firstAmountIdx).filter((t) => !/^\d+$/.test(t));
    // Remarks = tokens after balance (filter out pure digit reference numbers)
    const balanceIdx = amountTokens[amountTokens.length - 1].i;
    const remarkTokens = tokens.slice(balanceIdx + 1).filter((t) => !/^\d{6,}$/.test(t));

    const description = [...descTokens, ...remarkTokens].join(" ").trim();
    if (!description) continue;

    section.rows.push({
      date: normalizeDate(rowMatch.groups.date) ?? rowMatch.groups.date.replace(/\//g, "-"),
      description,
      amount,
      balance,
      currency,
      subAccount,
    });
  }

  // Determine sign from balance delta, per sub-account section
  const transactions: ParsedPdfTransaction[] = [];
  for (const { rows, openingBalance } of sectionRows.values()) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const prevBalance = i === 0
        ? (openingBalance ?? row.balance - row.amount)
        : rows[i - 1].balance;
      const delta = row.balance - prevBalance;
      const signedAmount = delta >= 0 ? row.amount : -row.amount;

      transactions.push({
        date: row.date,
        description: row.description,
        amount: signedAmount,
        currency: row.currency,
        subAccount: row.subAccount || undefined,
      });
    }
  }

  return transactions;
}

function parseEsunBankPdfText(text: string): ParsedPdfTransaction[] {
  // Current E.SUN bank statements share the same row structure as the Sinopac
  // bank-statement parser once OCR/text extraction has been normalized.
  return parseSinopacBankPdfText(text);
}

// ─────────────────────────────────────────────────────────────
// Loan & Insurance Types
// ─────────────────────────────────────────────────────────────

export type ParsedLoanRecord = {
  accountNo: string;
  paymentDate: string;  // YYYY-MM-DD
  paymentAmount: number;
  principal: number;
  interest: number;
  penalty: number;
  remainingBalance: number;
};

export type ParsedInsuranceRecord = {
  insuranceType: 'non-investment' | 'investment';
  policyNo: string;
  company: string;
  productName: string;
  insuredPerson: string;
  startDate: string;
  endDate: string;
  currency: string;
  coverage: number;
  nextPremium: number;
  paymentPeriod: string;
  accumulatedPremium: number;
  nextPaymentDate: string;
};

// ─────────────────────────────────────────────────────────────
// Loan Section Parser
// ─────────────────────────────────────────────────────────────

function parseDateToIso(dateToken: string): string {
  // Handle YYYY/MM/DD or YYYY-MM-DD
  const m = dateToken.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return dateToken;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function parsePlainAmount(s: string): number {
  return Number(s.replace(/,/g, '')) || 0;
}

export function parseSinopacLoanSection(text: string): ParsedLoanRecord[] {
  const deSpaced = collapseInterCharSpaces(text);
  const normalized = normalizeWhitespace(deSpaced);
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  // Find the 貸款 section
  const loanSectionIdx = lines.findIndex((l) => /^貸\s*款$|貸款/.test(l));
  if (loanSectionIdx === -1) return [];

  const records: ParsedLoanRecord[] = [];

  // Account number pattern: digits/dashes/asterisks like 007-05*-**10734-*/420005
  const acctRe = /[\d]{3}-[\d*]+-[\d*]+-[\d*]+(?:\/\d+)?/;

  for (let i = loanSectionIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop at next major section
    if (/^保\s*險$|^保險$|^投\s*資$|^投資$|^外\s*匯$|^外匯$/.test(line)) break;

    const acctMatch = line.match(acctRe);
    if (!acctMatch) continue;

    // Extract all date tokens and numbers from the line
    const dateMatches = [...line.matchAll(/\d{4}\/\d{2}\/\d{2}/g)];
    if (dateMatches.length === 0) continue;

    // Remove account number and dates, collect the remaining number tokens
    let rest = line;
    rest = rest.replace(acctRe, '');
    rest = rest.replace(/\d{4}\/\d{2}\/\d{2}/g, '');
    const numTokens = rest.split(/\s+/).filter((t) => /^\d[\d,]*$/.test(t));

    if (numTokens.length < 5) continue;

    try {
      const record: ParsedLoanRecord = {
        accountNo: acctMatch[0],
        paymentDate: parseDateToIso(dateMatches[0][0]),
        paymentAmount: parsePlainAmount(numTokens[0]),
        principal: parsePlainAmount(numTokens[1]),
        interest: parsePlainAmount(numTokens[2]),
        penalty: parsePlainAmount(numTokens[3]),
        remainingBalance: parsePlainAmount(numTokens[4]),
      };
      records.push(record);
    } catch {
      // skip malformed line
    }
  }

  return records;
}

// ─────────────────────────────────────────────────────────────
// Insurance Section Parser
// ─────────────────────────────────────────────────────────────

export function parseSinopacInsuranceSection(text: string): ParsedInsuranceRecord[] {
  const deSpaced = collapseInterCharSpaces(text);
  const normalized = normalizeWhitespace(deSpaced);
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  const policyNoRe = /\b[A-Z]\d[\d*]+\d\b/;

  function looksLikePolicyStart(index: number) {
    const line = lines[index];
    if (!policyNoRe.test(line)) return false;

    const sameLineHasTypeHint = line.includes("非投資型") || line.includes("投資型");
    const detailPreview = lines.slice(index + 1, Math.min(lines.length, index + 4));
    const hasStandaloneChineseDetails = detailPreview.some((candidate) => {
      const condensed = candidate.replace(/\s+/g, "");
      return /^[\u4e00-\u9fff]{2,}$/.test(condensed)
        && !/^(貸款|投資|外匯|訊息公告|利率)$/.test(condensed);
    });

    return sameLineHasTypeHint || hasStandaloneChineseDetails;
  }

  // 找到「保險」區段起始
  const insuranceSectionIdx = lines.findIndex((line, index) => {
    if (!/保\s*險/.test(line)) return false;

    const nearby = lines.slice(index, Math.min(lines.length, index + 6)).join(" ");
    return /非投資型|投資型|保單號碼|[A-Z]\d[\d*]+\d/.test(nearby);
  });
  if (insuranceSectionIdx === -1) return [];

  // 終止條件：到「貸款」、「投資」等下一個主要區段
  const sectionEndRe = /^貸\s*款$|^投\s*資$|^外\s*匯$|^訊息公告$|^利率$/;

  // 收集每個保單號碼之後的所有行，直到下一個保單或區段結束
  const records: ParsedInsuranceRecord[] = [];

  // 判斷目前是否在非投資型或投資型區塊
  let currentInsuranceType: 'non-investment' | 'investment' = 'non-investment';

  let i = insuranceSectionIdx + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (sectionEndRe.test(line)) break;

    // 判斷保險類型標題行
    if (line.includes('非投資型')) {
      currentInsuranceType = 'non-investment';
    } else if (line.includes('投資型')) {
      currentInsuranceType = 'investment';
    }

    // 找到保單號碼行
    if (!looksLikePolicyStart(i)) { i++; continue; }

    const policyMatch = line.match(policyNoRe);
    if (!policyMatch) { i++; continue; }

    const policyNo = policyMatch[0];

    // 蒐集此保單後續所有行（直到下一個保單號碼、區段結束、或超過合理行數）
    const collected: string[] = [];
    const inlineRemainder = line.replace(policyNo, '').trim();
    if (inlineRemainder) {
      collected.push(inlineRemainder);
    }
    let j = i + 1;
    while (j < lines.length && j < i + 20) {
      const l = lines[j];
      if (sectionEndRe.test(l)) break;
      if (looksLikePolicyStart(j)) break; // 下一張保單開始
      collected.push(l);
      j++;
    }

    const combined = collected.join(' ');

    // 從 combined 提取各欄位
    // 日期：YYYY/MM/DD
    const dateMatches = [...combined.matchAll(/\d{4}\/\d{2}\/\d{2}/g)];

    // 貨幣
    const currencyMatch = combined.match(/\b(TWD|USD|JPY|EUR)\b/);
    const currency = currencyMatch?.[1] ?? 'TWD';

    // 純數字金額 token（逗號格式，去除日期和貨幣後剩下的）
    const stripped = combined
      .replace(/\d{4}\/\d{2}\/\d{2}/g, '')
      .replace(/\b(TWD|USD|JPY|EUR)\b/g, '')
      .replace(/\d+年\/[年月季半]+繳/g, '');
    const numTokens = stripped.split(/\s+/).filter((t) => /^\d[\d,]*$/.test(t));

    // 繳費年期（如「20年/年繳」）
    const paymentPeriodMatch = combined.match(/\d+年\/[年月季半年]+繳/);
    const paymentPeriod = paymentPeriodMatch?.[0] ?? '';

    // 中文名稱 chunks — 排除標題性關鍵詞
    const headerKeywords = /保單號碼|保險公司|商品名稱|被保險人|保單生效日|保單到期日|保單幣別|主約保額|下期應繳|累計已繳|年期|繳別|非投資型|投資型/;
    const chineseChunks = combined
      .split(/\s+/)
      .filter((t) => /^[\u4e00-\u9fff]{2,}/.test(t) && !headerKeywords.test(t));

    // 公司名稱：通常含「壽」「產」「險」等字
    const companyKeywords = /壽|產|險|銀行|人壽/;
    const company = chineseChunks.find((t) => companyKeywords.test(t)) ?? chineseChunks[0] ?? '';
    const productName = chineseChunks.filter((t) => t !== company).join('');

    // 被保險人：英文字母開頭的 masked ID（如 P122****74）
    const insuredMatches = [...combined.matchAll(/[A-Z]\d[\d*]+\d/g)].map((match) => match[0]);
    const insuredPerson = insuredMatches.find((token) => token !== policyNo) ?? '';

    records.push({
      insuranceType: currentInsuranceType,
      policyNo,
      company,
      productName,
      insuredPerson,
      startDate: dateMatches[0] ? parseDateToIso(dateMatches[0][0]) : '',
      endDate: dateMatches[1] ? parseDateToIso(dateMatches[1][0]) : '',
      currency,
      coverage: numTokens[0] ? parsePlainAmount(numTokens[0]) : 0,
      nextPremium: numTokens[1] ? parsePlainAmount(numTokens[1]) : 0,
      paymentPeriod,
      accumulatedPremium: numTokens[2] ? parsePlainAmount(numTokens[2]) : 0,
      nextPaymentDate: dateMatches[2] ? parseDateToIso(dateMatches[2][0]) : '',
    });

    i = j;
  }

  return records;
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

export function parseSinopacPdfTransactions(text: string) {
  return parseSinopacPdfText(text);
}

export function parseSinopacBankPdfTransactions(text: string) {
  return parseSinopacBankPdfText(text);
}

export function parseEsunLoanSection(text: string): ParsedLoanRecord[] {
  const deSpaced = collapseInterCharSpaces(text);
  const normalized = normalizeWhitespace(deSpaced);
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  const loanSectionIdx = lines.findIndex((line) => /^貸\s*款$|貸款/.test(line));
  if (loanSectionIdx === -1) return [];

  const sectionEndRe = /^保\s*險$|^保險$|^投\s*資$|^投資$|^外\s*匯$|^外匯$|^說明[:：]?$/;
  const sectionLines: string[] = [];
  for (let i = loanSectionIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (sectionEndRe.test(line)) break;
    sectionLines.push(line);
  }

  const dataDateMatch = sectionLines.join(" ").match(/資料日期[:：]?\s*(\d{4}\/\d{2}\/\d{2})/);
  const paymentDate = dataDateMatch ? parseDateToIso(dataDateMatch[1]) : "";
  const records: ParsedLoanRecord[] = [];

  for (const line of sectionLines) {
    if (!/[A-Z0-9*]{4,}/.test(line) || !/\d[\d,]*\.\d{2}/.test(line)) {
      continue;
    }

    const amountMatches = [...line.matchAll(/\d[\d,]*\.\d{2}/g)].map((match) => parsePlainAmount(match[0]));
    if (amountMatches.length === 0) continue;

    const accountMatch = line.match(/\b\d{6,8}\*{3}\d{3}\b/);
    if (!accountMatch) continue;

    records.push({
      accountNo: accountMatch[0],
      paymentDate,
      paymentAmount: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      remainingBalance: amountMatches[amountMatches.length - 1],
    });
  }

  return records;
}

export function parseEsunBankPdfTransactions(text: string) {
  return parseEsunBankPdfText(text);
}

export function parseEsunPdfTransactions(text: string) {
  return parseEsunPdfText(text);
}

export function parseCathayPdfTransactions(text: string) {
  return parseCathayPdfText(text);
}

export function parseTaishinPdfTransactions(text: string) {
  return parseTaishinPdfText(text);
}

export function parseCtbcPdfTransactions(text: string) {
  return parseCtbcPdfText(text);
}

export function parseMegaPdfTransactions(text: string) {
  return parseMegaPdfText(text);
}
