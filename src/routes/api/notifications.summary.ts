import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/notifications/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const [{ count: total }, { count: unread }] = await Promise.all([
          sb
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
          sb
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_read", false),
        ]);
        return json({ total: total ?? 0, unread: unread ?? 0 });
      },
    },
  },
});
