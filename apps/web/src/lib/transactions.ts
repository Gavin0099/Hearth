import type {
  CreateTransactionInput,
  TransactionsQuery,
  TransactionsResponse,
  UpdateTransactionInput,
} from "@hearth/shared";
import { apiFetch } from "./api";

export async function fetchTransactions(query?: TransactionsQuery) {
  const search = new URLSearchParams();
  if (query?.account_id) {
    search.set("account_id", query.account_id);
  }
  if (query?.category) {
    search.set("category", query.category);
  }
  if (query?.date_from) {
    search.set("date_from", query.date_from);
  }
  if (query?.date_to) {
    search.set("date_to", query.date_to);
  }
  if (query?.q) {
    search.set("q", query.q);
  }

  const suffix = search.toString() ? `?${search.toString()}` : "";
  const response = await apiFetch(`/api/transactions${suffix}`);
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

export async function deleteTransaction(transactionId: string) {
  const response = await apiFetch(`/api/transactions/${transactionId}`, {
    method: "DELETE",
  });

  return (await response.json()) as TransactionsResponse;
}

export async function updateTransaction(
  transactionId: string,
  payload: UpdateTransactionInput,
) {
  const response = await apiFetch(`/api/transactions/${transactionId}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await response.json()) as TransactionsResponse;
}
