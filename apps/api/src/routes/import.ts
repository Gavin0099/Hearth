import { Hono } from "hono";
import type {
  CreateTransactionInput,
  DividendImportResponse,
  RecurringImportCandidate,
  StockTradeImportResponse,
  TransactionCsvImportResponse,
} from "@hearth/shared";
import { parseCsv } from "../lib/csv";
import { parseCreditCardTransactionsCsv } from "../lib/credit-card";
import { parseDividendsCsv, prepareDividendImportBatch } from "../lib/dividends";
import { parseMonthlyExcel } from "../lib/excel-monthly";
import { parseSinopacTransactionsCsv } from "../lib/sinopac";
import { parseSinopacStockCsv } from "../lib/sinopac-stock";
import { executeStockTradeImport } from "../lib/stock-import";
import { buildTransactionImportRows, prepareTransactionImportBatch } from "../lib/transaction-import";
import type { ApiEnv } from "../types";

const createImportStub = (source: string) => ({
  source,
  imported: 0,
  skipped: 0,
  failed: 0,
  runtime: "cloudflare-worker",
  persistence: "supabase",
  status: "stub",
});

export const importRoutes = new Hono<ApiEnv>();

async function resolveOwnedAccountIds(
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

async function importNormalizedRows(
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
      response: {
        code: "database_error" as const,
        error: existingError.message,
        status: "error" as const,
      },
      status: 500,
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
        response: {
          code: "database_error" as const,
          error: error.message,
          status: "error" as const,
        },
        status: 500,
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
    status: 200,
  };
}

function resolveTransactionsCsvSource(rawValue: FormDataEntryValue | null) {
  const value = String(rawValue ?? "").trim();
  if (!value) {
    return "csv_import";
  }

  const allowed = [
    "csv_import",
    "gmail_pdf_sinopac",
    "gmail_pdf_esun",
    "gmail_pdf_cathay",
    "gmail_pdf_taishin",
    "gmail_pdf_ctbc",
    "gmail_pdf_mega",
    "gmail_bank_sinopac",
    "gmail_bank_esun",
    "gmail_bank_cathay",
    "gmail_bank_taishin",
    "gmail_bank_ctbc",
    "gmail_bank_mega",
  ];
  return allowed.includes(value) ? value : "csv_import";
}

importRoutes.post("/transactions-csv", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  const formData = await c.req.formData();
  const accountId = String(formData.get("account_id") ?? "").trim();
  const file = formData.get("file");
  const importSource = resolveTransactionsCsvSource(formData.get("source"));

  if (!accountId) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "account_id is required.",
        status: "error",
      },
      400,
    );
  }

  if (!(file instanceof File)) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "CSV file is required.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
    user.id,
    createSupabaseAdminClient,
    c.env,
  );

  if (accountsError) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
  if (!accountIds.has(accountId)) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "Selected account does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "CSV has no data rows.",
        status: "error",
      },
      400,
    );
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
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: errors[0] ?? "CSV rows are invalid.",
        status: "error",
      },
      400,
    );
  }

  const result = await importNormalizedRows(
    normalized,
    "transactions-csv",
    supabase,
    errors,
  );
  return c.json<TransactionCsvImportResponse>(result.response, result.status as 200 | 500);
});

importRoutes.post("/sinopac-tw", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  const formData = await c.req.formData();
  const accountId = String(formData.get("account_id") ?? "").trim();
  const file = formData.get("file");

  if (!accountId) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "account_id is required.",
        status: "error",
      },
      400,
    );
  }

  if (!(file instanceof File)) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "CSV file is required.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
    user.id,
    createSupabaseAdminClient,
    c.env,
  );

  if (accountsError) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
  if (!accountIds.has(accountId)) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "Selected account does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  const text = await file.text();
  const { normalized, errors, skipped } = parseSinopacTransactionsCsv(text, accountId);
  if (normalized.length === 0) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: errors[0] ?? "Sinopac CSV rows are invalid.",
        status: "error",
      },
      400,
    );
  }

  const result = await importNormalizedRows(
    normalized,
    "sinopac-tw",
    supabase,
    errors,
    skipped,
  );
  return c.json<TransactionCsvImportResponse>(result.response, result.status as 200 | 500);
});

