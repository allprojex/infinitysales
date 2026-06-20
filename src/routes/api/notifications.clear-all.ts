import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/notifications/clear-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { error } = await sb.from("notifications").delete().eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        return json({ ok: true });
      },
    },
  },
});
