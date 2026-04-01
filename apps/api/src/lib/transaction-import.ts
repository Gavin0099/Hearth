import type { CreateTransactionInput } from "@hearth/shared";
import { buildTransactionSourceHash } from "./transaction-hash";

export type TransactionImportRow = CreateTransactionInput & {
  source_hash: string;
};

export type PrepareTransactionImportBatchResult = {
  freshRows: TransactionImportRow[];
  skipped: number;
};

export function buildTransactionImportRows(rows: CreateTransactionInput[]): TransactionImportRow[] {
  return rows.map((row) => ({
    ...row,
    source_hash: buildTransactionSourceHash(row),
  }));
}

export function prepareTransactionImportBatch(
  rows: TransactionImportRow[],
  existingSourceHashes: Iterable<string>,
): PrepareTransactionImportBatchResult {
  const existingSet = new Set(existingSourceHashes);
  const uniqueRows = new Map<string, TransactionImportRow>();
  let duplicateRowsInPayload = 0;

  for (const row of rows) {
    if (uniqueRows.has(row.source_hash)) {
      duplicateRowsInPayload += 1;
      continue;
    }

    uniqueRows.set(row.source_hash, row);
  }

  const dedupedRows = [...uniqueRows.values()];
  const freshRows = dedupedRows.filter((row) => !existingSet.has(row.source_hash));

  return {
    freshRows,
    skipped: duplicateRowsInPayload + (dedupedRows.length - freshRows.length),
  };
}
