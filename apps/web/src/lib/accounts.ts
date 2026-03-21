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
  const response = await apiFetch("/api/accounts");
  return (await response.json()) as AccountsApiResponse;
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
