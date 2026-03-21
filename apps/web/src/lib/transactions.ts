import type {
  CreateTransactionInput,
  TransactionsResponse,
} from "@hearth/shared";
import { apiFetch } from "./api";

export async function fetchTransactions() {
  const response = await apiFetch("/api/transactions");
  return (await response.json()) as TransactionsResponse;
}

export async function createTransaction(payload: CreateTransactionInput) {
  const response = await apiFetch("/api/transactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await response.json()) as TransactionsResponse;
}
