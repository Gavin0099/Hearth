export type RecurringImportCandidate = {
  sheet: string;
  section: string;
  label: string | null;
  kind: "recurring_sidebar";
};

export type TransactionCsvImportResult = {
  source: "transactions-csv" | "sinopac-tw" | "excel-monthly";
  imported: number;
  skipped: number;
  failed: number;
  runtime: "cloudflare-worker";
  persistence: "supabase";
  status: "ok";
  errors: string[];
  warnings?: string[];
  recurringCandidates?: RecurringImportCandidate[];
};

export type TransactionCsvImportResponse =
  | TransactionCsvImportResult
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };
