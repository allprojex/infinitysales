import { createFileRoute } from "@tanstack/react-router";
import { apiToRow, errorJson, json, requireUser, rowToApi, safeJson, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/pos/connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.id) return errorJson(400, "id is required");
        const row = { ...apiToRow(body), status: "connected", last_connected_at: new Date().toISOString() };
        const { data, error } = await sb.from("pos_connections").update(row as any).eq("user_id", user.id).eq("id", body.id).select("*").single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
