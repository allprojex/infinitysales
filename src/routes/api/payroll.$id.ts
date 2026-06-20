import { createFileRoute } from "@tanstack/react-router";
import { apiToRow, errorJson, json, requireUser, rowToApi, safeJson, sb } from "./_resource-helpers";

function flatten(row: any) {
  const emp = row?.employee;
  const r = rowToApi(row);
  delete (r as any).employee;
  return { ...r, employeeName: emp?.name ?? null, department: emp?.department ?? null };
}

function withTotals(row: Record<string, any>) {
  if (row.basic_salary != null || row.allowances != null || row.ssnit != null || row.tax != null || row.other_deductions != null) {
    const basic = Number(row.basic_salary ?? 0);
    const allow = Number(row.allowances ?? 0);
    const gross = basic + allow;
    row.gross_pay = gross;
    row.net_pay = gross - Number(row.ssnit ?? 0) - Number(row.tax ?? 0) - Number(row.other_deductions ?? 0);
  }
  return row;
}

export const Route = createFileRoute("/api/payroll/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("payroll_runs").select("*, employee:employees(name, department)").eq("user_id", user.id).eq("id", params.id).maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(flatten(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const row = withTotals(apiToRow(body));
        const { data, error } = await sb.from("payroll_runs").update(row as any).eq("user_id", user.id).eq("id", params.id).select("*, employee:employees(name, department)").single();
        if (error) return errorJson(500, error.message);
        return json(flatten(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { error } = await sb.from("payroll_runs").delete().eq("user_id", user.id).eq("id", params.id);
        if (error) return errorJson(500, error.message);
        return json({ ok: true });
      },
    },
  },
});
