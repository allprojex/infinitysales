import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  loadResourceScope,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

const toExpenseApi = (row: Record<string, unknown>) => ({
  ...rowToApi(row),
  expenseDate: row.expense_date ?? (row.spent_at ? String(row.spent_at).slice(0, 10) : null),
  receiptNote: row.receipt_note ?? row.reference ?? null,
  createdBy: row.created_by ?? row.user_id ?? null,
});

export const Route = createFileRoute("/api/expenses/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb.from("expenses").select("*").eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Expense not found");
        return json(toExpenseApi(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const row: Record<string, unknown> = apiToRow(body);
        if (body.expenseDate) row.spent_at = `${body.expenseDate}T00:00:00.000Z`;
        if (!row.reference && row.receipt_note) row.reference = row.receipt_note;
        let q = sb
          .from("expenses")
          .update(row as never)
          .eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("*").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Expense not found");
        return json(toExpenseApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb.from("expenses").delete().eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("id").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Expense not found");
        return json({ ok: true });
      },
    },
  },
});
