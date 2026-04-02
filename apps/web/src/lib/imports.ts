import type {
  DividendImportResponse,
  ImportPreviewResponse,
  StockTradeImportResponse,
  TransactionCsvImportResponse,
} from "@hearth/shared";
import { apiFetch } from "./api";

type TransactionsCsvSource =
  | "csv_import"
  | "gmail_pdf_sinopac"
  | "gmail_pdf_esun"
  | "gmail_pdf_cathay"
  | "gmail_pdf_taishin"
  | "gmail_pdf_ctbc"
  | "gmail_pdf_mega"
  | "gmail_bank_sinopac"
  | "gmail_bank_esun"
  | "gmail_bank_cathay"
  | "gmail_bank_taishin"
  | "gmail_bank_ctbc"
  | "gmail_bank_mega";

export async function importTransactionsCsv(
  accountId: string,
  file: File,
  source?: TransactionsCsvSource,
) {
  return importCsvToEndpoint("/api/import/transactions-csv", accountId, file, source);
}

export async function importSinopacTransactionsCsv(accountId: string, file: File) {
  return importCsvToEndpoint("/api/import/sinopac-tw", accountId, file);
}

export async function importCreditCardTransactionsCsv(accountId: string, file: File) {
  return importCsvToEndpoint("/api/import/credit-card-tw", accountId, file);
}

export async function importExcelMonthly(accountId: string, file: File) {
  return importCsvToEndpoint("/api/import/excel-monthly", accountId, file);
}

export async function importSinopacStockCsv(
  accountId: string,
  file: File,
): Promise<StockTradeImportResponse> {
  return importStockTrades("/api/import/sinopac-stock", accountId, file);
}

export async function importForeignStockCsv(
  accountId: string,
  file: File,
): Promise<StockTradeImportResponse> {
  return importStockTrades("/api/import/foreign-stock-csv", accountId, file);
}

export async function previewImportFile(
  importMode:
    | "normalized"
    | "sinopac-tw"
    | "credit-card-tw"
    | "excel-monthly"
    | "sinopac-stock"
    | "foreign-stock-csv"
    | "dividends-csv",
  accountId: string,
  file: File,
  source?: TransactionsCsvSource,
): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.set("account_id", accountId);
  formData.set("file", file);
  formData.set("import_mode", importMode === "normalized" ? "transactions-csv" : importMode);
  if (source) {
    formData.set("source", source);
  }

  const response = await apiFetch("/api/import/preview", {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as ImportPreviewResponse;
}

async function importStockTrades(
  endpoint: string,
  accountId: string,
  file: File,
): Promise<StockTradeImportResponse> {
  const formData = new FormData();
  formData.set("account_id", accountId);
  formData.set("file", file);
  const response = await apiFetch(endpoint, {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as StockTradeImportResponse;
}

export async function importDividendsCsv(
  accountId: string,
  file: File,
): Promise<DividendImportResponse> {
  const formData = new FormData();
  formData.set("account_id", accountId);
  formData.set("file", file);
  const response = await apiFetch("/api/import/dividends-csv", {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as DividendImportResponse;
}

async function importCsvToEndpoint(
  endpoint: string,
  accountId: string,
  file: File,
  source?: TransactionsCsvSource,
) {
  const formData = new FormData();
  formData.set("account_id", accountId);
  formData.set("file", file);
  if (source) {
    formData.set("source", source);
  }

  const response = await apiFetch(endpoint, {
    method: "POST",
    body: formData,
  });

  return (await response.json()) as TransactionCsvImportResponse;
}
