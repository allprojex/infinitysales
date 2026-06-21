import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  parseQuery,
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

export const Route = createFileRoute("/api/expenses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search, params } = parseQuery(request);
        let q = sb
          .from("expenses")
          .select("*", { count: "exact" })
          .order("expense_date", { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (search) {
          q = q.or(
            `title.ilike.%${search}%,reference.ilike.%${search}%,receipt_note.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`,
          );
        }
        for (const f of ["category", "status", "branchId", "supplierId", "bankAccountId"]) {
          const v = params.get(f);
          if (v && v !== "all") {
            const col = f.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
            q = q.eq(col, v);
          }
        }
        const startDate = params.get("startDate");
        const endDate = params.get("endDate");
        if (startDate) q = q.gte("expense_date", startDate);
        if (endDate) q = q.lte("expense_date", endDate);

        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({
          data: (data ?? []).map(toExpenseApi),
          total: count ?? data?.length ?? 0,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.title) return errorJson(400, "title is required");
        if (body?.amount == null || body?.amount === "")
          return errorJson(400, "amount is required");
        const row: Record<string, unknown> = {
          ...apiToRow(body),
          user_id: user.id,
          created_by: user.id,
        };
        if (body.expenseDate) row.spent_at = `${body.expenseDate}T00:00:00.000Z`;
        if (!row.reference && row.receipt_note) row.reference = row.receipt_note;
        const { data, error } = await sb
          .from("expenses")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(toExpenseApi(data));
      },
    },
  },
});
