import type { TransactionCsvImportResponse } from "@hearth/shared";
import { apiFetch } from "./api";

export async function importTransactionsCsv(accountId: string, file: File) {
  return importCsvToEndpoint("/api/import/transactions-csv", accountId, file);
}

export async function importSinopacTransactionsCsv(accountId: string, file: File) {
  return importCsvToEndpoint("/api/import/sinopac-tw", accountId, file);
}

async function importCsvToEndpoint(endpoint: string, accountId: string, file: File) {
  const formData = new FormData();
  formData.set("account_id", accountId);
  formData.set("file", file);

  const response = await apiFetch(endpoint, {
    method: "POST",
    body: formData,
  });

  return (await response.json()) as TransactionCsvImportResponse;
}
