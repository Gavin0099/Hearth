import { Hono } from "hono";
import type {
  CreateTransactionInput,
  TransactionCsvImportResponse,
} from "@hearth/shared";
import { parseCsv } from "../lib/csv";
import { parseMonthlyExcel } from "../lib/excel-monthly";
import { parseSinopacTransactionsCsv } from "../lib/sinopac";
import { buildTransactionSourceHash } from "../lib/transaction-hash";
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
  source: "transactions-csv" | "sinopac-tw" | "excel-monthly",
  supabase: any,
  existingErrors: string[] = [],
  existingSkipped = 0,
) {
  const withHashes = rows.map((row) => ({
    ...row,
    source_hash: buildTransactionSourceHash(row),
  }));

  const sourceHashes = withHashes.map((row) => row.source_hash);
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

  const existingHashes = new Set(
    (existing ?? []).map((item: { source_hash: string | null }) => item.source_hash).filter(Boolean),
  );
  const freshRows = withHashes.filter((row) => !existingHashes.has(row.source_hash));

  if (freshRows.length > 0) {
    const { error } = await supabase.from("transactions").insert(
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
      skipped: existingSkipped + (withHashes.length - freshRows.length),
      failed: existingErrors.length,
      runtime: "cloudflare-worker" as const,
      persistence: "supabase" as const,
      status: "ok" as const,
      errors: existingErrors,
    },
    status: 200,
  };
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
      source: "csv_import",
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
    const { normalized, errors, skipped } = parseMonthlyExcel(buffer, accountId);
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
    );
    return c.json<TransactionCsvImportResponse>(result.response, result.status as 200 | 500);
  })(),
);
