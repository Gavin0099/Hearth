import { Hono } from "hono";
import type {
  DividendImportResponse,
  StockTradeImportResponse,
  TransactionCsvImportResponse,
} from "@hearth/shared";
import { parseCreditCardTransactionsCsv } from "../lib/credit-card";
import { parseMonthlyExcel } from "../lib/excel-monthly";
import {
  importDividendRows,
  importParsedStockTrades,
  importParsedTransactionRows,
  importTransactionsCsvRows,
  readOwnedImportFile,
  resolveOwnedImportContext,
  unauthorizedImportResponse,
} from "../lib/import-workflows";
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
    return c.json<TransactionCsvImportResponse>(unauthorizedImportResponse(), 401);
  }

  const requestData = await readOwnedImportFile(c, "CSV");
  if (!requestData.ok) {
    return c.json<TransactionCsvImportResponse>(requestData.error, requestData.status);
  }

  const { accountId, file, formData } = requestData;
  const importSource = resolveTransactionsCsvSource(formData.get("source"));

  const importContext = await resolveOwnedImportContext(c, user.id, accountId);
  if (!importContext.ok) {
    return c.json<TransactionCsvImportResponse>(importContext.error, importContext.status);
  }
  const { supabase } = importContext;

  const result = await importTransactionsCsvRows(file, accountId, supabase, importSource);
  return c.json<TransactionCsvImportResponse>(result.response, result.status as 200 | 500);
});

importRoutes.post("/sinopac-tw", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<TransactionCsvImportResponse>(unauthorizedImportResponse(), 401);
  }

  const requestData = await readOwnedImportFile(c, "CSV");
  if (!requestData.ok) {
    return c.json<TransactionCsvImportResponse>(requestData.error, requestData.status);
  }
  const { accountId, file } = requestData;

  const importContext = await resolveOwnedImportContext(c, user.id, accountId);
  if (!importContext.ok) {
    return c.json<TransactionCsvImportResponse>(importContext.error, importContext.status);
  }
  const { supabase } = importContext;

  const result = await importParsedTransactionRows(
    file,
    accountId,
    supabase,
    "sinopac-tw",
    "Sinopac CSV rows are invalid.",
    (payload, ownedAccountId) => parseSinopacTransactionsCsv(String(payload), ownedAccountId),
  );
  return c.json<TransactionCsvImportResponse>(result.response, result.status as 200 | 500);
});

importRoutes.post("/credit-card-tw", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<TransactionCsvImportResponse>(unauthorizedImportResponse(), 401);
  }

  const requestData = await readOwnedImportFile(c, "CSV");
  if (!requestData.ok) {
    return c.json<TransactionCsvImportResponse>(requestData.error, requestData.status);
  }
  const { accountId, file } = requestData;

  const importContext = await resolveOwnedImportContext(c, user.id, accountId);
  if (!importContext.ok) {
    return c.json<TransactionCsvImportResponse>(importContext.error, importContext.status);
  }
  const { supabase } = importContext;

  const result = await importParsedTransactionRows(
    file,
    accountId,
    supabase,
    "credit-card-tw",
    "Credit card CSV rows are invalid.",
    (payload, ownedAccountId) => parseCreditCardTransactionsCsv(String(payload), ownedAccountId),
  );
  return c.json<TransactionCsvImportResponse>(result.response, result.status as 200 | 500);
});
importRoutes.post("/excel-monthly", (c) =>
  (async () => {
    const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
    const user = await resolveAuthenticatedUser(c.req.raw, c.env);
    if (!user) {
      return c.json<TransactionCsvImportResponse>(unauthorizedImportResponse(), 401);
    }

    const requestData = await readOwnedImportFile(c, "Excel");
    if (!requestData.ok) {
      return c.json<TransactionCsvImportResponse>(requestData.error, requestData.status);
    }
    const { accountId, file } = requestData;

    const importContext = await resolveOwnedImportContext(c, user.id, accountId);
    if (!importContext.ok) {
      return c.json<TransactionCsvImportResponse>(importContext.error, importContext.status);
    }
    const { supabase } = importContext;

    const result = await importParsedTransactionRows(
      file,
      accountId,
      supabase,
      "excel-monthly",
      "Excel workbook rows are invalid.",
      (payload, ownedAccountId) => parseMonthlyExcel(payload as ArrayBuffer, ownedAccountId),
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
        return c.json<StockTradeImportResponse>(unauthorizedImportResponse(), 401);
      }

      const requestData = await readOwnedImportFile(c, "CSV");
      if (!requestData.ok) {
        return c.json<StockTradeImportResponse>(requestData.error, requestData.status);
      }
      const { accountId, file } = requestData;

      const importContext = await resolveOwnedImportContext(c, user.id, accountId);
      if (!importContext.ok) {
        return c.json<StockTradeImportResponse>(importContext.error, importContext.status);
      }
      const { supabase } = importContext;

      const importResult = await importParsedStockTrades(
        file,
        accountId,
        supabase,
        "sinopac-stock",
        "CSV rows are invalid.",
      );
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
        return c.json<StockTradeImportResponse>(unauthorizedImportResponse(), 401);
      }

      const requestData = await readOwnedImportFile(c, "CSV");
      if (!requestData.ok) {
        return c.json<StockTradeImportResponse>(requestData.error, requestData.status);
      }
      const { accountId, file } = requestData;

      const importContext = await resolveOwnedImportContext(c, user.id, accountId);
      if (!importContext.ok) {
        return c.json<StockTradeImportResponse>(importContext.error, importContext.status);
      }
      const { supabase } = importContext;

      const importResult = await importParsedStockTrades(
        file,
        accountId,
        supabase,
        "foreign-stock-csv",
        "Foreign stock CSV rows are invalid.",
      );
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
        return c.json<DividendImportResponse>(unauthorizedImportResponse(), 401);
      }

      const requestData = await readOwnedImportFile(c, "CSV");
      if (!requestData.ok) {
        return c.json<DividendImportResponse>(requestData.error, requestData.status);
      }
      const { accountId, file } = requestData;

      const importContext = await resolveOwnedImportContext(c, user.id, accountId);
      if (!importContext.ok) {
        return c.json<DividendImportResponse>(importContext.error, importContext.status);
      }
      const { supabase } = importContext;

      const importResult = await importDividendRows(file, accountId, supabase);
      return c.json<DividendImportResponse>(importResult.response, importResult.status);
    })(),
);
