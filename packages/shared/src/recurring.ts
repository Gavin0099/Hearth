import type { TransactionRecord } from "./transactions";

export const recurringCadences = ["monthly"] as const;
export type RecurringCadence = (typeof recurringCadences)[number];

export const recurringSourceKinds = ["manual", "excel_sidebar"] as const;
export type RecurringSourceKind = (typeof recurringSourceKinds)[number];

export type RecurringTemplateRecord = {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  category: string | null;
  amount: number | null;
  currency: string;
  cadence: RecurringCadence;
  anchor_day: number | null;
  source_kind: RecurringSourceKind;
  source_section: string | null;
  notes: string | null;
  created_at: string;
};

export type CreateRecurringTemplateInput = {
  account_id: string;
  name: string;
  category?: string | null;
  amount?: number | null;
  currency?: string;
  cadence?: RecurringCadence;
  anchor_day?: number | null;
  source_kind?: RecurringSourceKind;
  source_section?: string | null;
  notes?: string | null;
};

export type CreateRecurringTemplatesFromCandidatesInput = {
  account_id: string;
  candidates: Array<{
    sheet: string;
    section: string;
    label: string | null;
    kind: "recurring_sidebar";
  }>;
};

export type ApplyRecurringTemplatesInput = {
  year: number;
  month: number;
};

export type RecurringTemplatesResponse =
  | {
      items: RecurringTemplateRecord[];
      count: number;
      status: "ok";
      skipped?: number;
    }
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };

export type ApplyRecurringTemplatesResponse =
  | {
      items: TransactionRecord[];
      count: number;
      skipped: number;
      status: "ok";
    }
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };

export function isRecurringCadence(value: string): value is RecurringCadence {
  return recurringCadences.includes(value as RecurringCadence);
}

export function isRecurringSourceKind(value: string): value is RecurringSourceKind {
  return recurringSourceKinds.includes(value as RecurringSourceKind);
}
