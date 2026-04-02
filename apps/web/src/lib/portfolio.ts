import type {
  FxRatesResponse,
  InvestmentCostsResponse,
  NetWorthHistoryResponse,
  NetWorthResponse,
  PortfolioDividendsResponse,
  PortfolioHoldingsResponse,
} from "@hearth/shared";
import { apiFetch } from "./api";

export async function fetchPortfolioHoldings() {
  const response = await apiFetch("/api/portfolio/holdings");
  return (await response.json()) as PortfolioHoldingsResponse;
}

export async function fetchNetWorth() {
  const response = await apiFetch("/api/portfolio/net-worth");
  return (await response.json()) as NetWorthResponse;
}

export async function fetchPortfolioDividends() {
  const response = await apiFetch("/api/portfolio/dividends");
  return (await response.json()) as PortfolioDividendsResponse;
}

export async function fetchFxRates() {
  const response = await apiFetch("/api/portfolio/fx-rates");
  return (await response.json()) as FxRatesResponse;
}

export async function fetchNetWorthHistory(days = 90) {
  const response = await apiFetch(`/api/portfolio/net-worth-history?days=${days}`);
  return (await response.json()) as NetWorthHistoryResponse;
}

export async function fetchTradeCosts() {
  const response = await apiFetch("/api/portfolio/trade-costs");
  return (await response.json()) as InvestmentCostsResponse;
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
