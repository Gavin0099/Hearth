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

function normalizeWhitespace(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function normalizeDate(dateToken: string, statementYear?: number) {
  const normalized = dateToken.replace(/\./g, "/").replace(/-/g, "/");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) {
    return normalized.replace(/\//g, "-");
  }

  const match = normalized.match(/^(\d{2})\/(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = statementYear ?? new Date().getFullYear();
  return `${year}-${match[1]}-${match[2]}`;
}

function parseAmount(raw: string) {
  const cleaned = raw.replace(/[,\s]/g, "");
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
  if (/^\d{2}\/\d{2}/.test(description)) return null;
  // 2. FX-rate lines (e.g. "USD21.000 ...")
  if (/^[A-Z]{3}\d/.test(description)) return null;
  // 3. Description containing two adjacent date tokens = merged multi-row blob
  if (/\d{2}\/\d{2}\s+\d{2}\/\d{2}/.test(description)) return null;

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

export function parseSinopacPdfTransactions(text: string) {
  return parseSinopacPdfText(text);
}

export function parseEsunPdfTransactions(text: string) {
  return parseEsunPdfText(text);
}
