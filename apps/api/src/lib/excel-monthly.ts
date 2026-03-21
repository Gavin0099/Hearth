import * as XLSX from "xlsx";
import type { CreateTransactionInput } from "@hearth/shared";

const categoryAliases = ["分類", "category"];
const descriptionAliases = ["項目", "摘要", "內容", "description"];
const itemAliases = ["項目", "item"];
const amountAliases = ["金額", "amount"];

const categoryMap: Record<string, string> = {
  "飲食費用": "餐飲",
  "生活雜費": "生活購物",
  "交通花費": "交通",
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCategory(value: string | null) {
  if (!value) {
    return null;
  }

  return categoryMap[value] ?? value;
}

function isEmptyRow(row: unknown[]) {
  return row.every((cell) => normalizeText(cell) === "");
}

function parseDateHeader(value: unknown, fallbackYear?: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const directMatch = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (directMatch) {
    const [, year, month, day] = directMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthDayMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})$/);
  if (monthDayMatch && fallbackYear) {
    const [, month, day] = monthDayMatch;
    return `${fallbackYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function normalizeAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
    return value > 0 ? -value : value;
  }

  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const cleaned = text.replace(/[,\s$]/g, "");
  const negative = cleaned.startsWith("-") || /^\(.*\)$/.test(cleaned);
  const numeric = Number(cleaned.replace(/[()]/g, ""));
  if (!Number.isFinite(numeric) || numeric === 0) {
    return null;
  }

  return negative ? -Math.abs(numeric) : -Math.abs(numeric);
}

function getColumnIndex(headerRow: unknown[], aliases: string[], defaultIndex: number) {
  const normalizedAliases = aliases.map((alias) => alias.trim().toLowerCase());
  const matchedIndex = headerRow.findIndex((cell) =>
    normalizedAliases.includes(normalizeText(cell).toLowerCase()),
  );

  if (matchedIndex >= 0) {
    return matchedIndex;
  }

  return defaultIndex;
}

function rowHasAmounts(row: unknown[], dateColumns: Array<{ index: number; date: string }>) {
  return dateColumns.some(({ index }) => normalizeAmount(row[index]) !== null);
}

function hasValuesBeforeIndex(row: unknown[], endExclusive: number) {
  return row.slice(0, endExclusive).some((cell) => normalizeText(cell) !== "");
}

function getFallbackYear(headerRow: unknown[]) {
  const firstExplicitYear = headerRow
    .map((cell) => normalizeText(cell))
    .map((cell) => cell.match(/^(\d{4})[\/-]/)?.[1] ?? null)
    .find(Boolean);

  return firstExplicitYear ? Number(firstExplicitYear) : undefined;
}

function buildDateColumns(headerRow: unknown[]) {
  const fallbackYear = getFallbackYear(headerRow);
  return headerRow
    .map((cell, index) => ({
      index,
      date: parseDateHeader(cell, fallbackYear),
    }))
    .filter((entry): entry is { index: number; date: string } => Boolean(entry.date));
}

function parseCalendarPairColumns(
  rows: unknown[][],
  headerRowIndex: number,
  accountId: string,
) {
  const headerRow = rows[headerRowIndex] as unknown[];
  const pairHeaderRow = rows[headerRowIndex + 1];
  if (!Array.isArray(pairHeaderRow)) {
    return null;
  }

  const fallbackYear = getFallbackYear(headerRow);
  const normalizedItemAliases = itemAliases.map((alias) => alias.toLowerCase());
  const normalizedAmountAliases = amountAliases.map((alias) => alias.toLowerCase());

  const pairColumns = headerRow
    .map((cell, index) => {
      const date = parseDateHeader(cell, fallbackYear);
      if (!date) {
        return null;
      }

      const itemLabel = normalizeText(pairHeaderRow[index]).toLowerCase();
      const amountLabel = normalizeText(pairHeaderRow[index + 1]).toLowerCase();
      if (
        !normalizedItemAliases.includes(itemLabel) ||
        !normalizedAmountAliases.includes(amountLabel)
      ) {
        return null;
      }

      return {
        date,
        itemIndex: index,
        amountIndex: index + 1,
      };
    })
    .filter(
      (entry): entry is { date: string; itemIndex: number; amountIndex: number } => Boolean(entry),
    );

  if (pairColumns.length === 0) {
    return null;
  }

  const normalized: CreateTransactionInput[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let activeCategory: string | null = null;

  rows.slice(headerRowIndex + 2).forEach((row, offset) => {
    if (!Array.isArray(row) || isEmptyRow(row)) {
      skipped += 1;
      return;
    }

    const line = headerRowIndex + offset + 3;
    const leftBoundary = pairColumns[0].itemIndex;
    const leftCells = row.slice(0, leftBoundary).map((cell) => normalizeText(cell));
    const leftLabel = leftCells.find(Boolean) ?? "";
    const hasCalendarValues = pairColumns.some(
      ({ itemIndex, amountIndex }) =>
        normalizeText(row[itemIndex]) !== "" || normalizeAmount(row[amountIndex]) !== null,
    );

    if (leftLabel && !hasCalendarValues) {
      activeCategory = normalizeCategory(leftLabel);
      skipped += 1;
      return;
    }

    let emitted = 0;
    pairColumns.forEach(({ date, itemIndex, amountIndex }) => {
      const description = normalizeText(row[itemIndex]);
      const amount = normalizeAmount(row[amountIndex]);
      if (!description && amount === null) {
        return;
      }

      if (amount === null) {
        errors.push(`line ${line}: ${date} amount is missing or invalid`);
        return;
      }

      normalized.push({
        account_id: accountId,
        date,
        amount,
        currency: "TWD",
        category: activeCategory ?? "其他",
        description: description || activeCategory || "未命名項目",
        source: "excel_monthly",
      });
      emitted += 1;
    });

    if (emitted === 0 && hasCalendarValues) {
      errors.push(`line ${line}: row has no importable calendar entries`);
    } else if (!hasCalendarValues && hasValuesBeforeIndex(row, leftBoundary)) {
      skipped += 1;
    } else if (emitted === 0) {
      skipped += 1;
    }
  });

  return {
    normalized,
    errors,
    skipped,
    sheetName: null as string | null,
  };
}

function parseGridColumns(
  rows: unknown[][],
  headerRowIndex: number,
  accountId: string,
) {
  const headerRow = rows[headerRowIndex] as unknown[];
  const dateColumns = buildDateColumns(headerRow);

  if (dateColumns.length === 0) {
    return null;
  }

  const firstDateIndex = dateColumns[0].index;
  const categoryIndex = getColumnIndex(headerRow, categoryAliases, 0);
  const descriptionIndex = getColumnIndex(headerRow, descriptionAliases, 1);

  const normalized: CreateTransactionInput[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let activeCategory: string | null = null;

  rows.slice(headerRowIndex + 1).forEach((row, offset) => {
    if (!Array.isArray(row) || isEmptyRow(row)) {
      skipped += 1;
      return;
    }

    const line = headerRowIndex + offset + 2;
    const rawCategory = normalizeText(row[categoryIndex]);
    const description = normalizeText(row[descriptionIndex]);
    const hasAmounts = rowHasAmounts(row, dateColumns);

    if (rawCategory && !description && !hasAmounts) {
      activeCategory = normalizeCategory(rawCategory);
      skipped += 1;
      return;
    }

    const resolvedCategory = normalizeCategory(rawCategory) ?? activeCategory ?? "其他";
    const resolvedDescription = description || rawCategory;

    if (!resolvedDescription) {
      skipped += 1;
      return;
    }

    let emitted = 0;
    dateColumns.forEach(({ index, date }) => {
      const amount = normalizeAmount(row[index]);
      if (amount === null) {
        return;
      }

      normalized.push({
        account_id: accountId,
        date,
        amount,
        currency: "TWD",
        category: resolvedCategory,
        description: resolvedDescription,
        source: "excel_monthly",
      });
      emitted += 1;
    });

    if (emitted === 0 && hasValuesBeforeIndex(row, firstDateIndex)) {
      skipped += 1;
    } else if (emitted === 0) {
      errors.push(`line ${line}: row has no importable daily amounts`);
    }
  });

  return {
    normalized,
    errors,
    skipped,
    sheetName: null as string | null,
  };
}

function parseMonthlySheet(rows: unknown[][], accountId: string) {
  const headerRowIndex = rows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => parseDateHeader(cell) !== null),
  );

  if (headerRowIndex < 0) {
    return null;
  }

  const calendarPairResult = parseCalendarPairColumns(rows, headerRowIndex, accountId);
  if (calendarPairResult) {
    return calendarPairResult;
  }

  return parseGridColumns(rows, headerRowIndex, accountId);
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });

  const merges = (sheet["!merges"] ?? []) as Array<{
    s: { r: number; c: number };
    e: { r: number; c: number };
  }>;

  merges.forEach((merge) => {
    const sourceValue = rows[merge.s.r]?.[merge.s.c];
    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
      if (!rows[rowIndex]) {
        rows[rowIndex] = [];
      }

      for (let columnIndex = merge.s.c; columnIndex <= merge.e.c; columnIndex += 1) {
        if (rows[rowIndex][columnIndex] === "" || rows[rowIndex][columnIndex] === undefined) {
          rows[rowIndex][columnIndex] = sourceValue ?? "";
        }
      }
    }
  });

  return rows;
}

export function parseMonthlyExcel(buffer: ArrayBuffer, accountId: string) {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
  });

  if (workbook.SheetNames.length === 0) {
    return {
      normalized: [] as CreateTransactionInput[],
      errors: ["Workbook has no sheets."],
      skipped: 0,
      sheetName: null as string | null,
    };
  }

  const normalized: CreateTransactionInput[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const parsedSheets: string[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheetToRows(sheet);

    const result = parseMonthlySheet(rows, accountId);
    if (!result) {
      return;
    }

    normalized.push(...result.normalized);
    errors.push(...result.errors.map((message) => `[${sheetName}] ${message}`));
    skipped += result.skipped;
    parsedSheets.push(sheetName);
  });

  if (parsedSheets.length === 0) {
    return {
      normalized: [] as CreateTransactionInput[],
      errors: ["Workbook is missing a parsable monthly sheet."],
      skipped: 0,
      sheetName: null as string | null,
    };
  }

  return {
    normalized,
    errors,
    skipped,
    sheetName: parsedSheets.join(", "),
  };
}
