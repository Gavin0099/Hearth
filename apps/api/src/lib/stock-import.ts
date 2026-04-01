import { refreshHoldingsForTickers } from "./holdings";
import { prepareStockTradeImportBatch, type StockTradeInput } from "./sinopac-stock";

export type ExecuteStockTradeImportParams = {
  supabase: any;
  accountId: string;
  source: "sinopac-stock" | "foreign-stock-csv";
  trades: StockTradeInput[];
  errors: string[];
};

export type ExecuteStockTradeImportResult =
  | {
      status: 200;
      response: {
        source: "sinopac-stock" | "foreign-stock-csv";
        imported: number;
        skipped: number;
        failed: number;
        holdingsRecalculated: number;
        runtime: "cloudflare-worker";
        persistence: "supabase";
        status: "ok";
        errors: string[];
      };
    }
  | {
      status: 500;
      response: {
        code: "database_error";
        error: string;
        status: "error";
      };
    };

export async function executeStockTradeImport({
  supabase,
  accountId,
  source,
  trades,
  errors,
}: ExecuteStockTradeImportParams): Promise<ExecuteStockTradeImportResult> {
  const sourceHashes = trades.map((trade) => trade.source_hash);
  const { data: existingRows, error: existingError } = await supabase
    .from("investment_trades")
    .select("source_hash")
    .in("source_hash", sourceHashes);

  if (existingError) {
    return {
      status: 500,
      response: {
        code: "database_error",
        error: existingError.message,
        status: "error",
      },
    };
  }

  const { freshTrades, skipped } = prepareStockTradeImportBatch(
    trades,
    (existingRows ?? []).map((row: { source_hash: string }) => row.source_hash),
  );

  if (freshTrades.length > 0) {
    const { error: insertError } = await supabase.from("investment_trades").upsert(
      freshTrades.map((trade) => ({
        account_id: trade.account_id,
        trade_date: trade.trade_date,
        ticker: trade.ticker,
        name: trade.name,
        action: trade.action,
        shares: trade.shares,
        price_per_share: trade.price_per_share,
        fee: trade.fee,
        tax: trade.tax,
        currency: trade.currency,
        source: trade.source,
        source_hash: trade.source_hash,
      })),
      { onConflict: "source_hash", ignoreDuplicates: true },
    );

    if (insertError) {
      return {
        status: 500,
        response: {
          code: "database_error",
          error: insertError.message,
          status: "error",
        },
      };
    }
  }

  const affectedTickers = [...new Set(freshTrades.map((trade) => trade.ticker))];
  const { holdingsRecalculated } = await refreshHoldingsForTickers(supabase, accountId, affectedTickers);

  return {
    status: 200,
    response: {
      source,
      imported: freshTrades.length,
      skipped,
      failed: errors.length,
      holdingsRecalculated,
      runtime: "cloudflare-worker",
      persistence: "supabase",
      status: "ok",
      errors,
    },
  };
}
