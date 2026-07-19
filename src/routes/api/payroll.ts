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

function withTotals(row: Record<string, any>) {
  const basic = Number(row.basic_salary ?? 0);
  const allow = Number(row.allowances ?? 0);
  const gross = basic + allow;
  const ssnit = Number(row.ssnit ?? 0);
  const tax = Number(row.tax ?? 0);
  const other = Number(row.other_deductions ?? 0);
  row.gross_pay = gross;
  row.net_pay = gross - ssnit - tax - other;
  return row;
}

export const Route = createFileRoute("/api/payroll")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { limit, page, offset, params } = parseQuery(request);
        let q = sb
          .from("payroll_runs")
          .select("*, employee:employees(name, department)", { count: "exact" })
          .eq("user_id", user.id)
          .order("month", { ascending: false })
          .range(offset, offset + limit - 1);
        const month = params.get("month");
        if (month) q = q.eq("month", month);
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({ data: (data ?? []).map(flatten), total: count ?? 0, page, limit });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.employeeId || !body?.month)
          return errorJson(400, "employeeId and month are required");
        const row = withTotals({ ...apiToRow(body), user_id: user.id });
        const { data, error } = await sb
          .from("payroll_runs")
          .insert(row as any)
          .select("*, employee:employees(name, department)")
          .single();
        if (error) return errorJson(500, error.message);
        return json(flatten(data));
      },
    },
  },
});
