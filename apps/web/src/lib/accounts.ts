import type { AccountRecord, CreateAccountInput } from "@hearth/shared";
import { apiFetch } from "./api";

type AccountsApiResponse =
  | {
      items: AccountRecord[];
      count: number;
      status: "ok";
    }
  | {
      code?: string;
      error: string;
      status: "error";
    };

export async function fetchAccounts() {
  try {
    const response = await apiFetch("/api/accounts");
    return (await response.json()) as AccountsApiResponse;
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Failed to fetch",
      code: "network_error",
    } satisfies AccountsApiResponse;
  }
}

export async function createAccount(payload: CreateAccountInput) {
  const response = await apiFetch("/api/accounts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await response.json()) as AccountsApiResponse;
}

export async function updateAccount(id: string, payload: { name?: string; currency?: string; broker?: string | null }) {
  const response = await apiFetch(`/api/accounts/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as AccountsApiResponse;
}

export async function deleteAccount(id: string) {
  const response = await apiFetch(`/api/accounts/${id}`, { method: "DELETE" });
  return (await response.json()) as { status: "ok" } | { error: string; status: "error" };
}
