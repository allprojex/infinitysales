import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, apiToRow, rowToApi } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/cash-sessions/$id/movements")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const { data, error } = await sb.from("cash_movements").select("*")
          .eq("user_id", auth.user.id).eq("cash_session_id", params.id).order("occurred_at", { ascending: false });
        if (error) return json({ message: error.message }, { status: 500 });
        return json((data ?? []).map(rowToApi));
      },
      POST: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const row = { ...apiToRow(body), user_id: auth.user.id, cash_session_id: params.id };
        const { data, error } = await sb.from("cash_movements").insert(row).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        const dir = (data as any)?.type === "out" ? "out" : "in";
        await notify({
          userId: auth.user.id,
          type: "cash",
          severity: dir === "out" ? "warning" : "info",
          title: `Cash ${dir === "out" ? "withdrawal" : "deposit"}`,
          message: `${(data as any)?.amount ?? 0} – ${(data as any)?.reason ?? "movement"}`,
          link: "/cash-management",
          metadata: { id: (data as any)?.id, sessionId: params.id, action: "movement" },
        });
        return json(rowToApi(data));
      },
    },
  },
});
