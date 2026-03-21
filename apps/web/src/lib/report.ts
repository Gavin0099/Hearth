import type { MonthlyReportResponse } from "@hearth/shared";
import { apiFetch } from "./api";

export async function fetchMonthlyReport(year: number, month: number) {
  const response = await apiFetch(`/api/report/monthly?year=${year}&month=${month}`);
  return (await response.json()) as MonthlyReportResponse;
}
