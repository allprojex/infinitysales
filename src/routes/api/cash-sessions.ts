import { createFileRoute } from "@tanstack/react-router";
import {
  errorJson,
  json,
  listCreateHandlers,
  parseQuery,
  requireUser,
  sb,
} from "./_resource-helpers";
import { cashierNameMap, sessionMovementTotals, toCashSessionApi } from "./-cash-session-helpers";

const generic = listCreateHandlers({
  table: "cash_sessions",
  searchColumns: ["notes"],
  orderBy: "opened_at",
  filters: ["status", "branchId"],
});

export const Route = createFileRoute("/api/cash-sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search, params } = parseQuery(request);
        let q = sb
          .from("cash_sessions")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .order("opened_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (search) q = q.ilike("notes", `%${search}%`);
        const status = params.get("status");
        if (status) q = q.eq("status", status);
        const branchId = params.get("branchId");
        if (branchId) q = q.eq("branch_id", branchId);

        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        const sessions = (data ?? []) as Record<string, unknown>[];

        const names = await cashierNameMap(sessions.map((s) => String(s.cashier_id ?? s.user_id)));
        const rows = await Promise.all(
          sessions.map(async (session) => {
            const totals = await sessionMovementTotals(user.id, String(session.id));
            return toCashSessionApi(session, {
              cashierName: names.get(String(session.cashier_id ?? session.user_id)) ?? "Unknown",
              totalIn: totals.totalIn,
              totalOut: totals.totalOut,
              movementCount: totals.movementCount,
            });
          }),
        );
        return json({ data: rows, total: count ?? rows.length, page, limit });
      },
      POST: generic.POST,
    },
  },
});
