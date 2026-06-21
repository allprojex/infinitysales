import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, monthKey, loadReportScope } from "./_helpers";

export const Route = createFileRoute("/api/reports/revenue")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const url = new URL(request.url);
        const months = Math.min(parseInt(url.searchParams.get("months") ?? "6", 10) || 6, 24);
        const start = new Date();
        start.setMonth(start.getMonth() - (months - 1));
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        let q = sb
          .from("sales")
          .select("total, sold_at, status")
          .eq("status", "completed")
          .gte("sold_at", start.toISOString());
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const buckets = new Map<string, { revenue: number; sales: number }>();
        for (let i = 0; i < months; i++) {
          const d = new Date(start);
          d.setMonth(d.getMonth() + i);
          buckets.set(monthKey(d), { revenue: 0, sales: 0 });
        }
        for (const r of data ?? []) {
          const k = monthKey(r.sold_at as string);
          const b = buckets.get(k);
          if (b) {
            b.revenue += Number(r.total ?? 0);
            b.sales += 1;
          }
        }
        return json(
          Array.from(buckets.entries()).map(([month, v]) => ({
            month,
            revenue: v.revenue,
            sales: v.sales,
          })),
        );
      },
    },
  },
});
