import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, rowToApi } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/cash-sessions/$id/close")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const closingBalance = Number(body.closingBalance ?? 0);
        const { data: session } = await sb.from("cash_sessions").select("*")
          .eq("user_id", auth.user.id).eq("id", params.id).maybeSingle();
        if (!session) return json({ message: "Not found" }, { status: 404 });
        const opening = Number((session as any).opening_balance ?? 0);
        const { data: movs } = await sb.from("cash_movements").select("type,amount")
          .eq("user_id", auth.user.id).eq("cash_session_id", params.id);
        const movTotal = (movs ?? []).reduce((s: number, m: any) => s + (m.type === "out" ? -Number(m.amount) : Number(m.amount)), 0);
        const expected = opening + movTotal;
        const difference = closingBalance - expected;
        const { data, error } = await sb.from("cash_sessions").update({
          status: "closed",
          closing_balance: closingBalance,
          expected_balance: expected,
          difference,
          closed_at: new Date().toISOString(),
          notes: body.notes ?? (session as any).notes,
        }).eq("user_id", auth.user.id).eq("id", params.id).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "cash",
          severity: Math.abs(difference) > 0 ? "warning" : "success",
          title: "Cash session closed",
          message: `Closing ${closingBalance}, expected ${expected}, variance ${difference}`,
          link: "/cash-management",
          metadata: { id: params.id, action: "close", difference },
        });
        return json(rowToApi(data));
      },
    },
  },
});
