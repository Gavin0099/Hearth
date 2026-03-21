export type TransactionCsvImportResult = {
  source: "transactions-csv" | "sinopac-tw";
  imported: number;
  skipped: number;
  failed: number;
  runtime: "cloudflare-worker";
  persistence: "supabase";
  status: "ok";
  errors: string[];
};

export type TransactionCsvImportResponse =
  | TransactionCsvImportResult
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };
