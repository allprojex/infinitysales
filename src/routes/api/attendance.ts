import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  parseQuery,
  requireHrmAccess,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

function flatten(row: any) {
  const emp = row?.employee;
  const r = rowToApi(row);
  delete (r as any).employee;
  return { ...r, employeeName: emp?.name ?? null, department: emp?.department ?? null };
}

function monthRange(month: string): [string, string] | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [start, `${nm}-01`];
}

// Attendance is company-wide HRM data, like employees -- any account with
// HRM access sees the same records, not just ones its own account created.
export const Route = createFileRoute("/api/attendance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { limit, page, offset, params } = parseQuery(request);
        let q = sb
          .from("attendance")
          .select("*, employee:employees(name, department)", { count: "exact" })
          .order("date", { ascending: false })
          .range(offset, offset + limit - 1);
        const month = params.get("month");
        if (month) {
          const r = monthRange(month);
          if (r) q = q.gte("date", r[0]).lt("date", r[1]);
        }
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({ data: (data ?? []).map(flatten), total: count ?? 0, page, limit });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.employeeId || !body?.date)
          return errorJson(400, "employeeId and date are required");
        const row = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb
          .from("attendance")
          .insert(row as any)
          .select("*, employee:employees(name, department)")
          .single();
        if (error) return errorJson(500, error.message);
        return json(flatten(data));
      },
    },
  },
});
