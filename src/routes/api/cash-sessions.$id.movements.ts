import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, safeJson } from "./_resource-helpers";
import { notify } from "./_notify";
import { movementDelta, toCashMovementApi } from "./-cash-session-helpers";

export const Route = createFileRoute("/api/cash-sessions/$id/movements")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("cash_movements")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("cash_session_id", params.id)
          .order("occurred_at", { ascending: false });
        if (error) return json({ message: error.message }, { status: 500 });
        return json((data ?? []).map((row) => toCashMovementApi(row)));
      },
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        const amount = Number(body.amount ?? 0);
        const row = {
          user_id: auth.user.id,
          cash_session_id: params.id,
          type: body.type || "cash_in",
          amount,
          reference: body.reference || null,
          // cash_movements has no "notes" column — the frontend's free-text
          // notes field is stored in "reason" instead.
          reason: body.notes || null,
        };
        const { data, error } = await (sb as any)
          .from("cash_movements")
          .insert(row)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });

        const dir = movementDelta((data as any).type, 1) > 0 ? "in" : "out";
        await notify({
          userId: auth.user.id,
          type: "cash",
          severity: dir === "out" ? "warning" : "info",
          title: `Cash ${dir === "out" ? "withdrawal" : "deposit"}`,
          message: `${(data as any)?.amount ?? 0} – ${(data as any)?.reference || (data as any)?.reason || "movement"}`,
          link: "/cash-management",
          metadata: { id: (data as any)?.id, sessionId: params.id, action: "movement" },
        });
        return json(toCashMovementApi(data as Record<string, unknown>));
      },
    },
  },
});