importRoutes.post("/credit-card-tw", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  const formData = await c.req.formData();
  const accountId = String(formData.get("account_id") ?? "").trim();
  const file = formData.get("file");

  if (!accountId) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "account_id is required.",
        status: "error",
      },
      400,
    );
  }

  if (!(file instanceof File)) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "CSV file is required.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
    user.id,
    createSupabaseAdminClient,
    c.env,
  );

  if (accountsError) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
  if (!accountIds.has(accountId)) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: "Selected account does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  const text = await file.text();
  const { normalized, errors, skipped } = parseCreditCardTransactionsCsv(text, accountId);
  if (normalized.length === 0) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "validation_error",
        error: errors[0] ?? "Credit card CSV rows are invalid.",
        status: "error",
      },
      400,
    );
  }

  const result = await importNormalizedRows(
    normalized,
    "credit-card-tw",
    supabase,
    errors,
    skipped,
  );
  return c.json<TransactionCsvImportResponse>(result.response, result.status as 200 | 500);
});
importRoutes.post("/excel-monthly", (c) =>
  (async () => {
    const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
    const user = await resolveAuthenticatedUser(c.req.raw, c.env);
    if (!user) {
      return c.json<TransactionCsvImportResponse>(
        {
          code: "unauthorized",
          error: "Missing or invalid Supabase bearer token.",
          status: "error",
        },
        401,
      );
    }

    const formData = await c.req.formData();
    const accountId = String(formData.get("account_id") ?? "").trim();
    const file = formData.get("file");

    if (!accountId) {
      return c.json<TransactionCsvImportResponse>(
        {
          code: "validation_error",
          error: "account_id is required.",
          status: "error",
        },
        400,
      );
    }

    if (!(file instanceof File)) {
      return c.json<TransactionCsvImportResponse>(
        {
          code: "validation_error",
          error: "Excel file is required.",
          status: "error",
        },
        400,
      );
    }

    const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
    const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
      user.id,
      createSupabaseAdminClient,
      c.env,
    );

    if (accountsError) {
      return c.json<TransactionCsvImportResponse>(
        {
          code: "database_error",
          error: accountsError.message,
          status: "error",
        },
        500,
      );
    }

    const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
    if (!accountIds.has(accountId)) {
      return c.json<TransactionCsvImportResponse>(
        {
          code: "validation_error",
          error: "Selected account does not belong to the current user.",
          status: "error",
        },
        400,
      );
    }

    const buffer = await file.arrayBuffer();
    const { normalized, errors, skipped, warnings, recurringCandidates } = parseMonthlyExcel(buffer, accountId);
    if (normalized.length === 0) {
      return c.json<TransactionCsvImportResponse>(
        {
          code: "validation_error",
          error: errors[0] ?? "Excel workbook rows are invalid.",
          status: "error",
        },
        400,
      );
    }

    const result = await importNormalizedRows(
      normalized,
      "excel-monthly",
      supabase,
      errors,
      skipped,
      warnings,
      recurringCandidates,
    );
    return c.json<TransactionCsvImportResponse>(result.response, result.status as 200 | 500);
  })(),
);

importRoutes.post(
  "/sinopac-stock",
  async (c): Promise<Response> =>
    (async () => {
      const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
      const user = await resolveAuthenticatedUser(c.req.raw, c.env);
      if (!user) {
        return c.json<StockTradeImportResponse>(
          { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
          401,
        );
      }

      const formData = await c.req.formData();
      const accountId = String(formData.get("account_id") ?? "").trim();
      const file = formData.get("file");

      if (!accountId) {
        return c.json<StockTradeImportResponse>(
          { code: "validation_error", error: "account_id is required.", status: "error" },
          400,
        );
      }

      if (!(file instanceof File)) {
        return c.json<StockTradeImportResponse>(
          { code: "validation_error", error: "CSV file is required.", status: "error" },
          400,
        );
      }

      const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
      const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
        user.id,
        createSupabaseAdminClient,
        c.env,
      );

      if (accountsError) {
        return c.json<StockTradeImportResponse>(
          { code: "database_error", error: accountsError.message, status: "error" },
          500,
        );
      }

      const accountIds = new Set((ownedAccounts ?? []).map((a: { id: string }) => a.id));
      if (!accountIds.has(accountId)) {
        return c.json<StockTradeImportResponse>(
          { code: "validation_error", error: "Selected account does not belong to the current user.", status: "error" },
          400,
        );
      }

      const text = await file.text();
      const { trades, errors } = parseSinopacStockCsv(text, accountId);

      if (trades.length === 0) {
        return c.json<StockTradeImportResponse>(
          { code: "validation_error", error: errors[0] ?? "CSV rows are invalid.", status: "error" },
          400,
        );
      }

      const importResult = await executeStockTradeImport({
        supabase,
        accountId,
        source: "sinopac-stock",
        trades,
        errors,
      });
      return c.json<StockTradeImportResponse>(importResult.response, importResult.status);
    })(),
);

