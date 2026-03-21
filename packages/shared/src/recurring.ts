export const recurringCadences = ["monthly"] as const;
export type RecurringCadence = (typeof recurringCadences)[number];

export const recurringSourceKinds = ["manual", "excel_sidebar"] as const;
export type RecurringSourceKind = (typeof recurringSourceKinds)[number];

export type RecurringTemplateRecord = {
  id: string;
  user_id: string;
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

export type RecurringTemplatesResponse =
  | {
      items: RecurringTemplateRecord[];
      count: number;
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
