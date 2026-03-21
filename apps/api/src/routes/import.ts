import { Hono } from "hono";
import type {
  CreateTransactionInput,
  TransactionCsvImportResponse,
} from "@hearth/shared";
import { parseCsv } from "../lib/csv";
import { parseSinopacTransactionsCsv } from "../lib/sinopac";
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
  createSupabaseAdminClient: ReturnType<ApiEnv["Variables"]["createSupabaseAdminClient"]>,
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

  const { error } = await supabase.from("transactions").insert(
    normalized.map((row) => ({
      account_id: row.account_id,
      date: row.date,
      amount: row.amount,
      currency: row.currency ?? "TWD",
      category: row.category ?? null,
      description: row.description ?? null,
      source: row.source ?? "csv_import",
    })),
  );

  if (error) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<TransactionCsvImportResponse>({
    source: "transactions-csv",
    imported: normalized.length,
    skipped: 0,
    failed: errors.length,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors,
  });
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
  const { normalized, errors } = parseSinopacTransactionsCsv(text, accountId);
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

  const { error } = await supabase.from("transactions").insert(
    normalized.map((row) => ({
      account_id: row.account_id,
      date: row.date,
      amount: row.amount,
      currency: row.currency ?? "TWD",
      category: row.category ?? null,
      description: row.description ?? null,
      source: row.source ?? "sinopac_bank",
    })),
  );

  if (error) {
    return c.json<TransactionCsvImportResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<TransactionCsvImportResponse>({
    source: "sinopac-tw",
    imported: normalized.length,
    skipped: 0,
    failed: errors.length,
    runtime: "cloudflare-worker",
    persistence: "supabase",
    status: "ok",
    errors,
  });
});
importRoutes.post("/excel-monthly", (c) =>
  c.json(createImportStub("excel-monthly")),
);
