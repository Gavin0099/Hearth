import type {
  FxRatesResponse,
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
