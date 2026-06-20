import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/notifications/read-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { error } = await sb.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
        if (error) return errorJson(500, error.message);
        return json({ ok: true });
      },
    },
  },
});
