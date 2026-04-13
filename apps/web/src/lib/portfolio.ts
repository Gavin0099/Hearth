import type {
  FxRatesResponse,
  InvestmentCostsResponse,
  NetWorthHistoryResponse,
  NetWorthResponse,
  PortfolioDividendsResponse,
  PortfolioHoldingsResponse,
} from "@hearth/shared";
import { apiFetch } from "./api";

function toNetworkErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to fetch";
}

export async function fetchPortfolioHoldings() {
  try {
    const response = await apiFetch("/api/portfolio/holdings");
    return (await response.json()) as PortfolioHoldingsResponse;
  } catch (error) {
    return {
      status: "error",
      code: "database_error",
      error: toNetworkErrorMessage(error),
    } satisfies Extract<PortfolioHoldingsResponse, { status: "error" }>;
  }
}

export async function fetchNetWorth() {
  try {
    const response = await apiFetch("/api/portfolio/net-worth");
    return (await response.json()) as NetWorthResponse;
  } catch (error) {
    return {
      status: "error",
      code: "database_error",
      error: toNetworkErrorMessage(error),
    } satisfies Extract<NetWorthResponse, { status: "error" }>;
  }
}

export async function fetchPortfolioDividends() {
  try {
    const response = await apiFetch("/api/portfolio/dividends");
    return (await response.json()) as PortfolioDividendsResponse;
  } catch (error) {
    return {
      status: "error",
      code: "database_error",
      error: toNetworkErrorMessage(error),
    } satisfies Extract<PortfolioDividendsResponse, { status: "error" }>;
  }
}

export async function fetchFxRates() {
  try {
    const response = await apiFetch("/api/portfolio/fx-rates");
    return (await response.json()) as FxRatesResponse;
  } catch (error) {
    return {
      status: "error",
      code: "database_error",
      error: toNetworkErrorMessage(error),
    } satisfies Extract<FxRatesResponse, { status: "error" }>;
  }
}

export async function fetchNetWorthHistory(days = 90) {
  try {
    const response = await apiFetch(`/api/portfolio/net-worth-history?days=${days}`);
    return (await response.json()) as NetWorthHistoryResponse;
  } catch (error) {
    return {
      status: "error",
      code: "database_error",
      error: toNetworkErrorMessage(error),
    } satisfies Extract<NetWorthHistoryResponse, { status: "error" }>;
  }
}

export async function fetchTradeCosts() {
  try {
    const response = await apiFetch("/api/portfolio/trade-costs");
    return (await response.json()) as InvestmentCostsResponse;
  } catch (error) {
    return {
      status: "error",
      code: "database_error",
      error: toNetworkErrorMessage(error),
    } satisfies Extract<InvestmentCostsResponse, { status: "error" }>;
  }
}

export type FxRateEntry = { from_currency: string; rate_date: string; rate: number };

export async function saveFxRates(
  entries: FxRateEntry[],
): Promise<{ saved: number; status: "ok" } | { status: "error"; error: string }> {
  try {
    const response = await apiFetch("/api/portfolio/fx-rates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entries),
    });
    const json = (await response.json()) as
      | { saved: number; status: "ok" }
      | { code: string; error: string; status: "error" };
    if (json.status === "error") return { status: "error", error: json.error };
    return json as { saved: number; status: "ok" };
  } catch {
    return { status: "error", error: "網路錯誤" };
  }
}

export async function deletePriceSnapshot(
  ticker: string,
  date: string,
): Promise<{ deleted: number; status: "ok" } | { status: "error"; error: string }> {
  try {
    const response = await apiFetch(
      `/api/portfolio/price-snapshots?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}`,
      { method: "DELETE" },
    );
    const json = (await response.json()) as
      | { deleted: number; status: "ok" }
      | { code: string; error: string; status: "error" };
    if (json.status === "error") return { status: "error", error: json.error };
    return json as { deleted: number; status: "ok" };
  } catch {
    return { status: "error", error: "網路錯誤" };
  }
}

export async function deleteFxRate(
  fromCurrency: string,
  rateDate: string,
): Promise<{ deleted: number; status: "ok" } | { status: "error"; error: string }> {
  try {
    const response = await apiFetch(
      `/api/portfolio/fx-rates?from_currency=${encodeURIComponent(fromCurrency)}&rate_date=${encodeURIComponent(rateDate)}`,
      { method: "DELETE" },
    );
    const json = (await response.json()) as
      | { deleted: number; status: "ok" }
      | { code: string; error: string; status: "error" };
    if (json.status === "error") return { status: "error", error: json.error };
    return json as { deleted: number; status: "ok" };
  } catch {
    return { status: "error", error: "網路錯誤" };
  }
}

export type PriceEntry = { ticker: string; date: string; close_price: number; currency?: string };

export async function savePriceSnapshots(
  entries: PriceEntry[],
): Promise<{ saved: number; status: "ok" } | { status: "error"; error: string }> {
  try {
    const response = await apiFetch("/api/portfolio/price-snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entries),
    });
    const json = (await response.json()) as
      | { saved: number; status: "ok" }
      | { code: string; error: string; status: "error" };
    if (json.status === "error") return { status: "error", error: json.error };
    return json as { saved: number; status: "ok" };
  } catch {
    return { status: "error", error: "網路錯誤" };
  }
}
