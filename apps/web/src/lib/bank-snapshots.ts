import { apiFetch } from "./api";

export type BankSnapshot = {
  id: string;
  bank: string;
  type: string;
  statement_date: string;
  data: unknown;
  created_at: string;
  updated_at: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    if (data.error) return data.error;
  } catch {
    // fall through
  }
  return `bank-snapshots request failed: ${response.status} ${response.statusText}`;
}

export async function fetchBankSnapshots(): Promise<BankSnapshot[]> {
  const response = await apiFetch("/api/bank-snapshots");
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const data = await response.json() as { items?: BankSnapshot[]; status: string };
  return data.items ?? [];
}

export async function saveBankSnapshot(
  bank: string,
  type: string,
  statementDate: string,
  data: unknown,
): Promise<void> {
  const response = await apiFetch("/api/bank-snapshots", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bank, type, statement_date: statementDate, data }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
