import { createFileRoute } from "@tanstack/react-router";
import { apiToRow, errorJson, json, requireUser, rowToApi, safeJson, sb } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/cash-sessions/open")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const row = { ...apiToRow(body), user_id: user.id, status: "open", opened_at: new Date().toISOString() };
        const { data, error } = await sb.from("cash_sessions").insert(row as any).select("*").single();
        if (error) return errorJson(500, error.message);
        await notify({
          userId: user.id,
          type: "cash",
          severity: "success",
          title: "Cash session opened",
          message: `Opening balance ${(data as any)?.opening_balance ?? 0}`,
          link: "/cash-management",
          metadata: { id: (data as any)?.id, action: "open" },
        });
        return json(rowToApi(data));
      },
    },
  },
});
