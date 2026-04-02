import type { Context } from "hono";
import type {
  CreateTransactionInput,
  RecurringImportCandidate,
} from "@hearth/shared";
import { parseCreditCardTransactionsCsv } from "./credit-card";
import { parseCsv } from "./csv";
import { parseDividendsCsv, prepareDividendImportBatch } from "./dividends";
import { parseMonthlyExcel } from "./excel-monthly";
import { parseSinopacTransactionsCsv } from "./sinopac";
import { parseSinopacStockCsv } from "./sinopac-stock";
import { executeStockTradeImport } from "./stock-import";
import { buildTransactionImportRows, prepareTransactionImportBatch } from "./transaction-import";
import type { ApiEnv } from "../types";

export type ImportRouteContext = Context<ApiEnv>;

export type ImportErrorResponse = {
  code: "unauthorized" | "validation_error" | "database_error";
  error: string;
  status: "error";
};

export type ParsedTransactionImport = {
  normalized: CreateTransactionInput[];
  errors: string[];
  skipped: number;
  warnings?: string[];
  recurringCandidates?: RecurringImportCandidate[];
};

export type ImportPreviewSuccess = {
  source:
    | "transactions-csv"
    | "sinopac-tw"
    | "credit-card-tw"
    | "excel-monthly"
    | "sinopac-stock"
    | "foreign-stock-csv"
    | "dividends-csv";
  validRows: number;
  failedRows: number;
  skipped: number;
  estimatedRows: number;
  columns: string[];
  sampleRows: string[][];
  warnings?: string[];
  errors: string[];
  recurringCandidates?: RecurringImportCandidate[];
  status: "ok";
};

function previewCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildPreviewRows(
  columns: string[],
  rows: Array<Record<string, unknown>>,
  limit = 5,
): string[][] {
  return rows.slice(0, limit).map((row) => columns.map((column) => previewCell(row[column])));
}

export function unauthorizedImportResponse(): ImportErrorResponse {
  return {
    code: "unauthorized",
    error: "Missing or invalid Supabase bearer token.",
    status: "error",
  };
}

export function validationImportResponse(error: string): ImportErrorResponse {
  return {
    code: "validation_error",
    error,
    status: "error",
  };
}

export function databaseImportResponse(error: string): ImportErrorResponse {
  return {
    code: "database_error",
    error,
    status: "error",
  };
}

export async function readOwnedImportFile(
  c: ImportRouteContext,
  fileLabel: "CSV" | "Excel",
) {
  const formData = await c.req.formData();
  const accountId = String(formData.get("account_id") ?? "").trim();
  const file = formData.get("file");

  if (!accountId) {
    return {
      ok: false as const,
      error: validationImportResponse("account_id is required."),
      status: 400 as const,
    };
  }

  if (!(file instanceof File)) {
    return {
      ok: false as const,
      error: validationImportResponse(`${fileLabel} file is required.`),
      status: 400 as const,
    };
  }

  return {
    ok: true as const,
    accountId,
    file,
    formData,
  };
}

export async function resolveOwnedAccountIds(
  userId: string,
  createSupabaseAdminClient: ApiEnv["Variables"]["createSupabaseAdminClient"],
  env: ApiEnv["Bindings"],
) {
  const supabase = createSupabaseAdminClient(env);
  const { data: ownedAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId);

  return {
    supabase,
    ownedAccounts,
    accountsError,
  };
}

export async function resolveOwnedImportContext(
  c: ImportRouteContext,
  userId: string,
  accountId: string,
) {
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
    userId,
    createSupabaseAdminClient,
    c.env,
  );

  if (accountsError) {
    return {
      ok: false as const,
      error: databaseImportResponse(accountsError.message),
      status: 500 as const,
    };
  }

  const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
  if (!accountIds.has(accountId)) {
    return {
      ok: false as const,
      error: validationImportResponse("Selected account does not belong to the current user."),
      status: 400 as const,
    };
  }

  return {
    ok: true as const,
    supabase,
    accountIds,
  };
}

export async function importNormalizedRows(
  rows: CreateTransactionInput[],
  source: "transactions-csv" | "sinopac-tw" | "credit-card-tw" | "excel-monthly",
  supabase: any,
  existingErrors: string[] = [],
  existingSkipped = 0,
  warnings: string[] = [],
  recurringCandidates: RecurringImportCandidate[] = [],
) {
  const importRows = buildTransactionImportRows(rows);
  const sourceHashes = importRows.map((row) => row.source_hash);
  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("source_hash")
    .in("source_hash", sourceHashes);

  if (existingError) {
    return {
      response: databaseImportResponse(existingError.message),
      status: 500 as const,
    };
  }

  const { freshRows, skipped } = prepareTransactionImportBatch(
    importRows,
    (existing ?? []).map((item: { source_hash: string | null }) => item.source_hash).filter(Boolean),
  );

  if (freshRows.length > 0) {
    const { error } = await supabase.from("transactions").upsert(
      freshRows.map((row) => ({
        account_id: row.account_id,
        date: row.date,
        amount: row.amount,
        currency: row.currency ?? "TWD",
        category: row.category ?? null,
        description: row.description ?? null,
        source: row.source ?? source,
        source_hash: row.source_hash,
      })),
      { onConflict: "source_hash", ignoreDuplicates: true },
    );

    if (error) {
      return {
        response: databaseImportResponse(error.message),
        status: 500 as const,
      };
    }
  }

  return {
    response: {
      source,
      imported: freshRows.length,
      skipped: existingSkipped + skipped,
      failed: existingErrors.length,
      runtime: "cloudflare-worker" as const,
      persistence: "supabase" as const,
      status: "ok" as const,
      errors: existingErrors,
      warnings,
      recurringCandidates,
    },
    status: 200 as const,
  };
}

export async function importParsedTransactionRows(
  file: File,
  accountId: string,
  supabase: any,
  source: "sinopac-tw" | "credit-card-tw" | "excel-monthly",
  invalidMessage: string,
  parse: (payload: string | ArrayBuffer, accountId: string) => ParsedTransactionImport,
) {
  const payload = source === "excel-monthly" ? await file.arrayBuffer() : await file.text();
  const {
    normalized,
    errors,
    skipped,
    warnings = [],
    recurringCandidates = [],
  } = parse(payload, accountId);

  if (normalized.length === 0) {
    return {
      response: validationImportResponse(errors[0] ?? invalidMessage),
      status: 400 as const,
    };
  }

  return importNormalizedRows(
    normalized,
    source,
    supabase,
    errors,
    skipped,
    warnings,
    recurringCandidates,
  );
}

export async function importParsedStockTrades(
  file: File,
  accountId: string,
  supabase: any,
  source: "sinopac-stock" | "foreign-stock-csv",
  invalidMessage: string,
) {
  const text = await file.text();
  const { trades, errors } = parseSinopacStockCsv(text, accountId);

  if (trades.length === 0) {
    return {
      response: validationImportResponse(errors[0] ?? invalidMessage),
      status: 400 as const,
    };
  }

  const importResult = await executeStockTradeImport({
    supabase,
    accountId,
    source,
    trades: source === "foreign-stock-csv"
      ? trades.map((trade) => ({ ...trade, source: "foreign-stock-csv" as const }))
      : trades,
    errors,
  });

  return importResult;
}

export async function importTransactionsCsvRows(
  file: File,
  accountId: string,
  supabase: any,
  importSource: string,
) {
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return {
      response: validationImportResponse("CSV has no data rows."),
      status: 400 as const,
    };
  }

  const normalized: CreateTransactionInput[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const date = String(row.date ?? "").trim();
    const amount = Number(String(row.amount ?? "").trim());
    const currency = String(row.currency ?? "TWD").trim().toUpperCase();
    const category = String(row.category ?? "").trim() || null;
    const description = String(row.description ?? "").trim() || null;

    if (!date) {
      errors.push(`line ${line}: date is required`);
      return;
    }

    if (!Number.isFinite(amount) || amount === 0) {
      errors.push(`line ${line}: amount must be a non-zero number`);
      return;
    }

    normalized.push({
      account_id: accountId,
      date,
      amount,
      currency,
      category,
      description,
      source: importSource,
    });
  });

  if (normalized.length === 0) {
    return {
      response: validationImportResponse(errors[0] ?? "CSV rows are invalid."),
      status: 400 as const,
    };
  }

  return importNormalizedRows(
    normalized,
    "transactions-csv",
    supabase,
    errors,
  );
}

export async function importDividendRows(
  file: File,
  accountId: string,
  supabase: any,
) {
  const csvText = await file.text();
  const parsedDividends = parseDividendsCsv(csvText, accountId);
  const errors = [...parsedDividends.errors];
  const divRows = parsedDividends.rows;

  if (divRows.length === 0) {
    return {
      response: validationImportResponse("No valid rows found."),
      status: 400 as const,
    };
  }

  const hashes = divRows.map((row) => row.source_hash);
  const { data: existing, error: existingError } = await supabase
    .from("dividends")
    .select("source_hash")
    .in("source_hash", hashes);

  if (existingError) {
    return {
      response: databaseImportResponse(existingError.message),
      status: 500 as const,
    };
  }

  const { freshRows, skipped } = prepareDividendImportBatch(
    divRows,
    (existing ?? []).map((row: { source_hash: string }) => row.source_hash),
  );

  if (freshRows.length > 0) {
    const { error: insertError } = await supabase.from("dividends").insert(freshRows);
    if (insertError) {
      return {
        response: databaseImportResponse(insertError.message),
        status: 500 as const,
      };
    }
  }

  return {
    response: {
      source: "dividends-csv" as const,
      imported: freshRows.length,
      skipped,
      failed: errors.length,
      runtime: "cloudflare-worker" as const,
      persistence: "supabase" as const,
      status: "ok" as const,
      errors,
    },
    status: 200 as const,
  };
}

