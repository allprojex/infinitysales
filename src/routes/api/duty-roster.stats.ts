import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/duty-roster/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await sb
          .from("duty_roster")
          .select("user_name, shift_date")
          .eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        const rows = data ?? [];
        let todayShifts = 0;
        const counts: Record<string, number> = {};
        for (const r of rows) {
          if (r.shift_date === today) todayShifts++;
          counts[r.user_name] = (counts[r.user_name] || 0) + 1;
        }
        const topUsers = Object.entries(counts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        return json({ todayShifts, totalShifts: rows.length, topUsers });
      },
    },
  },
});
