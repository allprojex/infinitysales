import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, safeJson } from "./_resource-helpers";
import { notify } from "./_notify";
import { movementDelta, sessionMovementTotals, toCashSessionApi } from "./-cash-session-helpers";
import { actorFromUser } from "./_audit";

export const Route = createFileRoute("/api/cash-sessions/$id/close")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        // The frontend sends closingAmount; accept closingBalance too since
        // that's the real column name, in case anything else calls this.
        const closingBalance = Number(body.closingAmount ?? body.closingBalance ?? 0);
        const { data: session } = await sb
          .from("cash_sessions")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("id", params.id)
          .maybeSingle();
        if (!session) return json({ message: "Not found" }, { status: 404 });
        const opening = Number((session as any).opening_balance ?? 0);
        const { data: movs, error: movError } = await sb
          .from("cash_movements")
          .select("type,amount")
          .eq("user_id", auth.user.id)
          .eq("cash_session_id", params.id);
        if (movError) return json({ message: movError.message }, { status: 500 });
        const movTotal = (movs ?? []).reduce(
          (s: number, m: any) => s + movementDelta(m.type, Number(m.amount) || 0),
          0,
        );
        const expected = opening + movTotal;
        const difference = closingBalance - expected;
        const { data, error } = await sb
          .from("cash_sessions")
          .update({
            status: "closed",
            closing_balance: closingBalance,
            expected_balance: expected,
            difference,
            closed_at: new Date().toISOString(),
            notes: body.notes ?? (session as any).notes,
          } as never)
          .eq("user_id", auth.user.id)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });

        const totals = await sessionMovementTotals(auth.user.id, params.id);
        const actor = await actorFromUser(auth.user);
        await notify({
          userId: auth.user.id,
          type: "cash",
          severity: Math.abs(difference) > 0 ? "warning" : "success",
          title: "Cash session closed",
          message: `Closing ${closingBalance}, expected ${expected}, variance ${difference}`,
          link: "/cash-management",
          metadata: { id: params.id, action: "close", difference },
        });
        return json(
          toCashSessionApi(data as Record<string, unknown>, {
            cashierName: actor.actorName ?? "Unknown",
            totalIn: totals.totalIn,
            totalOut: totals.totalOut,
            movementCount: totals.movementCount,
          }),
        );
      },
    },
  },
});
