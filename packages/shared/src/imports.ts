export type RecurringImportCandidate = {
  sheet: string;
  section: string;
  label: string | null;
  kind: "recurring_sidebar";
};

export type TransactionCsvImportResult = {
  source: "transactions-csv" | "sinopac-tw" | "credit-card-tw" | "excel-monthly";
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

export type DividendImportResponse =
  | {
      source: "dividends-csv";
      imported: number;
      skipped: number;
      failed: number;
      runtime: "cloudflare-worker";
      persistence: "supabase";
      status: "ok";
      errors: string[];
    }
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };

export type StockTradeImportResponse =
  | {
      source: "sinopac-stock" | "foreign-stock-csv";
      imported: number;
      skipped: number;
      failed: number;
      holdingsRecalculated: number;
      runtime: "cloudflare-worker";
      persistence: "supabase";
      status: "ok";
      errors: string[];
    }
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };

export type ImportPreviewSource =
  | "transactions-csv"
  | "sinopac-tw"
  | "credit-card-tw"
  | "excel-monthly"
  | "sinopac-stock"
  | "foreign-stock-csv"
  | "dividends-csv";

export type ImportPreviewResponse =
  | {
      source: ImportPreviewSource;
      validRows: number;
      failedRows: number;
      skipped: number;
      estimatedRows: number;
      columns: string[];
      sampleRows: string[][];
      warnings?: string[];
      errors: string[];
      recurringCandidates?: RecurringImportCandidate[];
      status: "ok";
    }
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };
