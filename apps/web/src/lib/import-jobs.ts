import { apiFetch } from "./api";

export type ImportJobRecord = {
  id: string;
  gmail_message_id: string;
  attachment_id: string;
  email_subject: string;
  email_date: string;
  filename: string;
  bank_key: string;
  source_type: "credit_card" | "bank_account";
  mapped_account_id: string | null;
  status: "pending_parse" | "parsed" | "imported" | "failed" | "needs_review";
  error_code: string | null;
  error_message: string | null;
  imported_count: number | null;
  skipped_count: number | null;
  created_at: string;
  updated_at: string;
};

export async function fetchImportJobs(status?: string): Promise<
  | { status: "ok"; items: ImportJobRecord[] }
  | { status: "error"; error: string }
> {
  const url = status ? `/api/import-jobs?status=${status}` : "/api/import-jobs";
  const res = await apiFetch(url);
  if (!res.ok) return { status: "error", error: `HTTP ${res.status}` };
  return res.json();
}

export async function updateImportJob(
  id: string,
  update: {
    status: "parsed" | "imported" | "failed" | "needs_review";
    imported_count?: number;
    skipped_count?: number;
    error_code?: string;
    error_message?: string;
  },
): Promise<void> {
  await apiFetch(`/api/import-jobs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export type BankAccountMappingRecord = {
  id: string;
  bank_key: string;
  source_type: "credit_card" | "bank_account";
  account_id: string;
  enabled: boolean;
};

export async function fetchBankAccountMappings(): Promise<
  | { status: "ok"; items: BankAccountMappingRecord[] }
  | { status: "error"; error: string }
> {
  const res = await apiFetch("/api/bank-account-mapping");
  if (!res.ok) return { status: "error", error: `HTTP ${res.status}` };
  return res.json();
}

export async function upsertBankAccountMapping(mapping: {
  bank_key: string;
  source_type: "credit_card" | "bank_account";
  account_id: string;
  enabled?: boolean;
}): Promise<{ status: "ok" } | { status: "error"; error: string }> {
  const res = await apiFetch("/api/bank-account-mapping", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mapping),
  });
  if (!res.ok) return { status: "error", error: `HTTP ${res.status}` };
  return res.json();
}

export async function deleteBankAccountMapping(id: string): Promise<void> {
  await apiFetch(`/api/bank-account-mapping/${id}`, { method: "DELETE" });
}
