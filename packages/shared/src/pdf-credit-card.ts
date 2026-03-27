export type ParsedPdfTransaction = {
  date: string;
  description: string;
  amount: number;
  currency: string;
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

function normalizeDate(dateToken: string, statementYear?: number) {
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

  // MM/DD (no year)
  const match = normalized.match(/^(\d{2})\/(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = statementYear ?? new Date().getFullYear();
  return `${year}-${match[1]}-${match[2]}`;
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
) {
  const date = normalizeDate(dateToken, statementYear);
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

function parseSinopacLine(line: string, statementYear?: number) {
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
  );
}

function parseSinopacPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const transactions: ParsedPdfTransaction[] = [];

  normalizedText.split("\n").forEach((line) => {
    const parsed = parseSinopacLine(line.trim(), statementYear);
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
    );
    if (transaction) transactions.push(transaction);
  }

  return transactions;
}

function parseCathayPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const lines = normalizedText.split("\n");

  // Try section-gated first (more precise)
  const gated = parseCathayLines(lines, statementYear, true);
  if (gated.length > 0) return gated;

  // Fallback: scan all lines without section gating
  return parseCathayLines(lines, statementYear, false);
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
// 兆豐 (Mega) — same Sinopac-like dual-date format
// Row shape: MM/DD MM/DD [卡末四] 說明 金額 [尾欄]
// ─────────────────────────────────────────────────────────────

const megaIgnoredMarkers = [
  "\u7e73\u6b3e\u91d1\u984d",
  "\u4e0a\u671f\u9918\u984d",
  "\u81ea\u52d5\u626e\u6b3e",
];

function parseMegaLine(line: string, statementYear?: number) {
  const match = line.match(
    /^(?<consume>\d{2}\/\d{2})\s+(?<posted>\d{2}\/\d{2})\s+(?:(?<card>\d{4})\s+)?(?<rest>.+)$/u,
  );
  if (!match?.groups) return null;

  const detail = extractSinopacDetail(match.groups.rest);
  if (!detail) return null;

  const description = detail.description.trim();
  if (isIgnoredDescription(description, megaIgnoredMarkers)) return null;

  if (startsWithDateToken(description)) return null;
  if (/^[A-Z]{3}\d/.test(description)) return null;
  if (containsAdjacentDateTokens(description)) return null;

  return buildTransaction(statementYear, match.groups.consume, description, detail.amountToken);
}

function parseMegaPdfText(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const statementYear = inferStatementYear(normalizedText);
  const transactions: ParsedPdfTransaction[] = [];

  normalizedText.split("\n").forEach((line) => {
    const parsed = parseMegaLine(line.trim(), statementYear);
    if (parsed) transactions.push(parsed);
  });

  return transactions;
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

export function parseSinopacPdfTransactions(text: string) {
  return parseSinopacPdfText(text);
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
