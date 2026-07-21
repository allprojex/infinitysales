import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  loadResourceScope,
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
  if (
    row.basic_salary != null ||
    row.allowances != null ||
    row.ssnit != null ||
    row.tax != null ||
    row.other_deductions != null
  ) {
    const basic = Number(row.basic_salary ?? 0);
    const allow = Number(row.allowances ?? 0);
    const gross = basic + allow;
    row.gross_pay = gross;
    row.net_pay =
      gross - Number(row.ssnit ?? 0) - Number(row.tax ?? 0) - Number(row.other_deductions ?? 0);
  }
  return row;
}

// Payroll runs are shared company HRM data (see payroll.ts) -- reads are
// open to any account with HRM access; only privileged roles (or the
// creator) may edit/delete.
export const Route = createFileRoute("/api/payroll/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("payroll_runs")
          .select("*, employee:employees(name, department)")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(flatten(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const body = await safeJson(request);
        const row = withTotals(apiToRow(body));
        let q = sb
          .from("payroll_runs")
          .update(row as any)
          .eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q
          .select("*, employee:employees(name, department)")
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(flatten(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb.from("payroll_runs").delete().eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("id").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json({ ok: true });
      },
    },
  },
});
