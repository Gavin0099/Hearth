import type { TransactionCsvImportResponse } from "@hearth/shared";
import { apiFetch } from "./api";

export async function importTransactionsCsv(accountId: string, file: File) {
  const formData = new FormData();
  formData.set("account_id", accountId);
  formData.set("file", file);

  const response = await apiFetch("/api/import/transactions-csv", {
    method: "POST",
    body: formData,
  });

  return (await response.json()) as TransactionCsvImportResponse;
}
