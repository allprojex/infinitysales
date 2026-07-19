import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/notifications/$id/read")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { error } = await sb
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .eq("id", params.id);
        if (error) return errorJson(500, error.message);
        return json({ ok: true });
      },
    },
  },
});
