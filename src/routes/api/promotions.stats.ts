import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/promotions/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const now = new Date().toISOString();
        const [activeRes, totalRes, expiredRes] = await Promise.all([
          sb.from("promotions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
          sb.from("promotions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
          sb.from("promotions").select("id", { count: "exact", head: true }).eq("user_id", user.id).lt("ends_at", now),
        ]);
        if (activeRes.error) return errorJson(500, activeRes.error.message);
        return json({
          active: activeRes.count ?? 0,
          total: totalRes.count ?? 0,
          expired: expiredRes.count ?? 0,
          totalRedemptions: 0,
        });
      },
    },
  },
});
