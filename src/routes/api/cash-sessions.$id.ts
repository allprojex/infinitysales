import { createFileRoute } from "@tanstack/react-router";
import { errorJson, itemHandlers, json, requireUser, sb } from "./_resource-helpers";
import {
  cashierNameMap,
  sessionMovementTotals,
  toCashMovementApi,
  toCashSessionApi,
} from "./-cash-session-helpers";

const generic = itemHandlers({ table: "cash_sessions" });

export const Route = createFileRoute("/api/cash-sessions/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data: session, error } = await sb
          .from("cash_sessions")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!session) return errorJson(404, "Not found");

        const { data: movements, error: movError } = await sb
          .from("cash_movements")
          .select("*")
          .eq("user_id", user.id)
          .eq("cash_session_id", params.id)
          .order("occurred_at", { ascending: true });
        if (movError) return errorJson(500, movError.message);

        const row = session as Record<string, unknown>;
        const [totals, names] = await Promise.all([
          sessionMovementTotals(user.id, params.id),
          cashierNameMap([String(row.cashier_id ?? row.user_id)]),
        ]);

        return json({
          ...toCashSessionApi(row, {
            cashierName: names.get(String(row.cashier_id ?? row.user_id)) ?? "Unknown",
            totalIn: totals.totalIn,
            totalOut: totals.totalOut,
            movementCount: totals.movementCount,
          }),
          expected: Number(row.opening_balance ?? 0) + totals.totalIn - totals.totalOut,
          movements: (movements ?? []).map((m) => toCashMovementApi(m)),
        });
      },
      PUT: generic.PUT,
      DELETE: generic.DELETE,
    },
  },
});
