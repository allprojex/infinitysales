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

// Leave requests are company-wide HRM data, like employees -- any account
// with HRM access sees the same records, not just ones its own account
// created.
export const Route = createFileRoute("/api/leave")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { limit, page, offset, params } = parseQuery(request);
        let q = sb
          .from("leave_requests")
          .select("*, employee:employees(name, department)", { count: "exact" })
          .order("start_date", { ascending: false })
          .range(offset, offset + limit - 1);
        const status = params.get("status");
        if (status && status !== "all") q = q.eq("status", status);
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({ data: (data ?? []).map(flatten), total: count ?? 0, page, limit });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.employeeId || !body?.startDate || !body?.endDate)
          return errorJson(400, "employeeId, startDate, endDate are required");
        const row = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb
          .from("leave_requests")
          .insert(row as any)
          .select("*, employee:employees(name, department)")
          .single();
        if (error) return errorJson(500, error.message);
        return json(flatten(data));
      },
    },
  },
});
