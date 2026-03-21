import * as XLSX from "xlsx";
import type { CreateTransactionInput } from "@hearth/shared";

const categoryAliases = ["分類", "category"];
const descriptionAliases = ["項目", "摘要", "內容", "description"];

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

export function parseMonthlyExcel(buffer: ArrayBuffer, accountId: string) {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      normalized: [] as CreateTransactionInput[],
      errors: ["Workbook has no sheets."],
      skipped: 0,
      sheetName: null as string | null,
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });

  const headerRowIndex = rows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => parseDateHeader(cell) !== null),
  );

  if (headerRowIndex < 0) {
    return {
      normalized: [] as CreateTransactionInput[],
      errors: ["Workbook is missing a date header row."],
      skipped: 0,
      sheetName,
    };
  }

  const headerRow = rows[headerRowIndex] as unknown[];
  const firstExplicitYear = headerRow
    .map((cell) => normalizeText(cell))
    .map((cell) => cell.match(/^(\d{4})[\/-]/)?.[1] ?? null)
    .find(Boolean);
  const fallbackYear = firstExplicitYear ? Number(firstExplicitYear) : undefined;
  const dateColumns = headerRow
    .map((cell, index) => ({
      index,
      date: parseDateHeader(cell, fallbackYear),
    }))
    .filter((entry): entry is { index: number; date: string } => Boolean(entry.date));

  if (dateColumns.length === 0) {
    return {
      normalized: [] as CreateTransactionInput[],
      errors: ["Workbook does not contain parsable date columns."],
      skipped: 0,
      sheetName,
    };
  }

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

    if (emitted === 0) {
      errors.push(`line ${line}: row has no importable daily amounts`);
    }
  });

  return {
    normalized,
    errors,
    skipped,
    sheetName,
  };
}
