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

export async function loadReportScope(userId: string) {
  const { data, error } = await sb.from("user_roles").select("role").eq("user_id", userId);
  if (error) return { error: error.message, isPrivileged: false, userId, scope: "own" as const };
  const roles = new Set((data ?? []).map((r: { role?: string }) => r.role));
  const isPrivileged = roles.has("admin") || roles.has("manager");
  return {
    error: null as string | null,
    isPrivileged,
    userId,
    scope: isPrivileged ? ("all" as const) : ("own" as const),
  };
}
