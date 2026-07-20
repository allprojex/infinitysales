import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, safeJson, sb } from "./_resource-helpers";
import { notify } from "./_notify";
import { actorFromUser } from "./_audit";
import { toCashSessionApi } from "./-cash-session-helpers";

export const Route = createFileRoute("/api/cash-sessions/open")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const openingAmount = Number(body.openingAmount ?? 0);

        const row = {
          user_id: user.id,
          cashier_id: user.id,
          terminal: body.terminal || "Main Register",
          opening_balance: openingAmount,
          status: "open",
          notes: body.notes || null,
          opened_at: new Date().toISOString(),
        };
        const { data, error } = await sb
          .from("cash_sessions")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        const session = data as Record<string, unknown>;

        // The opening float is itself a movement (cash-management.tsx
        // renders it as the first "Opening float" line in the movement
        // log), not just a number on the session row.
        if (openingAmount > 0) {
          const { error: movError } = await (sb as any).from("cash_movements").insert({
            user_id: user.id,
            cash_session_id: session.id,
            type: "float_adjustment",
            amount: openingAmount,
            reference: "Opening float",
            occurred_at: row.opened_at,
          });
          if (movError) return errorJson(500, movError.message);
        }

        const actor = await actorFromUser(user);
        await notify({
          userId: user.id,
          type: "cash",
          severity: "success",
          title: "Cash session opened",
          message: `Opening balance ${openingAmount}`,
          link: "/cash-management",
          metadata: { id: session.id, action: "open" },
        });
        return json(
          toCashSessionApi(session, {
            cashierName: actor.actorName ?? "Unknown",
            totalIn: openingAmount,
            totalOut: 0,
            movementCount: openingAmount > 0 ? 1 : 0,
          }),
        );
      },
    },
  },
});
