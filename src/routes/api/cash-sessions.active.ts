import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, rowToApi, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/cash-sessions/active")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("cash_sessions").select("*").eq("user_id", user.id).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
        if (error) return errorJson(500, error.message);
        return json(data ? rowToApi(data) : null);
      },
    },
  },
});
