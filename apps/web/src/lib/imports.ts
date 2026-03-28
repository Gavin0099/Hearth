import type { TransactionCsvImportResponse } from "@hearth/shared";
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
  | "gmail_bank_esun";

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
