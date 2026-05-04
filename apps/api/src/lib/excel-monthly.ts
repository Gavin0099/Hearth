import * as XLSX from "xlsx";
import type { CreateTransactionInput, RecurringImportCandidate } from "@hearth/shared";

const categoryAliases = ["分類", "category"];
const descriptionAliases = ["項目", "摘要", "內容", "description"];
const itemAliases = ["項目", "item"];
const amountAliases = ["金額", "amount"];

const categoryMap: Record<string, string> = {
  "飲食費用": "餐飲",
  "生活雜費": "生活購物",
  "交通花費": "交通",
};
const recurringSectionKeywords = [
  "固定支出",
  "週期支出",
  "常態收入",
  "常態扣除",
  "儲蓄",
  "定期定額",
];

type DateContext = {
  year?: number;
  month?: number;
};

type RecurringSectionContext = {
  section: string;
  active: boolean;
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

function parseDateHeader(value: unknown, context: DateContext = {}) {
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
  if (monthDayMatch && context.year) {
    const [, month, day] = monthDayMatch;
    return `${context.year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const dayOnlyMatch = text.match(/^(\d{1,2})$/);
  if (dayOnlyMatch && context.year && context.month) {
    const [, day] = dayOnlyMatch;
    return `${context.year}-${String(context.month).padStart(2, "0")}-${day.padStart(2, "0")}`;
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

function parseFormulaNumericLiteral(formula: string) {
  const normalized = formula.trim().replace(/^=/, "");
  if (!normalized) {
    return null;
  }

  const direct = Number(normalized.replace(/,/g, ""));
  if (Number.isFinite(direct) && direct !== 0) {
    return direct;
  }

  const sumMatch = normalized.match(/^SUM\((.+)\)$/i);
  if (!sumMatch) {
    return null;
  }

  const parts = sumMatch[1]
    .split(/[,;]/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  let total = 0;
  for (const part of parts) {
    const numeric = Number(part.replace(/,/g, ""));
    if (!Number.isFinite(numeric)) {
      return null;
    }
    total += numeric;
  }

  return total === 0 ? null : total;
}

function normalizeAmountWithFormula(value: unknown) {
  const amount = normalizeAmount(value);
  if (amount !== null) {
    return amount;
  }

  const text = normalizeText(value);
  if (!text.startsWith("=")) {
    return null;
  }

  const numeric = parseFormulaNumericLiteral(text);
  if (numeric === null) {
    return null;
  }

  return numeric > 0 ? -numeric : numeric;
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
  return dateColumns.some(({ index }) => normalizeAmountWithFormula(row[index]) !== null);
}

function hasValuesBeforeIndex(row: unknown[], endExclusive: number) {
  return row.slice(0, endExclusive).some((cell) => normalizeText(cell) !== "");
}

function detectSidebarCandidate(
  row: unknown[],
  endExclusive: number,
): Omit<RecurringImportCandidate, "sheet"> | null {
  const leftCells = row.slice(0, endExclusive).map((cell) => normalizeText(cell)).filter(Boolean);
  if (leftCells.length === 0) {
    return null;
  }

  const matchedSection = leftCells.find((cell) =>
    recurringSectionKeywords.some((keyword) => cell.includes(keyword)),
  );
  if (!matchedSection) {
    return null;
  }

  const detail = leftCells.find((cell) => cell !== matchedSection) ?? null;
  const amount = row
    .slice(0, endExclusive)
    .map((cell) => normalizeAmountWithFormula(cell))
    .find((value): value is number => value !== null) ?? null;
  return {
    kind: "recurring_sidebar",
    section: matchedSection,
    label: detail,
    amount,
  };
}

function detectRecurringSection(row: unknown[], endExclusive: number) {
  const leftCells = row.slice(0, endExclusive).map((cell) => normalizeText(cell)).filter(Boolean);
  return (
    leftCells.find((cell) =>
      recurringSectionKeywords.some((keyword) => cell.includes(keyword)),
    ) ?? null
  );
}

function pickRecurringDetailLabel(row: unknown[], endExclusive: number, section: string) {
  const leftCells = row.slice(0, endExclusive).map((cell) => normalizeText(cell)).filter(Boolean);
  return leftCells.find((cell) => cell !== section) ?? leftCells[0] ?? null;
}

function pickRecurringDetailAmount(row: unknown[], endExclusive: number) {
  return row
    .slice(0, endExclusive)
    .map((cell) => normalizeAmountWithFormula(cell))
    .find((value): value is number => value !== null) ?? null;
}

function formatSidebarWarning(candidate: Omit<RecurringImportCandidate, "sheet">) {
  const amountHint = candidate.amount !== null && candidate.amount !== undefined
    ? ` (${candidate.amount})`
    : "";
  return candidate.label
    ? `ignored recurring/sidebar row: ${candidate.section} / ${candidate.label}${amountHint}`
    : `ignored recurring/sidebar row: ${candidate.section}${amountHint}`;
}

function parseSheetDateContext(sheetName: string): DateContext {
  const fullMatch = sheetName.match(/(20\d{2})[^\d]?(\d{1,2})/);
  if (fullMatch) {
    return {
      year: Number(fullMatch[1]),
      month: Number(fullMatch[2]),
    };
  }

  const monthMatch = sheetName.match(/(\d{1,2})\s*月/);
  if (monthMatch) {
    return {
      month: Number(monthMatch[1]),
    };
  }

  return {};
}

function getDateContext(headerRow: unknown[], sheetName: string) {
  const sheetContext = parseSheetDateContext(sheetName);
  const firstExplicitYear = headerRow
    .map((cell) => normalizeText(cell))
    .map((cell) => cell.match(/^(\d{4})[\/-]/)?.[1] ?? null)
    .find(Boolean);

  const firstExplicitMonth = headerRow
    .map((cell) => normalizeText(cell))
    .map((cell) => {
      const match = cell.match(/^\d{4}[\/-](\d{1,2})[\/-]/) ?? cell.match(/^(\d{1,2})[\/-]\d{1,2}$/);
      return match?.[1] ?? null;
    })
    .find(Boolean);

  return {
    year: firstExplicitYear ? Number(firstExplicitYear) : sheetContext.year,
    month: firstExplicitMonth ? Number(firstExplicitMonth) : sheetContext.month,
  };
}

function buildDateColumns(headerRow: unknown[], sheetName: string) {
  const dateContext = getDateContext(headerRow, sheetName);
  return headerRow
    .map((cell, index) => ({
      index,
      date: parseDateHeader(cell, dateContext),
    }))
    .filter((entry): entry is { index: number; date: string } => Boolean(entry.date));
}

function parseCalendarPairColumns(
  rows: unknown[][],
  headerRowIndex: number,
  accountId: string,
  sheetName: string,
) {
  const headerRow = rows[headerRowIndex] as unknown[];
  const pairHeaderRow = rows[headerRowIndex + 1];
  if (!Array.isArray(pairHeaderRow)) {
    return null;
  }

  const dateContext = getDateContext(headerRow, sheetName);
  const normalizedItemAliases = itemAliases.map((alias) => alias.toLowerCase());
  const normalizedAmountAliases = amountAliases.map((alias) => alias.toLowerCase());

  const pairColumns = headerRow
    .map((cell, index) => {
      const date = parseDateHeader(cell, dateContext);
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
  const warnings = new Set<string>();
  const recurringCandidates = new Map<string, RecurringImportCandidate>();
  let skipped = 0;
  let activeCategory: string | null = null;
  let recurringSectionContext: RecurringSectionContext | null = null;

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
        normalizeText(row[itemIndex]) !== "" || normalizeAmountWithFormula(row[amountIndex]) !== null,
    );
    const sidebarCandidate = detectSidebarCandidate(row, leftBoundary);
    const recurringSection = detectRecurringSection(row, leftBoundary);

    if (leftLabel && !hasCalendarValues) {
      activeCategory = normalizeCategory(leftLabel);
      if (recurringSection) {
        recurringSectionContext = { section: recurringSection, active: true };
      } else if (activeCategory) {
        recurringSectionContext = null;
      }
      if (sidebarCandidate) {
        warnings.add(formatSidebarWarning(sidebarCandidate));
        recurringCandidates.set(
          `${sidebarCandidate.section}::${sidebarCandidate.label ?? ""}`,
          { ...sidebarCandidate, sheet: sheetName },
        );
      }
      skipped += 1;
      return;
    }

    if (hasCalendarValues) {
      recurringSectionContext = null;
    }

    let emitted = 0;
    pairColumns.forEach(({ date, itemIndex, amountIndex }) => {
      const description = normalizeText(row[itemIndex]);
      const amount = normalizeAmountWithFormula(row[amountIndex]);
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
      if (recurringSectionContext?.active) {
        const label = pickRecurringDetailLabel(row, leftBoundary, recurringSectionContext.section);
        if (label) {
          const candidate: Omit<RecurringImportCandidate, "sheet"> = {
            kind: "recurring_sidebar",
            section: recurringSectionContext.section,
            label,
            amount: pickRecurringDetailAmount(row, leftBoundary),
          };
          warnings.add(formatSidebarWarning(candidate));
          recurringCandidates.set(
            `${candidate.section}::${candidate.label ?? ""}`,
            { ...candidate, sheet: sheetName },
          );
        }
      }
      if (sidebarCandidate) {
        warnings.add(formatSidebarWarning(sidebarCandidate));
        recurringCandidates.set(
          `${sidebarCandidate.section}::${sidebarCandidate.label ?? ""}`,
          { ...sidebarCandidate, sheet: sheetName },
        );
      }
      skipped += 1;
    } else if (emitted === 0) {
      skipped += 1;
    }
  });

  return {
    normalized,
    errors,
    warnings: [...warnings],
    recurringCandidates: [...recurringCandidates.values()],
    skipped,
    sheetName: null as string | null,
  };
}

function parseGridColumns(
  rows: unknown[][],
  headerRowIndex: number,
  accountId: string,
  sheetName: string,
) {
  const headerRow = rows[headerRowIndex] as unknown[];
  const dateColumns = buildDateColumns(headerRow, sheetName);

  if (dateColumns.length === 0) {
    return null;
  }

  const firstDateIndex = dateColumns[0].index;
  const categoryIndex = getColumnIndex(headerRow, categoryAliases, 0);
  const descriptionIndex = getColumnIndex(headerRow, descriptionAliases, 1);

  const normalized: CreateTransactionInput[] = [];
  const errors: string[] = [];
  const warnings = new Set<string>();
  const recurringCandidates = new Map<string, RecurringImportCandidate>();
  let skipped = 0;
  let activeCategory: string | null = null;
  let recurringSectionContext: RecurringSectionContext | null = null;

  rows.slice(headerRowIndex + 1).forEach((row, offset) => {
    if (!Array.isArray(row) || isEmptyRow(row)) {
      skipped += 1;
      return;
    }

    const line = headerRowIndex + offset + 2;
    const rawCategory = normalizeText(row[categoryIndex]);
    const description = normalizeText(row[descriptionIndex]);
    const hasAmounts = rowHasAmounts(row, dateColumns);
    const sidebarCandidate = detectSidebarCandidate(row, firstDateIndex);
    const recurringSection = detectRecurringSection(row, firstDateIndex);

    if (rawCategory && !description && !hasAmounts) {
      activeCategory = normalizeCategory(rawCategory);
       if (recurringSection) {
        recurringSectionContext = { section: recurringSection, active: true };
      } else if (activeCategory) {
        recurringSectionContext = null;
      }
      if (sidebarCandidate) {
        warnings.add(formatSidebarWarning(sidebarCandidate));
        recurringCandidates.set(
          `${sidebarCandidate.section}::${sidebarCandidate.label ?? ""}`,
          { ...sidebarCandidate, sheet: sheetName },
        );
      }
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
      const amount = normalizeAmountWithFormula(row[index]);
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

    if (emitted > 0) {
      recurringSectionContext = null;
    }

    if (emitted === 0 && hasValuesBeforeIndex(row, firstDateIndex)) {
      if (recurringSectionContext?.active) {
        const label = pickRecurringDetailLabel(row, firstDateIndex, recurringSectionContext.section);
        if (label && label !== recurringSectionContext.section) {
          const candidate: Omit<RecurringImportCandidate, "sheet"> = {
            kind: "recurring_sidebar",
            section: recurringSectionContext.section,
            label,
            amount: pickRecurringDetailAmount(row, firstDateIndex),
          };
          warnings.add(formatSidebarWarning(candidate));
          recurringCandidates.set(
            `${candidate.section}::${candidate.label ?? ""}`,
            { ...candidate, sheet: sheetName },
          );
        }
      }
      if (sidebarCandidate) {
        warnings.add(formatSidebarWarning(sidebarCandidate));
        recurringCandidates.set(
          `${sidebarCandidate.section}::${sidebarCandidate.label ?? ""}`,
          { ...sidebarCandidate, sheet: sheetName },
        );
      }
      skipped += 1;
    } else if (emitted === 0) {
      errors.push(`line ${line}: row has no importable daily amounts`);
    }
  });

  return {
    normalized,
    errors,
    warnings: [...warnings],
    recurringCandidates: [...recurringCandidates.values()],
    skipped,
    sheetName: null as string | null,
  };
}

function parseMonthlySheet(rows: unknown[][], accountId: string, sheetName: string) {
  const headerRowIndex = rows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => parseDateHeader(cell, parseSheetDateContext(sheetName)) !== null),
  );

  if (headerRowIndex < 0) {
    return null;
  }

  const calendarPairResult = parseCalendarPairColumns(rows, headerRowIndex, accountId, sheetName);
  if (calendarPairResult) {
    return calendarPairResult;
  }

  return parseGridColumns(rows, headerRowIndex, accountId, sheetName);
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address] as { f?: string; v?: unknown; w?: string } | undefined;
      if (!cell || !cell.f || cell.v !== undefined || cell.w === undefined) {
        continue;
      }
      sheet[address] = { ...cell, v: `=${cell.f}` };
    }
  }

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
  const warnings = new Set<string>();
  const recurringCandidates = new Map<string, RecurringImportCandidate>();
  let skipped = 0;
  const parsedSheets: string[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheetToRows(sheet);

    const result = parseMonthlySheet(rows, accountId, sheetName);
    if (!result) {
      return;
    }

    normalized.push(...result.normalized);
    errors.push(...result.errors.map((message) => `[${sheetName}] ${message}`));
    result.warnings?.forEach((warning) => warnings.add(`[${sheetName}] ${warning}`));
    result.recurringCandidates?.forEach((candidate: RecurringImportCandidate) => {
      recurringCandidates.set(
        `${candidate.sheet}::${candidate.section}::${candidate.label ?? ""}`,
        candidate,
      );
    });
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
    warnings: [...warnings],
    recurringCandidates: [...recurringCandidates.values()],
    skipped,
    sheetName: parsedSheets.join(", "),
  };
}
