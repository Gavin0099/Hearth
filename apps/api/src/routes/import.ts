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
import { parseMonthlyExcel } from "../lib/excel-monthly";
import { parseSinopacTransactionsCsv } from "../lib/sinopac";
import { parseSinopacStockCsv } from "../lib/sinopac-stock";
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
  source: "transactions-csv" | "sinopac-tw" | "credit-card-tw" | "excel-monthly",
  supabase: any,
  existingErrors: string[] = [],
  existingSkipped = 0,
  warnings: string[] = [],
  recurringCandidates: RecurringImportCandidate[] = [],
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
      skipped: existingSkipped + (withHashes.length - freshRows.length),
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
          { code: "validation_error", error: errors[0] ?? "CSV 沒有可匯入的交易行。", status: "error" },
          400,
        );
      }

      // Dedup by source_hash
      const sourceHashes = trades.map((t) => t.source_hash);
      const { data: existingRows, error: existingError } = await supabase
        .from("investment_trades")
        .select("source_hash")
        .in("source_hash", sourceHashes);

      if (existingError) {
        return c.json<StockTradeImportResponse>(
          { code: "database_error", error: existingError.message, status: "error" },
          500,
        );
      }

      const existingHashes = new Set(
        (existingRows ?? []).map((r: { source_hash: string }) => r.source_hash),
      );
      const freshTrades = trades.filter((t) => !existingHashes.has(t.source_hash));
      const skipped = trades.length - freshTrades.length;

      if (freshTrades.length > 0) {
        const { error: insertError } = await supabase.from("investment_trades").upsert(
          freshTrades.map((t) => ({
            account_id: t.account_id,
            trade_date: t.trade_date,
            ticker: t.ticker,
            name: t.name,
            action: t.action,
            shares: t.shares,
            price_per_share: t.price_per_share,
            fee: t.fee,
            tax: t.tax,
            currency: t.currency,
            source: t.source,
            source_hash: t.source_hash,
          })),
          { onConflict: "source_hash", ignoreDuplicates: true },
        );

        if (insertError) {
          return c.json<StockTradeImportResponse>(
            { code: "database_error", error: insertError.message, status: "error" },
            500,
          );
        }
      }

      // Recalculate holdings for affected tickers
      const affectedTickers = [...new Set(freshTrades.map((t) => t.ticker))];
      let holdingsRecalculated = 0;

      for (const ticker of affectedTickers) {
        const { data: allTrades, error: tradesError } = await supabase
          .from("investment_trades")
          .select("action, shares, price_per_share, name, currency")
          .eq("account_id", accountId)
          .eq("ticker", ticker)
          .order("trade_date", { ascending: true });

        if (tradesError) continue;

        let totalShares = 0;
        let weightedCost = 0;
        let name: string | null = null;
        let currency = "TWD";

        for (const trade of allTrades ?? []) {
          const s = Number(trade.shares);
          const p = Number(trade.price_per_share);
          if (!name && trade.name) name = trade.name;
          currency = trade.currency;

          if (trade.action === "buy") {
            const newTotal = totalShares + s;
            weightedCost = newTotal > 0 ? (weightedCost * totalShares + p * s) / newTotal : p;
            totalShares = newTotal;
          } else {
            totalShares = Math.max(0, totalShares - s);
          }
        }

        if (totalShares <= 0) {
          // Position fully closed — remove holding
          await supabase
            .from("holdings")
            .delete()
            .eq("account_id", accountId)
            .eq("ticker", ticker);
        } else {
          const { error: upsertError } = await supabase.from("holdings").upsert(
            {
              account_id: accountId,
              ticker,
              name,
              total_shares: totalShares,
              avg_cost: weightedCost,
              currency,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "account_id,ticker" },
          );
          if (!upsertError) holdingsRecalculated++;
        }
      }

      return c.json<StockTradeImportResponse>({
        source: "sinopac-stock",
        imported: freshTrades.length,
        skipped,
        failed: errors.length,
        holdingsRecalculated,
        runtime: "cloudflare-worker",
        persistence: "supabase",
        status: "ok",
        errors,
      });
    })(),
);

// POST /dividends-csv — import dividend records from CSV
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
      const supabase = createSupabaseAdminClient(c.env);

      // Verify account ownership
      const { data: account } = await supabase
        .from("accounts")
        .select("id")
        .eq("id", accountId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!account) {
        return c.json<DividendImportResponse>(
          { code: "validation_error", error: "Account not found or not owned by user.", status: "error" },
          400,
        );
      }

      const csvText = await file.text();
      const rows = parseCsv(csvText);

      const errors: string[] = [];
      const divRows: {
        account_id: string;
        ticker: string;
        pay_date: string;
        net_amount: number;
        gross_amount: number | null;
        tax_withheld: number;
        currency: string;
        source_hash: string;
      }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const line = i + 2;

        // Support both named columns and positional
        const ticker = (row["ticker"] ?? row["股票代號"] ?? row["代號"] ?? "").trim().toUpperCase();
        const payDate = (row["pay_date"] ?? row["配息日"] ?? row["發放日"] ?? "").trim();
        const netAmountRaw = (row["net_amount"] ?? row["實際入帳"] ?? row["淨額"] ?? "").replace(/,/g, "");
        const grossAmountRaw = (row["gross_amount"] ?? row["配息總額"] ?? row["毛額"] ?? "").replace(/,/g, "");
        const taxRaw = (row["tax_withheld"] ?? row["扣繳稅額"] ?? row["稅"] ?? "0").replace(/,/g, "");
        const currency = (row["currency"] ?? row["幣別"] ?? "TWD").trim();

        if (!ticker) { errors.push(`line ${line}: 缺少 ticker`); continue; }
        if (!payDate || !/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
          errors.push(`line ${line}: 無效日期 "${payDate}"（需 YYYY-MM-DD）`); continue;
        }
        const net_amount = parseFloat(netAmountRaw);
        if (isNaN(net_amount) || net_amount < 0) {
          errors.push(`line ${line}: 無效淨額 "${netAmountRaw}"`); continue;
        }
        const gross_amount = grossAmountRaw ? parseFloat(grossAmountRaw) : null;
        const tax_withheld = parseFloat(taxRaw) || 0;

        const hashKey = `dividends|${accountId}|${ticker}|${payDate}|${net_amount}`;
        const source_hash = btoa(unescape(encodeURIComponent(hashKey))).replace(/=/g, "").slice(0, 64);

        divRows.push({ account_id: accountId, ticker, pay_date: payDate, net_amount, gross_amount, tax_withheld, currency, source_hash });
      }

      if (divRows.length === 0) {
        return c.json<DividendImportResponse>(
          { code: "validation_error", error: "No valid rows found.", status: "error" },
          400,
        );
      }

      // Dedup: check existing source_hashes
      const hashes = divRows.map((r) => r.source_hash);
      const { data: existing } = await supabase
        .from("dividends")
        .select("source_hash")
        .in("source_hash", hashes);
      const existingSet = new Set((existing ?? []).map((r: { source_hash: string }) => r.source_hash));

      const newRows = divRows.filter((r) => !existingSet.has(r.source_hash));
      const skipped = divRows.length - newRows.length;

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
