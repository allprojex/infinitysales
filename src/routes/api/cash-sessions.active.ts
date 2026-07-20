import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";
import { cashierNameMap, sessionMovementTotals, toCashSessionApi } from "./-cash-session-helpers";

export const Route = createFileRoute("/api/cash-sessions/active")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("cash_sessions")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return json(null);

        const session = data as Record<string, unknown>;
        const [totals, names] = await Promise.all([
          sessionMovementTotals(user.id, String(session.id)),
          cashierNameMap([String(session.cashier_id ?? user.id)]),
        ]);
        return json(
          toCashSessionApi(session, {
            cashierName: names.get(String(session.cashier_id ?? user.id)) ?? "Unknown",
            totalIn: totals.totalIn,
            totalOut: totals.totalOut,
            movementCount: totals.movementCount,
          }),
        );
      },
    },
  },
});