importRoutes.post(
  "/foreign-stock-csv",
  async (c): Promise<Response> =>
    (async () => {
      const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
      const user = await resolveAuthenticatedUser(c.req.raw, c.env);
      if (!user) {
        return c.json<StockTradeImportResponse>(
          { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
          401,
        );
      }

      const formData = await c.req.formData();
      const accountId = String(formData.get("account_id") ?? "").trim();
      const file = formData.get("file");

      if (!accountId) {
        return c.json<StockTradeImportResponse>(
          { code: "validation_error", error: "account_id is required.", status: "error" },
          400,
        );
      }

      if (!(file instanceof File)) {
        return c.json<StockTradeImportResponse>(
          { code: "validation_error", error: "CSV file is required.", status: "error" },
          400,
        );
      }

      const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
      const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
        user.id,
        createSupabaseAdminClient,
        c.env,
      );

      if (accountsError) {
        return c.json<StockTradeImportResponse>(
          { code: "database_error", error: accountsError.message, status: "error" },
          500,
        );
      }

      const accountIds = new Set((ownedAccounts ?? []).map((a: { id: string }) => a.id));
      if (!accountIds.has(accountId)) {
        return c.json<StockTradeImportResponse>(
          { code: "validation_error", error: "Selected account does not belong to the current user.", status: "error" },
          400,
        );
      }

      const text = await file.text();
      const { trades, errors } = parseSinopacStockCsv(text, accountId);

      if (trades.length === 0) {
        return c.json<StockTradeImportResponse>(
          { code: "validation_error", error: errors[0] ?? "Foreign stock CSV rows are invalid.", status: "error" },
          400,
        );
      }

      const normalizedTrades = trades.map((trade) => ({
        ...trade,
        source: "foreign-stock-csv" as const,
      }));

      const importResult = await executeStockTradeImport({
        supabase,
        accountId,
        source: "foreign-stock-csv",
        trades: normalizedTrades,
        errors,
      });
      return c.json<StockTradeImportResponse>(importResult.response, importResult.status);
    })(),
);

// POST /dividends-csv - import dividend records from CSV
// Expected columns: ticker,pay_date,net_amount[,gross_amount][,tax_withheld][,currency]
importRoutes.post(
  "/dividends-csv",
  async (c): Promise<Response> =>
    (async () => {
      const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
      const user = await resolveAuthenticatedUser(c.req.raw, c.env);
      if (!user) {
        return c.json<DividendImportResponse>(
          { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
          401,
        );
      }

      const formData = await c.req.formData();
      const accountId = String(formData.get("account_id") ?? "").trim();
      const file = formData.get("file");

      if (!accountId || !(file instanceof File)) {
        return c.json<DividendImportResponse>(
          { code: "validation_error", error: "account_id and file are required.", status: "error" },
          400,
        );
      }

      const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
      const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
        user.id,
        createSupabaseAdminClient,
        c.env,
      );

      if (accountsError) {
        return c.json<DividendImportResponse>(
          { code: "database_error", error: accountsError.message, status: "error" },
          500,
        );
      }

      const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
      if (!accountIds.has(accountId)) {
        return c.json<DividendImportResponse>(
          { code: "validation_error", error: "Selected account does not belong to the current user.", status: "error" },
          400,
        );
      }

      const csvText = await file.text();
      const parsedDividends = parseDividendsCsv(csvText, accountId);
      const errors = [...parsedDividends.errors];
      const divRows = parsedDividends.rows;

      if (divRows.length === 0) {
        return c.json<DividendImportResponse>(
          { code: "validation_error", error: "No valid rows found.", status: "error" },
          400,
        );
      }

      const hashes = divRows.map((r) => r.source_hash);
      const { data: existing } = await supabase
        .from("dividends")
        .select("source_hash")
        .in("source_hash", hashes);
      const { freshRows: newRows, skipped } = prepareDividendImportBatch(
        divRows,
        (existing ?? []).map((r: { source_hash: string }) => r.source_hash),
      );

      if (newRows.length > 0) {
        const { error: insertError } = await supabase.from("dividends").insert(newRows);
        if (insertError) {
          return c.json<DividendImportResponse>(
            { code: "database_error", error: insertError.message, status: "error" },
            500,
          );
        }
      }

      return c.json<DividendImportResponse>({
        source: "dividends-csv",
        imported: newRows.length,
        skipped,
        failed: errors.length,
        runtime: "cloudflare-worker",
        persistence: "supabase",
        status: "ok",
        errors,
      });
    })(),
);
