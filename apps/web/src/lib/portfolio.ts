import type { PortfolioHoldingsResponse } from "@hearth/shared";
import { apiFetch } from "./api";

export async function fetchPortfolioHoldings() {
  const response = await apiFetch("/api/portfolio/holdings");
  return (await response.json()) as PortfolioHoldingsResponse;
}