export async function previewImportFile(
  file: File,
  accountId: string,
  importMode:
    | "transactions-csv"
    | "sinopac-tw"
    | "credit-card-tw"
    | "excel-monthly"
    | "sinopac-stock"
    | "foreign-stock-csv"
    | "dividends-csv",
  importSource = "csv_import",
) {
  if (importMode === "transactions-csv") {
    const text = await file.text();
    const rows = parseCsv(text);
    const normalized: CreateTransactionInput[] = [];
    const errors: string[] = [];

    rows.forEach((row, index) => {
      const line = index + 2;
      const date = String(row.date ?? "").trim();
      const amount = Number(String(row.amount ?? "").trim());
      const currency = String(row.currency ?? "TWD").trim().toUpperCase();
      const category = String(row.category ?? "").trim() || null;
      const description = String(row.description ?? "").trim() || null;

      if (!date) {
        errors.push(`line ${line}: date is required`);
        return;
      }

      if (!Number.isFinite(amount) || amount === 0) {
        errors.push(`line ${line}: amount must be a non-zero number`);
        return;
      }

      normalized.push({
        account_id: accountId,
        date,
        amount,
        currency,
        category,
        description,
        source: importSource,
      });
    });

    const columns = ["date", "amount", "currency", "category", "description", "source"];
    return {
      response: {
        source: "transactions-csv" as const,
        validRows: normalized.length,
        failedRows: errors.length,
        skipped: 0,
        estimatedRows: rows.length,
        columns,
        sampleRows: buildPreviewRows(columns, normalized as Array<Record<string, unknown>>),
        errors,
        status: "ok" as const,
      },
      status: 200 as const,
    };
  }

  if (importMode === "sinopac-tw" || importMode === "credit-card-tw" || importMode === "excel-monthly") {
    const parsed =
      importMode === "sinopac-tw"
        ? parseSinopacTransactionsCsv(await file.text(), accountId)
        : importMode === "credit-card-tw"
          ? parseCreditCardTransactionsCsv(await file.text(), accountId)
          : parseMonthlyExcel(await file.arrayBuffer(), accountId);
    const warnings: string[] = "warnings" in parsed ? ((parsed.warnings ?? []) as string[]) : [];
    const recurringCandidates: RecurringImportCandidate[] =
      "recurringCandidates" in parsed
        ? ((parsed.recurringCandidates ?? []) as RecurringImportCandidate[])
        : [];

    const columns = ["date", "amount", "currency", "category", "description", "source"];
    return {
      response: {
        source: importMode,
        validRows: parsed.normalized.length,
        failedRows: parsed.errors.length,
        skipped: parsed.skipped,
        estimatedRows: parsed.normalized.length + parsed.errors.length + parsed.skipped,
        columns,
        sampleRows: buildPreviewRows(columns, parsed.normalized as Array<Record<string, unknown>>),
        warnings,
        errors: parsed.errors,
        recurringCandidates,
        status: "ok" as const,
      },
      status: 200 as const,
    };
  }

  if (importMode === "sinopac-stock" || importMode === "foreign-stock-csv") {
    const parsed = parseSinopacStockCsv(await file.text(), accountId);
    const rows =
      importMode === "foreign-stock-csv"
        ? parsed.trades.map((trade) => ({
            ...trade,
            price: trade.price_per_share,
            source: "foreign-stock-csv",
          }))
        : parsed.trades.map((trade) => ({
            ...trade,
            price: trade.price_per_share,
          }));
    const columns = ["trade_date", "ticker", "action", "shares", "price", "fee", "tax", "currency"];
    return {
      response: {
        source: importMode,
        validRows: rows.length,
        failedRows: parsed.errors.length,
        skipped: 0,
        estimatedRows: rows.length + parsed.errors.length,
        columns,
        sampleRows: buildPreviewRows(columns, rows as Array<Record<string, unknown>>),
        errors: parsed.errors,
        status: "ok" as const,
      },
      status: 200 as const,
    };
  }

  const parsedDividends = parseDividendsCsv(await file.text(), accountId);
  const columns = ["ticker", "pay_date", "gross_amount", "tax_withheld", "net_amount", "currency"];
  return {
    response: {
      source: "dividends-csv" as const,
      validRows: parsedDividends.rows.length,
      failedRows: parsedDividends.errors.length,
      skipped: 0,
      estimatedRows: parsedDividends.rows.length + parsedDividends.errors.length,
      columns,
      sampleRows: buildPreviewRows(columns, parsedDividends.rows as Array<Record<string, unknown>>),
      errors: parsedDividends.errors,
      status: "ok" as const,
    },
    status: 200 as const,
  };
}
