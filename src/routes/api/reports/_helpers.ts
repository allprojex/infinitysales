// Shared helpers for /api/reports/* endpoints.
import { errorJson, json, requireUser, sb } from "../_resource-helpers";

export { errorJson, json, requireUser, sb };

export function dateRange(request: Request) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  return { startDate, endDate, params: url.searchParams };
}

export function monthsAgoISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function monthKey(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}
