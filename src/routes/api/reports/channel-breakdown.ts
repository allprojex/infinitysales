import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, loadReportScope } from "./_helpers";

export const Route = createFileRoute("/api/reports/channel-breakdown")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb.from("sales").select("channel, total, status").eq("status", "completed");
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const agg = new Map<string, { channel: string; totalSales: number; revenue: number }>();
        for (const r of data ?? []) {
          const k = (r.channel ?? "pos") as string;
          const a = agg.get(k) ?? { channel: k, totalSales: 0, revenue: 0 };
          a.totalSales += 1;
          a.revenue += Number(r.total ?? 0);
          agg.set(k, a);
        }
        return json(Array.from(agg.values()));
      },
    },
  },
});
